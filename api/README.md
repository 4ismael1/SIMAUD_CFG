# SIMAUD API

Backend independiente del frontend: Node 24, TypeScript estricto y ESM, Fastify 5, PostgreSQL y Drizzle.

## Arranque

Desde `api/`, utiliza el túnel PostgreSQL abierto en `127.0.0.1:55432` y un archivo `.env` basado en `.env.example`. No publiques este archivo.

```sh
npm install
npm run db:migrate
npm run db:seed
npm test
npm run typecheck
npm run build
npm run dev
```

La API escucha en `http://127.0.0.1:3000` por defecto. `GET /api/v1/health` consulta PostgreSQL y responde `{"status":"ok","db":"ok"}`. `npm start` ejecuta el resultado compilado.

Variables obligatorias: `DATABASE_URL`, `JWT_ACCESS_SECRET` (mínimo 32 caracteres), `APP_URL`; `PORT` vale 3000 por defecto. `NODE_ENV` admite development, test y production. `DATABASE_URL_TEST` solo es obligatoria en test. `HOST` vale `127.0.0.1` por defecto; Compose usa `0.0.0.0`. En producción `MAIL_DRIVER` debe ser `resend` o `smtp`, con `MAIL_FROM` obligatorio. La configuración se valida al arrancar y sus valores no aparecen en errores.

En desarrollo/test `MAIL_DRIVER=log` registra solo destinatario, asunto y tipo; no imprime cuerpos ni enlaces con token. En producción se usan Resend o SMTP y cookies Secure. El origen permitido por CORS y la comprobación de Origin de las mutaciones se derivan de `APP_URL`. No se confía en cabeceras de proxy: configura explícitamente un proxy de confianza antes de desplegar detrás de uno si necesitas la IP del cliente.

## Scripts y base de datos

| Script        | Función                                                                                |
| ------------- | -------------------------------------------------------------------------------------- |
| `dev`         | Servidor con recarga mediante tsx                                                      |
| `build`       | Compila TypeScript a dist                                                              |
| `start`       | Ejecuta dist/server.js                                                                 |
| `typecheck`   | Comprueba servidor, configuración y tests                                              |
| `test`        | Vitest contra DATABASE_URL_TEST                                                        |
| `db:generate` | Genera SQL y snapshots Drizzle en drizzle/                                             |
| `db:migrate`  | Aplica las migraciones pendientes                                                      |
| `db:seed`     | Crea usuarios, variables y plantilla de ejemplo                                        |
| `db:reset`    | Elimina y recrea el esquema; prohibido en producción y fuera de simaud_dev/simaud_test |

Desarrollo usa `DATABASE_URL`; con `NODE_ENV=test` los scripts usan `DATABASE_URL_TEST`. Las pruebas migran primero y truncan las tablas entre casos. Se niegan a ejecutarse contra una base cuyo nombre no empiece por `simaud_test` o cuyo nombre coincida con el de desarrollo, incluso con otro host/usuario. Por ejemplo, cada agente puede exportar `DATABASE_URL_TEST` para `simaud_test` o `simaud_test2`; dotenv no sobrescribe la variable exportada. No uses pruebas concurrentes externas sobre la misma base de tests.

El seed crea admin@simaud.local, supervisor@simaud.local, gestor@simaud.local y usuario@simaud.local con el rol correspondiente y email confirmado. Utiliza `SEED_PASSWORD`; si falta y hay cuentas por crear, genera una contraseña para las cuentas nuevas y la imprime una vez, después de confirmar la transacción. No modifica las cuentas existentes. Las diez variables y el contenido de la plantilla provienen de Supabase; la plantilla tiene un UUID fijo para evitar duplicados.

## Contrato HTTP

