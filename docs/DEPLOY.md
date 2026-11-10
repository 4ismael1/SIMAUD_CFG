# Despliegue de SIMAUD en la universidad

Guía para un host Linux con Docker Engine y Docker Compose v2. Ejecutar desde la raíz del repositorio. Los comandos de esta guía usan una shell POSIX. No requieren Node ni npm en el servidor de destino.

## Condiciones previas a producción

- La API usa HOST=127.0.0.1 por defecto; Compose fija HOST=0.0.0.0 dentro del contenedor sin publicar su puerto.
- La web aún importa Google Fonts en src/index.css. Autoalojar Geist, Geist Mono y Source Serif 4, con sus licencias, y eliminar esa importación antes del build final. La CSP las bloquea y mientras tanto se usan fuentes de reserva. No se necesita Internet para los PDF: las fuentes Roboto de api/assets/fonts ya están en la imagen.
- **No ejecutar db:seed en producción.** Crear solo el primer administrador con el comando descrito abajo.
- Probar los flujos reales con la CSP estricta: firmas, gráficos, documentos y exportaciones. Los estilos inline de librerías o contenido de plantillas requieren adaptación del frontend si el navegador los bloquea. No añadir unsafe-inline para evitar esa revisión.

## Requisitos y preparación

1. Host Linux con arquitectura igual a la de las imágenes preparadas (por ejemplo linux/amd64), Docker con plugin Compose v2 y espacio para BD, uploads y hasta once juegos de backup. Usar disco local fiable para PostgreSQL.
2. DNS institucional para el dominio; firewall entrante solo 80/443 y administración restringida. PostgreSQL y API no publican puertos. API necesita salida HTTPS a api.resend.com si MAIL_DRIVER=resend, o al SMTP institucional si MAIL_DRIVER=smtp.
3. Certificado y cadena válidos para ese dominio. Guardar fullchain.pem y privkey.pem en deploy/certs, con acceso solo a TI. El directorio completo se monta como solo lectura para que las sustituciones de archivos se vean dentro del contenedor.
4. Copiar la plantilla de variables y preparar los directorios:

```sh
umask 077
cp deploy/.env.prod.example .env.prod
mkdir -p deploy/certs deploy/backups
chmod 700 deploy/certs deploy/backups
chmod 600 .env.prod
openssl rand -hex 32
openssl rand -base64 48
```

Introducir los valores generados en POSTGRES_PASSWORD/DATABASE_URL y JWT_ACCESS_SECRET respectivamente. No guardarlos en tickets ni capturas. En la URL de BD usar db:5432, nunca el túnel de desarrollo. Si las contraseñas contienen caracteres especiales, codificarlos como componentes de URL; hexadecimal evita ese problema para PostgreSQL. SMTP_URL también debe llevar credenciales codificadas. Usar smtps con 465 o el esquema admitido por el servidor SMTP y comprobar su TLS.

SERVER_NAME contiene solo el nombre DNS, sin esquema ni barras. APP_URL es el origen HTTPS público correspondiente, sin ruta. DATABASE_URL_TEST no es necesaria en producción; omitirla y no ejecutar tests contra producción. NODE_ENV, HOST, PORT, TRUST_PROXY y JOBS_ENABLED están fijados por Compose. No definir SEED_PASSWORD.

.env.prod no está cubierto por el .gitignore actual. Excluir localmente /.env.prod, /deploy/certs/ y /deploy/backups/ mediante .git/info/exclude, o mantener la instalación sin Git. Nunca versionar secretos, certificados privados ni backups. Los contextos Docker usan listas de inclusión y excluyen los archivos de entorno.

Definir este atajo en cada sesión administrativa:

```sh
PROJECT=simaud
dc() {
    docker compose -p "$PROJECT" --env-file .env.prod -f docker-compose.prod.yml "$@"
}
```

Siempre pasar --env-file: Compose necesita esas variables para interpolar imágenes, credenciales y rutas. El env_file del servicio API por sí solo no interpola el YAML. No ejecutar config sin --quiet en registros compartidos: su salida expandida contiene secretos.

