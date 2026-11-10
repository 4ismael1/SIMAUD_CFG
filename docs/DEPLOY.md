# Despliegue de SIMAUD en la universidad

Guía para un host Linux con Docker Engine y Docker Compose v2. Ejecutar desde la raíz del repositorio. Los comandos de esta guía usan una shell POSIX. No requieren Node ni npm en el servidor de destino.

## Condiciones previas a producción

- **Bloqueante actual:** api/src/server.ts escucha en 127.0.0.1. El responsable de la API debe permitir 0.0.0.0 dentro del contenedor (preferiblemente mediante HOST validado, con valor local seguro por defecto). No publicar puertos de API como solución. Hasta corregirlo, su healthcheck local puede pasar pero nginx dará 502.
- La web aún importa Google Fonts en src/index.css. Autoalojar Geist, Geist Mono y Source Serif 4, con sus licencias, y eliminar esa importación antes del build final. La CSP las bloquea y mientras tanto se usan fuentes de reserva. No se necesita Internet para los PDF: las fuentes Roboto de api/assets/fonts ya están en la imagen.
- El seed existente crea cuatro cuentas de demostración, datos y contratos de ejemplo. **No ejecutar db:seed en producción.** Falta un comando que cree solo el primer administrador con email institucional y contraseña segura. El equipo de API debe entregarlo antes de abrir el servicio. No promover cuentas con SQL improvisado ni usar credenciales demo.
- Probar los flujos reales con la CSP estricta: firmas, gráficos, documentos y exportaciones. Los estilos inline de librerías o contenido de plantillas requieren adaptación del frontend si el navegador los bloquea. No añadir unsafe-inline para evitar esa revisión.

## Requisitos y preparación

1. Host Linux con arquitectura igual a la de las imágenes preparadas (por ejemplo linux/amd64), Docker con plugin Compose v2 y espacio para BD, uploads y hasta once juegos de backup. Usar disco local fiable para PostgreSQL.
2. DNS institucional para el dominio; firewall entrante solo 80/443 y administración restringida. PostgreSQL y API no publican puertos. API necesita alcanzar SMTP institucional; no necesita salida general a Internet durante la ejecución.
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

SERVER_NAME contiene solo el nombre DNS, sin esquema ni barras. APP_URL es el origen HTTPS público correspondiente, sin ruta. DATABASE_URL_TEST es una URL inerte obligatoria por el validador actual; no se crea esa BD y no se ejecutan tests contra producción. NODE_ENV, PORT, TRUST_PROXY y JOBS_ENABLED están fijados por Compose. No definir SEED_PASSWORD.

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

Las migraciones son explícitas y fallan con código distinto de cero. No continuar si fallan. Ejecutar después el futuro comando de primer administrador revisado por el equipo de API. El paquete actual no permite completar ese paso de producción: no sustituirlo por el seed de demostración.

Después de resolver ese pendiente:

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

## Backups y control diario

El servicio backup ejecuta a las 02:00 UTC un pg_dump -Fc y un tar de todo storage; incluye avatares, firmas y PDF. Retiene hasta siete juegos diarios y cuatro semanales (los domingos). Cada juego contiene database.dump, storage.tar.gz y SHA256SUMS. Los juegos parciales no se rotan ni se anuncian como completos. Un backup manual también cuenta para la retención diaria. El servicio no ejecuta una copia al arrancar: hacer una primera copia y revisar su resultado.

```sh
dc run --rm --no-deps --pull never --entrypoint /bin/sh backup /opt/backup/backup.sh
dc logs --tail=100 backup
```

El dump online es coherente para PostgreSQL; la copia de archivos posterior no es una instantánea conjunta con la BD mientras hay escrituras. Para una copia consistente de ambos recursos, detener web/api/backup y ejecutar el mismo comando, como en una actualización. Una modificación de uploads durante tar puede hacer fallar el juego; investigar y repetirlo en mantenimiento.

TI debe monitorizar la existencia y edad del último juego, espacio libre y errores del contenedor; copiar juegos cifrados a otro servidor o medio. La rotación local no protege ante pérdida del host. Probar una restauración periódica en un entorno aislado. Las copias contienen datos personales y firmas; restringir su acceso. Si una caída brusca deja .backup-lock, comprobar que no haya un proceso activo antes de retirar ese directorio vacío; revisar también los .partial.

## Restaurar en volúmenes nuevos

Solo restaurar juegos de confianza. No ejecutar contra la aplicación en servicio. El script exige RESTORE_CONFIRM igual al nombre de BD, verifica checksums y que storage esté vacío. Restaura la BD en una transacción, después los archivos con uid/gid conservados; si falla tar, mantener la aplicación parada y repetir sobre otro volumen vacío.

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
| 502 con API healthy                      | Resolver el bind 127.0.0.1 del servidor API. Revisar DNS interno y puerto 3000.                                                                               |
| API unhealthy                            | BD healthy, DATABASE_URL, migraciones, secretos de longitud válida y SMTP_URL obligatorio.                                                                    |
| nginx no arranca                         | Certificados montados con nombres correctos, clave legible, SERVER_NAME y nginx -t.                                                                           |
| Sesión no persiste / 403 de origen       | Acceder por HTTPS, APP_URL idéntico al origen público, cookies Secure y proxy de un salto.                                                                    |
| SSE tarda en entregar                    | Usar /api/v1/events, buffering/gzip desactivados y revisar proxies institucionales anteriores.                                                                |
| Fuentes o estilos ausentes               | Autoalojar fuentes; revisar consola CSP y adaptar estilos inline en frontend.                                                                                 |
| Upload falla                             | API limita archivo y JSON a 2 MiB; nginx permite 3 MiB para el sobre multipart. Revisar uid/gid de storage.                                                   |
| Correo no llega                          | Ruta de salida a SMTP institucional, DNS, credenciales codificadas y TLS del servidor SMTP.                                                                   |
| Backup no aparece                        | 02:00 UTC, permisos del bind BACKUP_DIR, disco libre, logs y bloqueos residuales.                                                                             |
| Cambió la contraseña de BD y falla login | POSTGRES_PASSWORD solo inicializa un volumen vacío. Rotar el rol de forma controlada y actualizar DATABASE_URL; cambiar .env.prod no altera un rol existente. |

Las redes database y proxy son internas. Solo web publica 80/443. API tiene red mail para salida SMTP y web tiene red public para entrada. TRUST_PROXY=1 supone exactamente un proxy nginx antes de Fastify: si TI añade otro proxy, revisar expresamente esta cadena y la sobrescritura de X-Forwarded-For.