Todos los endpoints llevan el prefijo `/api/v1`. Los cuerpos son JSON salvo la carga de avatar. Los errores tienen la forma:

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "La cédula ya está registrada.",
    "details": { "field": "cedula" }
  }
}
```

Los listados devuelven `{data, meta:{page,pageSize,total}}`. Fechas y horas se serializan en ISO 8601; los nombres JSON usan camelCase. Los usuarios públicos contienen únicamente los campos de perfil y metadatos, nunca hashes, pendingEmail ni tokens internos.

Las rutas protegidas usan `Authorization: Bearer <accessToken>`. El JWT HS256 dura 15 minutos, contiene sub/role y sid para identificar la sesión. En cada petición se comprueba el rol y el estado actual del usuario en PostgreSQL. Un cambio de rol invalida inmediatamente los JWT con el rol anterior.

### Autenticación

| Método y ruta                  | Cuerpo / consulta                    | Resultado                                              |
| ------------------------------ | ------------------------------------ | ------------------------------------------------------ |
| POST /auth/register            | email, password, name, phone, cedula | 201, {user,message}; descarta role y crea siempre user |
| GET /auth/availability         | ?email=&cedula= (al menos uno)       | {emailAvailable,cedulaAvailable}                       |
| POST /auth/confirm-email       | token                                | Confirma email o aplica el cambio pendiente            |
| POST /auth/resend-confirmation | email                                | Respuesta genérica                                     |
| POST /auth/login               | email, password                      | {accessToken,user} y cookie simaud_rt                  |
| POST /auth/refresh             | Cookie simaud_rt                     | {accessToken} y nueva cookie                           |
| POST /auth/logout              | Cookie simaud_rt                     | Revoca la cookie actual y la borra                     |
| POST /auth/logout-all          | Bearer                               | Revoca todos los refresh y borra cookie                |
| POST /auth/forgot-password     | email                                | Respuesta genérica                                     |
| POST /auth/reset-password      | token, password                      | Cambia contraseña y revoca refresh                     |

Password: 8–128 caracteres con al menos una letra y un número. El email se recorta y normaliza a minúsculas. Las cédulas se recortan; una cédula vacía no participa en el índice único. Los duplicados se indican con 409 y details.field.

La cookie refresh es httpOnly, SameSite=Lax, Secure en producción, con path `/api/v1/auth` y duración de 30 días. En el cliente usa `credentials: "include"`. Cada rotación crea un token aleatorio nuevo, conserva la familia y revoca el anterior. Reutilizar uno revocado revoca toda su familia, sin afectar a otras sesiones, salvo la ventana de gracia de 15 segundos para tokens rotados (409 REFRESH_RACE). Solo se guardan hashes SHA-256. Las operaciones se serializan por usuario dentro de transacciones.

Los enlaces de confirmación caducan en 24 horas y los de recuperación en una hora; tienen 32 bytes aleatorios, se guardan hasheados y son de un solo uso. Reenviar uno invalida los anteriores del mismo tipo. Los enlaces apuntan a `APP_URL/auth/confirmar?token=…` y `APP_URL/auth/restablecer?token=…`. El login admite cinco intentos por minuto por combinación IP/email; disponibilidad, registro y envío de emails tienen límites propios.

Revocar refresh impide obtener nuevos JWT; los access tokens ya emitidos duran hasta sus 15 minutos de validez, salvo cambios de rol, inactividad o borrado que se comprueban inmediatamente en BD.

### Perfil

| Método y ruta            | Cuerpo                                         | Resultado                                                                |
| ------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------ |
| GET /me                  | —                                              | Usuario actual                                                           |
| PATCH /me                | name, phone, cedula (opcionales, al menos uno) | {user}                                                                   |
| PATCH /me/password       | currentPassword, newPassword                   | Revoca las demás sesiones, conserva la identificada por sid              |
| PATCH /me/email          | newEmail, password                             | Envía confirmación al nuevo correo; mantiene el anterior hasta confirmar |
| PUT /me/avatar           | multipart/form-data: un solo archivo           | {user}                                                                   |
| DELETE /me/avatar        | —                                              | Elimina avatar y registro de archivo                                     |
| GET /files/avatars/:name | —                                              | Imagen; ruta pública con nombre aleatorio                                |

Avatares: máximo 2 MiB, JPEG/PNG/WebP, con verificación de firma binaria y MIME. Se guardan en `storage/avatars/` con UUID aleatorio; no se usa el nombre recibido del cliente. La sustitución elimina el archivo anterior.

### Usuarios

Solo admin, salvo lookup.

| Método y ruta     | Cuerpo / consulta                           | Resultado                                                  |
| ----------------- | ------------------------------------------- | ---------------------------------------------------------- |
| GET /users        | ?q=&role=&page=&pageSize=&sort=             | Lista paginada                                             |
| GET /users/:id    | UUID                                        | Usuario                                                    |
| POST /users       | email, name, phone, cedula, role, password? | 201, {user}                                                |
| PATCH /users/:id  | name, phone, cedula, role, email, isActive  | {user}                                                     |
| DELETE /users/:id | UUID                                        | Soft delete y revocación de sesiones                       |
| GET /users/lookup | ?cedula=                                    | Solo {id,name,email,phone,cedula}; admin/supervisor/gestor |

page comienza en 1; pageSize vale 20 y admite 1–100. sort acepta name, email, createdAt y sus variantes con prefijo `-`; por defecto `-createdAt`. q busca en nombre, email y cédula.

Las altas administrativas quedan confirmadas. Si no se proporciona password se genera una credencial aleatoria desconocida y se envía un enlace de recuperación para fijarla. Un admin no puede eliminarse, desactivarse ni degradarse a sí mismo. Los cambios de miembros admin se serializan con un advisory lock PostgreSQL y preservan al menos un admin activo. El borrado es lógico y conserva contratos y referencias históricas.

La auditoría de usuarios produce eventos estructurados con actor, entidad y acción. `lib/audit.ts` permite escribir auditoría de dominio dentro de una transacción, también para entidades sin contrato.

## Esquema de contratos

Las 18 tablas y los enums soportan T01, T02 y T03. `contracts.status` es el único estado: draft, pending_approval, rejected, pending_signatures, active, expiring_soon, expired, cancelled y renewed. El archivo se representa aparte con archived. Los endpoints de contratos se describen en el apartado T02.

Las claves foráneas de usuarios en documentos conservan el documento y admiten SET NULL si se produce un borrado físico. Los hijos propios de contratos pueden borrarse en cascada; la auditoría conserva su entrada. Hay índices para estados, creadores, vencimientos, familias de sesión y notificaciones, e índices únicos parciales para cédulas, renovaciones pendientes y aprobaciones pendientes.

El correo se encola en `email_outbox` dentro de la transacción de negocio. El job `email-dispatch` lo envía después; un fallo del proveedor no afecta al registro ni a los documentos.

## Contratos (T02)

Las rutas usan Bearer y validan los permisos en el servidor. Admin y supervisor leen todos los contratos; gestor lista los propios. Los firmantes acceden a sus documentos mediante `/me/signatures` y al detalle de los contratos en los que participan. El rol user no puede crear ni consultar el listado general.

| Recurso    | Endpoints                                                                                                                                 |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Variables  | GET/POST /variables; PATCH/DELETE /variables/:id                                                                                          |
| Plantillas | GET/POST /templates; GET/PATCH/DELETE /templates/:id; POST /templates/:id/duplicate; PATCH /templates/:id/status; POST /templates/preview |
| Contratos  | GET/POST /contracts; GET /contracts/counts; GET/PATCH/DELETE /contracts/:id                                                               |
| Flujo      | POST /contracts/:id/submit, /approve, /reject, /cancel, /uncancel, /archive, /unarchive, /override-status, /remind, /sign, /decline       |
| Historial  | GET /contracts/:id/versions, /versions/:n, /audit, /approvals                                                                             |
| Cola       | GET /approvals?status=pending (también approved/rejected)                                                                                 |
| Firmas     | GET /me/signatures?status=pending (o signed); GET /files/signatures/:id                                                                   |

Admin y supervisor gestionan plantillas y variables; gestor solo consulta plantillas activas y las variables que usan. `GET /templates` admite status, q y category y añade usageCount; el detalle añade resolvedVariables. Los catálogos y la cola devuelven arrays. Guardar una plantilla extrae los nombres de `{{variable}}` en el servidor y rechaza desconocidas con `details.unknown`. Variables select requieren options; borrar o renombrar una variable en uso devuelve 409 con `details.templates`. No se puede borrar una plantilla con contratos. Duplicar crea una copia inactive.

`POST /templates/preview` recibe `{content,values}` y devuelve `{html,missing}`. El render escapa tanto el contenido como las sustituciones; el contenido se trata como texto, no como HTML confiable. Fechas ISO se presentan en español dominicano, números como `RD$ 1.234,56`; text/textarea/select conservan su texto escapado. El cliente puede conservar saltos de línea con CSS white-space: pre-wrap.

Crear un contrato recibe:

```json
{
  "templateId": "UUID",
  "title": "Servicios",
  "variables": { "cliente_nombre": "Cliente" },
  "value": 25000,
  "startDate": "2026-11-01",
  "endDate": "2027-11-01",
  "notes": "Opcional",
  "signatories": [
    { "name": "Cliente", "email": "cliente@example.com", "role": "client", "signingOrder": 1 }
  ]
}
```

Las variables deben corresponder a la plantilla y completar sus campos required. Los firmantes admiten phone y cedula; role es client, witness o contractor. No se permiten emails, cédulas ni usuarios enlazados duplicados. Si email y cédula pertenecen a usuarios diferentes, se rechaza toda la transacción. No se aceptan estados, contenido generado ni creadores enviados por el cliente.

PATCH acepta campos parciales del alta y content para editar el texto de un borrador. Reemplaza la lista de firmantes por diff conservando los ids y vínculos que continúan. Una edición crea una versión con instantánea de los datos y firmantes; editar rejected lo devuelve a draft y reinicia las firmas. Las versiones aprobadas conservan el texto y valores originales aunque después cambie la plantilla. Se prohíbe editar después de enviar a aprobación; devolver a rejected permite corregir y reenviar.

Los códigos `CT-AAAA-NNNN` se asignan mediante secuencias anuales de PostgreSQL y nunca se reutilizan tras borrar un contrato. Son secuenciales, pero pueden tener saltos por transacciones revertidas o reintentos. `GET /contracts` admite status, q (título/código), templateId, createdBy, expiresBefore, archived (false por defecto), page, pageSize y sort. sort admite updatedAt (predeterminado descendente), createdAt, title, endDate y code con prefijo opcional `-`. Incluye template, creator, signatures y daysToExpiry. counts devuelve un objeto con todos los estados y respeta el creador para gestor y el filtro archived.

El detalle añade signatories y `can: {edit,submit,approve,reject,sign,cancel,archive,delete,override}`. Admin y gestor propio crean/editan/envían; supervisor revisa pero nunca aprueba ni rechaza un contrato creado por él. La aprobación lleva a pending_signatures. Firmantes con igual signingOrder pueden firmar en paralelo; deben estar completas todas las órdenes inferiores. La última firma activa el contrato.

Rechazar recibe `{comment}` obligatorio; aprobar admite comment. Cancelar recibe `{reason,description}`, con reason breach, mutual_agreement, client_request, payment_default u other. Solo se cancela pending_signatures, active o expiring_soon. Uncancel es exclusivo de admin y restaura el estado previo. Archivar es independiente del estado. Override es exclusivo de admin, exige `{status,reason}` y solo admite aristas de la máquina de estados; genera las aprobaciones, notificaciones y auditoría correspondientes. Puede forzar la activación con motivo explícito; la auditoría distingue esa acción de una firma.

DELETE de admin exige `{confirm:"CT-AAAA-NNNN"}`; gestor solo borra sus propios draft. El borrado es físico, elimina los archivos de firmas y conserva auditoría con entityId. Cada transición bloquea el contrato con FOR UPDATE dentro de una transacción. Las notificaciones y sus correos se escriben con el cambio dentro de la misma transacción. El job despacha firmas, resultados de aprobación, activaciones y otros avisos; un fallo del proveedor se reintenta desde la outbox.

`GET /approvals` incluye contract, requester, ageSeconds, version y diff respecto a la última revisión anterior. El diff indica cambios de contenido, variables y datos/firmantes. Historial y auditoría respetan la autorización del documento. Audit usa paginación y devuelve `{data,meta}`.

La firma es multipart con tres campos: `signature` (PNG, máximo 500 KiB), `acceptedDeclaration` (texto true) y `viewedAt` (ISO 8601 con zona, posterior a la última actualización del contrato y no futuro). Se guardan declaración, hora de visualización, IP y user agent. El id para descargar se encuentra en signatories[].signatureFileId; signaturePath es un nombre aleatorio, nunca una ruta pública. El archivo solo es accesible para admin/supervisor, creador o firmantes. Una segunda firma devuelve 409. Decline recibe `{reason}` y devuelve el contrato a rejected. Remind recibe `{signatoryId}`, exige turno pendiente y permite un aviso por hora y firmante, persistido en BD.

Al primer acceso autenticado se vinculan los firmantes sin userId por email confirmado o cédula. El seed añade ocho contratos demostrativos con UUIDs fijos y firmantes enlazados, sin duplicarlos en ejecuciones posteriores. Los ejemplos firmados son datos demostrativos: no contienen imágenes ni representan firmas legales reales.

### Ajustes de autenticación y proxy

Refresh simultáneo: un token rotado hace menos de 15 segundos responde 409 `REFRESH_RACE` sin cambiar la cookie ni revocar la familia. Reintenta con la cookie más reciente. Fuera de esa gracia, reutilizarlo revoca la familia.

`TRUST_PROXY=false` por defecto ignora X-Forwarded-For. Puede ser true, un número de saltos o una lista de IPs/CIDRs separadas por comas, por ejemplo `127.0.0.1,10.0.0.0/8`. Se aplica a Fastify y por tanto a request.ip, auditoría y límites por IP. Configúralo según la ruta real de proxies; true confía en todos los saltos.

Para actualizar desde T01 ejecuta db:migrate antes de arrancar y vuelve a ejecutar db:seed si quieres los ejemplos. No se requieren dependencias nuevas para T02. Los jobs y las renovaciones manuales se describen en T03; no se habilita renovación automática.

## Ciclo de vida (T03)

Ejecuta npm run db:migrate antes de arrancar tras actualizar desde T02. Las migraciones añaden settings, job_runs, expiry_deliveries, preferencias JSONB, metadatos del PDF final e índices de deduplicación. No requieren reset. npm run format aplica Prettier y npm run format:check verifica el formato.

Todas las rutas siguientes llevan /api/v1 y requieren Bearer, salvo GET /events, que consume un ticket efímero. Fechas: YYYY-MM-DD. Los importes de las respuestas son strings decimales.

### Renovaciones

| Método y ruta              | Entrada / resultado                                                                                                                                                                            |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET /renewals              | status=pending/approved/rejected/cancelled, priority=urgent/high/medium/low, page, pageSize; data/meta con contrato, solicitante, daysToExpiry, currentValue, proposedValue y variationPercent |
| GET /renewals/eligible     | Array de contratos active/expiring_soon/expired accesibles para renovar; excluye pendientes e hijos aprobados todavía en curso                                                                 |
| POST /renewals             | contractId, proposedStartDate, proposedEndDate, proposedValue, reason; 201 con solicitud                                                                                                       |
| POST /renewals/:id/approve | {response?}; crea un único hijo draft y devuelve newContractId                                                                                                                                 |
| POST /renewals/:id/reject  | {response}, obligatorio y no vacío                                                                                                                                                             |
| POST /renewals/:id/cancel  | {}; solo el solicitante                                                                                                                                                                        |

Admin/supervisor ven todas; gestor las de sus contratos y cada firmante las solicitadas por él. Creador, admin o supervisor procesan. Un firmante puede solicitar renovación de sus documentos. El inicio debe ser posterior al día anterior al vencimiento actual; el fin debe ser posterior al inicio. La prioridad usa días naturales en America/Santo_Domingo: urgent hasta 15, high hasta 30, medium hasta 60, low el resto. La variación sobre valor original cero es null.

Aprobar bloquea original y solicitud en una transacción; repetir devuelve 409. Copia texto/plantilla, variables, valor/fechas y firmantes pendientes con su orden. Sustituye fecha_inicio, fecha_fin y valor_contrato si existen en las variables originales. El hijo tiene parentContractId y renewalType=manual_renewal. El original conserva su estado hasta la activación del hijo por última firma o activación administrativa; entonces pasa a renewed con auditoría. Si el original deja de admitir renovación, se rechaza la activación. Se notifica al creador, solicitante y administradores/supervisores activos.

### Notificaciones y SSE

| Método y ruta                      | Entrada / resultado                                                                            |
| ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| GET /notifications                 | unread=true/false, page, pageSize; data/meta, solo propias, cada entrada incluye link relativo |
| GET /notifications/unread-count    | {count}                                                                                        |
| POST /notifications/:id/read       | Marca una propia como leída                                                                    |
| POST /notifications/read-all       | Marca todas las propias                                                                        |
| DELETE /notifications/:id          | Borra una propia                                                                               |
| POST /events/ticket                | Bearer; {ticket,expiresIn:30}                                                                  |
| GET /events?token=…                | text/event-stream; consume el ticket de un solo uso                                            |
| GET /me/notification-preferences   | emailOnSignatureRequired, emailOnApprovalResult, emailOnExpiry                                 |
| PATCH /me/notification-preferences | Uno o varios booleanos; conserva los demás                                                     |

Solicita el ticket con el JWT en Authorization y pasa únicamente el ticket a EventSource. Para reconectar solicita otro. El ticket se guarda hasheado, dura 30 s y se revalida actividad/rol al consumirlo. Eventos: notification (notificación con link), unread-count ({count}), role-changed ({role}) y ping cada 25 s. Tras role-changed el frontend debe recargar sesión. Leer/borrar también actualiza el contador. Enlaces: /contratos/:id, /aprobaciones, /renovaciones o /firmas.

Los eventos se publican después del commit; un rollback no emite. El bus implementa una interfaz sobre EventEmitter; los tickets son locales a cada instancia. Con varias instancias se necesita afinidad de conexión o sustituir el adaptador por un transporte compartido como LISTEN/NOTIFY. El lock de jobs sí es compartido en PostgreSQL. SSE no ofrece replay: al reconectar consulta lista y contador.

Las preferencias son true por defecto y solo controlan correo, incluidas firmas y aprobaciones de T02. Las notificaciones de aplicación se siguen guardando. El correo se encola transaccionalmente y se entrega desde la outbox.

### Jobs y ajustes

Variables nuevas: JOBS_ENABLED=false por defecto y EXPIRY_WARNING_DAYS=30. Para programar configura JOBS_ENABLED=true; el scheduler siempre queda deshabilitado en tests. Zona: America/Santo_Domingo.

| Job                  | Programación y efecto                                                                                                |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| contract-status      | 00:15 y al arrancar; active → expiring_soon hasta expiryWarningDays; active/expiring_soon → expired si endDate < hoy |
| expiry-notifications | 08:00; umbrales 30, 15, 7 y 1 día; creador y firmantes; hasta 7 días también admin/supervisor                        |
| cleanup              | Domingo 03:00; elimina leídas >90 días, auth/refresh tokens vencidos hace >30 días y correos enviados hace >30 días  |
| email-dispatch       | Cada minuto; hasta 100 correos vencidos, reintentos exponenciales hasta 6 intentos                                   |

Cada job usa pg_try_advisory_lock en una conexión reservada hasta terminar, común a ejecuciones manuales y programadas. Si está ocupado responde skipped=true. job_runs guarda inicio, fin, ok, summary y error saneado. El actor de cambios automáticos es system (userId null). expiry_deliveries tiene índice único por contrato/usuario/umbral: borrar un aviso o ejecutar cleanup no permite reenviarlo. El cierre espera jobs en curso.

| Método y ruta (solo admin)  | Entrada / resultado                                                         |
| --------------------------- | --------------------------------------------------------------------------- |
| GET /system/jobs            | Cuatro nombres con lastRun; email-dispatch incluye outbox: {pending,failed} |
| POST /system/jobs/:name/run | Ejecuta uno de los cuatro jobs aunque el scheduler esté deshabilitado       |
| GET /system/settings        | expiryWarningDays, expiryNotificationDays, institution                      |
| PATCH /system/settings      | Uno o varios ajustes, persistidos en PostgreSQL                             |

institution contiene {name,rnc,address,logo?}. logo acepta PNG como data URI o null; no se descargan URLs externas. Los días admiten 1–365, sin umbrales duplicados. Un ajuste persistido prevalece sobre EXPIRY_WARNING_DAYS. PATCH institution recibe el objeto institucional completo.

### Dashboard y reportes

GET /dashboard?months=6 (o 12) deriva el rol del JWT validado y rechaza role/userId por query. Admin recibe attention, kpis, monthly, byStatus, pendingApprovals y upcomingExpirations. Cada KPI admin contiene {value,previous,trend}: previous es el cierre del mes anterior; trend tiene seis valores mensuales incluido el actual. El histórico usa auditoría de estado/valor y fechas de creación/firma; datos importados sin auditoría usan estado/valor conservados. avgApprovalDays es el promedio del mes de revisiones aprobadas. monthly cuenta creados y primeras activaciones, incluyendo meses vacíos.

Supervisor recibe kpis, queue (hasta cinco), templateUsage y myRecentDecisions. Sus decisiones/tiempos son propios; la cola excluye contratos creados por él. Gestor recibe kpis, lanes {returned,drafts,awaitingSignatures} (hasta 20 por columna) y recent (hasta cinco), solo sus contratos, más institutionFirstTimeApprovalRate agregada. Las tasas de primera aprobación usan la primera revisión decidida por contrato. User recibe myTurn, waitingOthers y signed (hasta 50 por grupo) por firmantes. Agregaciones y límites se aplican en SQL.

| Método y ruta             | Filtros / permisos                                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| GET /reports/contracts    | from/to inclusivos por creación; groupBy=status/month/template/manager; templateId, managerId                               |
| GET /reports/users        | groupBy=role/activity; solo admin; agregados sin cédulas ni teléfonos                                                       |
| GET /reports/approvals    | from/to por decisión; templateId, managerId; rows/totals y byManager/bySupervisor con promedio en días y tasa de devolución |
| GET /reports/:type/export | type=contracts/users/approvals; format=csv/xlsx/pdf; mismos filtros/permisos                                                |

Admin y supervisor consultan contratos/aprobaciones; gestor únicamente sus contratos, incluso al enviar managerId ajeno. Los reportes devuelven rows/totals. Exportaciones reales con Content-Disposition: attachment y caché privada: CSV UTF-8 con BOM, separador ; y escape de fórmulas; XLSX con cabeceras, anchos, DOP y fechas; PDF con tablas paginadas. Incluyen fila de totales.

### PDF del contrato

GET /contracts/:id/pdf genera application/pdf con los mismos permisos de lectura. Incluye institución, título/código/versión, párrafos, negritas simples, PNG y datos de firmantes. Convierte el contenido renderizado a texto sin ejecutar HTML. La página final contiene fecha/hora ISO, IP, user agent, visualización, declaración aceptada, versión y SHA-256 del contenido renderizado almacenado (UTF-8, antes de decodificar entidades para presentación).

La última firma genera el PDF en el flujo transaccional y guarda storage/contracts/<id>-v<n>.pdf, signedPdfPath y signedPdfSha256 (hash de bytes). GET /contracts/:id/pdf?final=true sirve esos bytes exactos tras verificar el hash. Sin final para la versión actual: 404; fallo de integridad: 409. La activación administrativa no representa firmas ni crea un PDF final firmado. El PDF final conserva la institución del momento de firma aunque cambien los ajustes.

Se incluyen Roboto TTF de pdfmake en assets/fonts/ como alternativa a Source Serif 4/Geist, ausentes en los paquetes instalados. Conserva assets/ junto a dist/ al desplegar. Archivos y PostgreSQL no comparten commit: los errores manejados eliminan nueva firma/PDF; una caída abrupta puede dejar huérfanos que requieren limpieza. Los ejemplos seed firmados no contienen PNG ni PDF final legal.

## Correo y primer administrador (T08)

Sin dependencias adicionales: Resend usa fetch HTTP y SMTP usa Nodemailer.

| Variable       | Uso                                                                                   |
| -------------- | ------------------------------------------------------------------------------------- |
| MAIL_DRIVER    | log por defecto en desarrollo/test; resend o smtp obligatorio en producción           |
| MAIL_FROM      | Remitente obligatorio fuera de log; por ejemplo SIMAUD <no-reply@universidad.example> |
| MAIL_REPLY_TO  | Dirección de respuesta opcional                                                       |
| RESEND_API_KEY | Obligatoria para resend                                                               |
| SMTP_URL       | Obligatoria para smtp; URL smtp/smtps con credenciales codificadas                    |
| HOST           | IP o localhost; 127.0.0.1 por defecto                                                 |

Los correos de seguridad (confirmación, recuperación e invitación) siempre se encolan. Los avisos de firma usan emailOnSignatureRequired; vencimientos, emailOnExpiry; aprobación, activación, renovación y demás avisos, emailOnApprovalResult. Los firmantes todavía sin cuenta reciben sus avisos por email. Las plantillas generan HTML escapado y texto; los enlaces de documentos usan /app/contratos/:id y los turnos /app/firmas.

POST /api/v1/system/mail/test con {"to":"destino@example.com"}, solo admin, responde 202 e id de la outbox. GET /api/v1/system/jobs muestra pending/failed en email-dispatch. POST /api/v1/system/jobs/email-dispatch/run ejecuta el envío manualmente. Con JOBS_ENABLED=true se procesa cada minuto (scheduler deshabilitado durante tests).

429, 5xx, HTTP 408, timeouts y errores de conexión son temporales; otros 4xx son permanentes. SMTP 4xx es temporal, 5xx permanente. Se reintenta tras 1, 2, 4, 8 y 16 minutos; al sexto intento se marca failed. Se conservan errores saneados de hasta 250 caracteres y provider_id. Un advisory lock coordina instancias del job y FOR UPDATE SKIP LOCKED protege cada correo. Resend recibe el UUID de outbox como clave de idempotencia. SMTP no puede garantizar entrega exactamente una vez si el proceso cae después de aceptar el mensaje y antes del commit; Message-ID estable ayuda a rastrearlo. Los payloads se borran al entregar y cleanup elimina enviados de más de 30 días. Pendientes/fallidos pueden contener tokens: restringir acceso a la BD y backups.

Aplicar migración 0006_t08_mail_outbox antes de arrancar. Crear solo el administrador inicial (sin seed):

```sh
npx tsx src/db/create-admin.ts --name "Administración" --email admin@universidad.example --cedula 001-1234567-8
# Compilado, también en el contenedor:
node dist/db/create-admin.js --name "Administración" --email admin@universidad.example --cedula 001-1234567-8
```

También admite ADMIN_NAME, ADMIN_EMAIL y ADMIN_CEDULA. ADMIN_PASSWORD es opcional, mínimo 12 caracteres con mayúsculas, minúsculas y números; si se omite genera una contraseña aleatoria fuerte y la imprime una sola vez tras el commit. Si se proporciona, no se imprime. Si el email ya existe (normalizado a minúsculas), no cambia ningún dato ni genera otra contraseña. No pasar contraseñas por argumentos ni guardarlas en historial.

El usuario queda admin, confirmado y con must_change_password=true. El login devuelve user.mustChangePassword. Hasta cambiarla, las rutas protegidas y refresh responden 403 PASSWORD_CHANGE_REQUIRED; se permiten PATCH /me/password y POST /auth/logout. Cambiar/restablecer contraseña borra el indicador. La pantalla de primer cambio debe enviar currentPassword/newPassword con el Bearer obtenido al iniciar sesión.

Ver [guía de despliegue](../docs/DEPLOY.md) para verificar dominio/DNS y probar envío real.