## Preparar las imágenes fuera del servidor sin Internet

En una máquina con conectividad y la misma arquitectura, después de resolver las condiciones previas y verificar el código:

```sh
dc --profile tools config --quiet
dc build api web backup
docker image inspect postgres:17-alpine
```

Si la imagen de PostgreSQL no está presente, TI debe obtenerla previamente en esa máquina de preparación, nunca durante el despliegue offline. Los builds instalan dependencias desde lockfiles; la imagen final de API contiene solo dependencias de producción, migraciones y recursos PDF. No contiene tsx ni necesita npm al arrancar. Las fuentes de web deben estar incluidas antes del build. Fijar SIMAUD_VERSION con una etiqueta distinta en cada entrega y conservar las imágenes anteriores; las etiquetas base son móviles, por lo que también conviene registrar sus digest en el inventario de la entrega.

Con la versión de ejemplo (ajustar los tres nombres a SIMAUD_VERSION):

```sh
docker save -o simaud-images.tar simaud-api:2026.11.09-1 simaud-web:2026.11.09-1 simaud-backup:2026.11.09-1 postgres:17-alpine
sha256sum simaud-images.tar > simaud-images.tar.sha256
```

Trasladar el repositorio o paquete de configuración, el tar y su checksum por un medio autorizado. Los secretos y certificados se trasladan por separado. En el servidor:

```sh
sha256sum -c simaud-images.tar.sha256
docker load -i simaud-images.tar
dc --profile tools config --quiet
```

No construir ni descargar imágenes en destino. Los comandos up y run siguientes usan --pull never; up también usa --no-build.

## Primera instalación

Instalar certificados y completar .env.prod antes de arrancar nginx. DATABASE_URL y las variables POSTGRES deben apuntar a la misma BD y usuario. El usuario creado por la imagen PostgreSQL es propietario de la BD; no exponer sus credenciales fuera del equipo TI.

```sh
dc up -d --no-build --pull never db
dc --profile tools run --rm --pull never migrate
dc up -d --no-build --pull never api
dc ps
dc exec api node --input-type=module -e "const response = await fetch('http://127.0.0.1:3000/api/v1/health'); console.log(response.status); process.exit(response.ok ? 0 : 1);"
```

Las migraciones son explícitas y fallan con código distinto de cero. No continuar si fallan. Crear el administrador antes de abrir tráfico:

```sh
dc exec api node dist/db/create-admin.js --name "Administración" --email admin@universidad.example --cedula 001-1234567-8
```

La contraseña temporal se genera y muestra una sola vez después de confirmar la creación. Guardarla en un gestor de contraseñas. También admite ADMIN_NAME, ADMIN_EMAIL, ADMIN_CEDULA y ADMIN_PASSWORD mediante un entorno protegido; una contraseña proporcionada no se imprime. No pasar la contraseña por argumentos. Si el email ya existe no modifica la cuenta. El usuario queda admin con correo confirmado y must_change_password=true. El login devuelve user.mustChangePassword; hasta cambiarla, solo permite PATCH /api/v1/me/password y logout entre las operaciones de sesión. El cambio recibe currentPassword/newPassword y Bearer; el resto responde PASSWORD_CHANGE_REQUIRED. No se requiere seed ni tsx.

Continuar:

```sh
dc up -d --no-build --pull never web backup
dc exec web nginx -t
curl --fail --head http://simaud.universidad.example/
curl --fail --head https://simaud.universidad.example/
curl --fail https://simaud.universidad.example/api/v1/health
```

Esperar redirección HTTP 308, HTTPS 200 y salud con status/db igual a ok. Verificar login, refresh/logout, enlace de recuperación por correo, uploads, firma, PDF, notificaciones SSE y reconexión. Comprobar en navegador que no haya violaciones CSP. Confirmar que una petición de API a través de nginx registra la IP real en los controles que la necesiten.

## Actualizar una versión

1. Preparar y cargar imágenes nuevas; conservar las etiquetas anteriores. Revisar migraciones y compatibilidad de esquema. Guardar una copia protegida de .env.prod para recuperación.
2. Programar mantenimiento y detener las escrituras; el proxy y los jobs también se detienen. Hacer un juego consistente antes de migrar:

```sh
dc stop web api backup
dc run --rm --no-deps --pull never --entrypoint /bin/sh backup /opt/backup/backup.sh
```

3. Cambiar SIMAUD_VERSION en .env.prod a la nueva entrega. Validar configuración y aplicar migraciones:

```sh
dc --profile tools config --quiet
dc --profile tools run --rm --pull never migrate
dc up -d --no-build --pull never api web backup
```

4. Repetir comprobaciones de salud, SMTP, navegador y SSE. Si una migración falla, mantener mantenimiento y revisar logs. Revertir solo imágenes es seguro únicamente si el esquema sigue siendo compatible; de lo contrario recuperar el juego previo completo en un proyecto nuevo. No ejecutar down -v ni borrar volúmenes para actualizar.

## Almacenamiento configurable

El driver inicial es `disk`, con raíz privada `storage` relativa al directorio de trabajo de la API. El volumen debe pertenecer al usuario de la API y permanecer fuera de cualquier ruta publicada por nginx. Se aplican permisos 0700 a carpetas y 0600 a archivos en Linux. El montaje debe admitir enlaces duros para publicar objetos completos sin sobrescribir evidencia existente. En Windows de desarrollo se omite chmod.

Definir `SETTINGS_ENCRYPTION_KEY` antes de arrancar la API o ejecutar migraciones en desarrollo y producción. Debe contener 64 caracteres hexadecimales. Generarla de forma independiente de las claves de correo y JWT mediante `openssl rand -hex 32`, y conservarla en el gestor de secretos y en la recuperación protegida del entorno. La configuración de almacenamiento se cifra con AES-256-GCM dentro de `settings`; las firmas nuevas usan una subclave derivada mediante HKDF y AES-256-GCM también en S3. Las evidencias históricas sin envoltura cifrada siguen siendo legibles. Perder o sustituir esta clave impide descifrar la configuración y las firmas nuevas. La rotación requiere un procedimiento de recifrado fuera de esta entrega.

Aplicar `0009_t11_storage` junto con las migraciones de la entrega. El administrador configura el destino mediante `PUT /api/v1/system/storage`. Para disco enviar `{"driver":"disk"}`. Para S3 enviar `driver`, `endpoint`, `region`, `bucket`, `accessKeyId` y `secretAccessKey`. Los campos opcionales son `prefix`, vacío por defecto, y `forcePathStyle`, falso por defecto. Omitir `secretAccessKey` conserva la guardada. `GET /api/v1/system/storage` devuelve la configuración activa, `pending` y `migrating`, con `hasSecret` y `accessKeyLast4`. La prueba previa debe completar escritura, lectura, comparación y movimiento a papelera antes de guardar. `POST /api/v1/system/storage/test` recibe el mismo cuerpo y devuelve `ok`, `latencyMs` y `steps` sin guardar. PUT y test tienen límite de diez solicitudes por minuto por administrador.

El endpoint S3 debe usar HTTPS y carecer de credenciales, ruta y query. HTTP se admite únicamente para localhost en desarrollo y pruebas. El bucket debe ser privado y dedicado a SIMAUD o usar un prefijo exclusivo. Conceder lectura, escritura, copia, borrado y listado dentro de ese ámbito. Los objetos se sirven mediante los controles de acceso existentes de la API. Los presets de R2, AWS, B2, Spaces y MinIO figuran en `docs/tasks/T11-almacenamiento.REPORT.md`.

Si existen referencias y cambia la ubicación, PUT conserva el origen activo y guarda el destino en `pending`. Ejecutar `POST /api/v1/system/storage/migrate` para iniciar el job y consultar `GET /api/v1/system/jobs`, entrada `storage-migrate`. Su respuesta inicial es 202 con `jobId`. Durante la copia las lecturas usan el origen y las operaciones que cambian archivos reciben 503. El job comprueba tamaño y SHA-256 de cada objeto, incluidos los PDF finales contra la huella registrada, y activa el destino en una transacción únicamente cuando todos están verificados. Conserva los archivos originales. Tras un fallo o reinicio, repetir migrate reanuda el mismo job, comprueba las copias existentes y evita duplicarlas. Las escrituras permanecen bloqueadas hasta completar la migración o guardar otra configuración válida que descarte el intento pendiente. El cierre normal de la API espera al job en ejecución.

La papelera local conserva `.trash/AAAA-MM-DD/`; S3 usa `trash/AAAA-MM-DD/` bajo el prefijo configurado. `cleanup` purga fechas con más de ocho días en disco, en el proveedor activo y en los proveedores anteriores conservados cifrados para este fin. El lock 10409 sigue compartido con las copias de seguridad; el lock 10411 coordina las operaciones completas de archivos y las migraciones. Una migración grande mantiene estos locks durante toda la ejecución, por lo que debe programarse fuera de la ventana de backup.

Los scripts actuales de backup y restauración capturan el volumen local. Al usar S3, TI debe incorporar una copia cifrada externa de los buckets/prefijos activos y anteriores, incluida su papelera, y restaurarlos junto con BD, volumen local y la misma clave de cifrado. La captura debe compartir el lock 10409 durante el dump y la copia remota para mantener la coherencia. `check-references.sh` verifica rutas locales; una restauración S3 requiere comprobar además los objetos remotos y sus huellas. Validar ese procedimiento en un entorno aislado antes de activar un proveedor remoto en producción.

## Backups y control diario

El servicio backup ejecuta a las 02:00 UTC un pg_dump -Fc y un tar de todo storage; incluye avatares, firmas y PDF. Retiene hasta siete juegos diarios y cuatro semanales (los domingos). Cada juego contiene database.dump, storage.tar.gz y SHA256SUMS. Los juegos parciales no se rotan ni se anuncian como completos. Un backup manual también cuenta para la retención diaria. El servicio no ejecuta una copia al arrancar: hacer una primera copia y revisar su resultado.

```sh
dc run --rm --no-deps --pull never --entrypoint /bin/sh backup /opt/backup/backup.sh
dc logs --tail=100 backup
```

Los borrados y reemplazos mueven los archivos a `storage/.trash/AAAA-MM-DD/`, conservando su subcarpeta y nombre. El job `cleanup` purga solo días con **más de ocho días** de antigüedad UTC. El tar incluye la papelera: una referencia del snapshot de BD puede apuntar a un objeto movido antes de capturarlo. Cada juego diario o semanal conserva su propia copia de esos bytes, independientemente de la purga posterior del volumen activo.

La API, la purga y `backup.sh` comparten el advisory lock PostgreSQL **10409**. La copia lo mantiene en una conexión dedicada desde antes de `pg_dump` hasta finalizar `tar`; así ningún movimiento puede cambiar un archivo de carpeta mientras `tar` recorre el volumen. Los archivos tienen nombres inmutables y no se sobrescriben. No excluir `.trash` ni sustituir `capture.sh` por un tar sin ese bloqueo. Una interrupción de la conexión libera el lock; si falla la captura, el juego no se publica. No hace falta escritura en el montaje de storage del contenedor de backup. Si falla una copia por una carga nueva aún en escritura, investigar y repetirla; el juego parcial no se considera recuperable.

TI debe monitorizar la existencia y edad del último juego, espacio libre y errores del contenedor; copiar juegos cifrados a otro servidor o medio. La rotación local no protege ante pérdida del host. Probar una restauración periódica en un entorno aislado. Las copias contienen datos personales y firmas; restringir su acceso. Si una caída brusca deja .backup-lock, comprobar que no haya un proceso activo antes de retirar ese directorio vacío; revisar también los .partial.

## Restaurar en volúmenes nuevos

Solo restaurar juegos de confianza. No ejecutar contra la aplicación en servicio. El script exige RESTORE_CONFIRM igual al nombre de BD, verifica checksums y que storage esté vacío. Restaura la BD en una transacción, después los archivos con uid/gid conservados; si falla tar, mantener la aplicación parada y repetir sobre otro volumen vacío.

Después de extraer, `check-references.sh` contrasta `files.path`, `users.avatar_path`, `contract_signatories.signature_path` y `contracts.signed_pdf_path` con storage. Recupera desde la papelera los objetos referenciados que falten en su ubicación original, conserva permisos y lista cada recuperación. Lista referencias faltantes o inválidas y termina con error si no puede resolverlas; mantener la aplicación parada hasta resolverlas. No cambia las filas restauradas. Esta verificación comprueba presencia de objetos; la descarga del PDF final conserva además su comprobación SHA-256.

Conservar el proyecto original completo para volver atrás. En .env.prod fijar BACKUP_DIR a la ruta absoluta del directorio que contiene daily/weekly y comprobar que el servidor dispone de las imágenes de la versión respaldada. No cambiar credenciales ni nombre de BD durante la recuperación. Ejemplo de fecha y nombre de BD a sustituir:

```sh
dc stop web api backup
PROJECT=simaud-recovery
dc up -d --no-build --pull never db
dc -f deploy/restore.compose.yml run --rm --no-deps --pull never -e RESTORE_CONFIRM=simaud --entrypoint /bin/sh backup /opt/backup/restore.sh /backups/daily/2026-11-09T020000Z
```

El nombre de proyecto nuevo crea database y storage nuevos. El override habilita escritura en storage únicamente para restaurar y monta backups como solo lectura. Si existe un proyecto previo llamado simaud-recovery, elegir un nombre diferente; nunca reutilizar volúmenes con datos. Verificar que no haya otros clientes conectados a la BD de recuperación.

Arrancar inicialmente las imágenes que produjeron el backup; el dump incluye el registro de migraciones de Drizzle. Aplicar migraciones posteriores solo al actualizar desde esa versión. Tras una restauración correcta:

```sh
dc up -d --no-build --pull never api web backup
dc ps
curl --fail https://simaud.universidad.example/api/v1/health
```

Comprobar documentos, avatares y firmas, permisos de storage (usuario node, uid/gid 1000) y acceso de usuarios antes de reabrir tráfico. El proyecto original sigue detenido y conservado. Para volver a él, detener primero api/web/backup del proyecto de recuperación, establecer PROJECT=simaud y arrancar el original; no mantener dos schedulers activos sobre una misma BD.

## Certificados, logs y solución de problemas

TI renueva los certificados mediante la CA institucional o su mecanismo ACME externo. La imagen no solicita certificados ni requiere Internet. Sustituir fullchain.pem/privkey.pem en el directorio montado, manteniendo permisos restrictivos, y validar antes de recargar:

```sh
dc exec web nginx -t
dc exec web nginx -s reload
dc logs --tail=100 api web db backup
```

Los logs Docker rotan a tres archivos de 10 MiB por servicio. No registrar tokens, cookies, cuerpos ni URLs completas en herramientas externas. nginx registra método y ruta sin query ni Referer; el error_log de SSE se suprime para no filtrar su ticket.

| Síntoma                                  | Comprobación                                                                                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 502 con API healthy                      | Comprobar HOST=0.0.0.0 en API, DNS interno y puerto 3000.                                                                                                     |
| API unhealthy                            | BD healthy, DATABASE_URL, migraciones, secretos de longitud válida y MAIL_DRIVER, MAIL_FROM y credenciales del proveedor.                                     |
| nginx no arranca                         | Certificados montados con nombres correctos, clave legible, SERVER_NAME y nginx -t.                                                                           |
| Sesión no persiste / 403 de origen       | Acceder por HTTPS, APP_URL idéntico al origen público, cookies Secure y proxy de un salto.                                                                    |
| SSE tarda en entregar                    | Usar /api/v1/events, buffering/gzip desactivados y revisar proxies institucionales anteriores.                                                                |
| Fuentes o estilos ausentes               | Autoalojar fuentes; revisar consola CSP y adaptar estilos inline en frontend.                                                                                 |
| Upload falla                             | API limita archivo y JSON a 2 MiB; nginx permite 3 MiB para el sobre multipart. Revisar uid/gid de storage.                                                   |
| Correo no llega                          | MAIL_DRIVER, outbox en GET /system/jobs, credenciales, dominio verificado o salida SMTP y TLS.                                                                |
| Backup no aparece                        | 02:00 UTC, permisos del bind BACKUP_DIR, disco libre, logs y bloqueos residuales.                                                                             |
| Cambió la contraseña de BD y falla login | POSTGRES_PASSWORD solo inicializa un volumen vacío. Rotar el rol de forma controlada y actualizar DATABASE_URL; cambiar .env.prod no altera un rol existente. |

Las redes database y proxy son internas. Solo web publica 80/443. API tiene red mail para salida HTTPS a Resend o SMTP y web tiene red public para entrada. TRUST_PROXY=1 supone exactamente un proxy nginx antes de Fastify: si TI añade otro proxy, revisar expresamente esta cadena y la sobrescritura de X-Forwarded-For.

## Correo: Resend y SMTP institucional

Con MAIL_DRIVER=resend, añadir en el panel de Resend un dominio o subdominio institucional bajo control de TI. Copiar los registros SPF/DKIM generados por Resend en el DNS institucional y esperar a que el panel indique verificado. Usar exactamente los nombres, tipos y valores generados, sin sustituirlos por ejemplos. Definir MAIL_FROM con una dirección de ese dominio y RESEND_API_KEY con una clave de envío. Configurar MAIL_REPLY_TO si las respuestas deben ir a soporte. [Documentación oficial para verificar dominio y DNS](https://resend.com/docs/add-a-domain).

Para pasar a correo institucional basta cambiar MAIL_DRIVER=smtp, quitar RESEND_API_KEY y definir SMTP_URL (por ejemplo smtps://usuario:clave@smtp.universidad.example:465, con usuario/clave codificados como URL). Mantener MAIL_FROM autorizado por ese servidor y MAIL_REPLY_TO si aplica. No desactivar la verificación de certificados TLS. Reiniciar/recrear la API para cargar las variables:

```sh
dc up -d --no-build --pull never --force-recreate api
```

No se usa log en producción: el arranque falla si falta un proveedor real o su configuración. En desarrollo log solo imprime destinatario, asunto y tipo, sin cuerpo ni enlaces. Los correos de confirmación, recuperación, invitación, firmas, aprobación/devolución, activación, vencimientos 30/15/7/1 y renovaciones se encolan dentro de sus transacciones. Las preferencias controlan avisos; los correos de seguridad siempre se encolan.

Para probar envío real, iniciar sesión como admin tras cambiar la contraseña temporal y realizar POST /api/v1/system/mail/test con JSON {"to":"buzon-controlado@universidad.example"} y Authorization Bearer. Debe responder 202 con id. Esperar al siguiente minuto con JOBS_ENABLED=true o ejecutar POST /api/v1/system/jobs/email-dispatch/run con el mismo Bearer. Consultar GET /api/v1/system/jobs: email-dispatch incluye outbox.pending y outbox.failed; revisar summary y confirmar recepción de HTML y texto en el buzón controlado. No registrar JWT, claves o enlaces de seguridad en terminales compartidos.

La outbox reintenta fallos temporales hasta 6 intentos con esperas exponenciales (1/2/4/8/16 minutos); 4xx permanentes marcan failed sin reintento. 429, 5xx, HTTP 408 y timeouts son temporales. Cada correo se bloquea al despacharse y el job usa advisory lock entre instancias. En Resend la clave de idempotencia es el id de outbox; [su ventana es de 24 horas](https://resend.com/docs/dashboard/emails/idempotency-keys). SMTP conserva Message-ID, pero una caída entre aceptación y commit puede repetir una entrega. Esta limitación requiere conciliación operativa, no reintentos manuales indiscriminados.

Los enviados se limpian tras 30 días y se vacía su payload al entregarlos. Los payloads pendientes/fallidos pueden incluir tokens: proteger BD y backups. No hay reenvío automático de failed: corregir la configuración y solicitar un nuevo enlace/aviso o un correo de prueba. La respuesta de Resend/SMTP se sanea antes de guardar last_error.
