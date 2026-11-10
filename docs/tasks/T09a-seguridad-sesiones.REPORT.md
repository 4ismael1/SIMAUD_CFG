# T09a — Seguridad de sesiones, autenticación y correo

Fecha: 9 de noviembre de 2026.

## Resultado

Implementadas las correcciones H02, H04, H05, H06, H07 y H11. **35/35 pruebas nuevas de T09a aprobadas**, incluidas conexiones SSE reales. `typecheck`, `format:check` global y `build` aprobados en la última comprobación; `npm audit`: **0 vulnerabilidades**.

La suite completa **no está en verde**: 383 aprobadas y 37 fallidas, en 21 archivos y 420 casos. Se desglosan abajo las incompatibilidades con los tests anteriores y los resultados del trabajo concurrente T09b. No se relajaron las comprobaciones de seguridad para aceptar los fixtures anteriores.

Se utilizaron `DATABASE_URL_TEST` y las protecciones existentes de los helpers: BD separada `simaud_test2`. No se imprimieron su URL, secretos ni `api/.env`. No se ejecutaron migraciones sobre desarrollo ni producción. **No se hizo git commit**.

## Cambios por hallazgo

### H02 — Revocación de access tokens

- El JWT incluye `sid = refresh_tokens.family_id` y `cv = users.credentials_version`. La rotación conserva la familia y revoca únicamente el refresh anterior, por lo que no invalida los access tokens de esa familia por sí sola.
- `authenticate` exige ambos claims y comprueba en **una consulta**, sin caché, usuario y familia: pertenencia, refresh activo no caducado, versión de credenciales, actividad, email confirmado, ausencia de borrado y rol actual. JWT sin sesión reciben 401, también durante tests.
- Se añade el índice parcial `refresh_active_family_idx(family_id, user_id, expires_at) WHERE revoked_at IS NULL`. Una familia está activa mientras exista su refresh vigente; no se necesita otra tabla de sesiones.
- Logout identifica y revoca toda la familia de la cookie presentada, incluso si esa cookie fue rotada. Las demás familias conservan acceso.
- Logout-all, reset y detección de reuso fuera de la gracia de 15 segundos revocan todas las familias e incrementan la versión de credenciales. Se mantiene `409 REFRESH_RACE` para refresh concurrentes durante la gracia, sin emitir otro refresh.
- El cambio de contraseña del perfil incrementa la versión, revoca las otras familias y conserva el refresh de la actual. **Devuelve un JWT nuevo** para esa familia; el bearer anterior deja de servir. La cookie actual puede seguir renovándose.
- Se reutiliza la llamada existente a `revokeSessions` desde administración de usuarios: desactivación, borrado, cambio de rol y cambio administrativo de email también cierran sesiones sin editar ese módulo.

Código principal: `api/src/lib/auth/sessions.ts`, `jwt.ts`, `plugins/auth.ts`, `modules/auth/service.ts` y la parte de contraseña de `modules/me/{service,routes}.ts`.

### H06 — SSE

- Ticket y conexión guardan usuario, rol, `sid` y versión de credenciales. El ticket conserva sus 30 segundos y su consumo de un uso.
- Se verifica la familia al canjear el ticket y otra vez después de suscribir la conexión, cubriendo una revocación entre ambas operaciones.
- Las revocaciones publican `session-revoked` **después del commit**. El servidor termina las conexiones correspondientes; una revocación de otra familia no cierra las propias. También se atiende `role-changed`.
- Cada heartbeat revalida la sesión en BD, cada **25 segundos**. Los errores cierran la conexión; si una consulta continúa pendiente al siguiente heartbeat, también se cierra, evitando mantener una sesión sin verificar durante más de 50 segundos.
- La conexión termina como máximo a **una hora**, libera timers y suscripciones, y requiere otro ticket autenticado. Se conserva el cierre al apagar Fastify.
- La familia conservada tras cambiar contraseña puede obtener un ticket con su JWT nuevo. Una conexión que conserve la versión anterior se cerrará al revalidarse.

Código: `api/src/modules/notifications/events.ts` y `api/src/lib/events.ts`. El bus sigue siendo local al proceso: el cierre inmediato se propaga localmente; otra instancia detecta la revocación mediante la revalidación de BD. Tickets y presupuestos de rate limit también siguen siendo locales al proceso.

### H07 — Recuperaciones pendientes

El cambio de contraseña desde perfil y el reset invalidan todos los `password_reset` pendientes bajo el lock del usuario y dentro de la misma transacción que actualiza contraseña y sesiones. Un enlace emitido antes del cambio no puede reemplazar después la contraseña nueva. Se conserva el consumo de un uso y la comprobación de caducidad.

### H04 — Presupuestos y trabajo Argon2

- Login mantiene **5/min por IP + email normalizado** y añade otro presupuesto independiente de **20/min por IP**, antes de validar el cuerpo y realizar trabajo de contraseña.
- Registro, recuperación y reenvío comparten un presupuesto adicional de **10/min por IP**. Se mantienen sus límites individuales: registro 10/min; recuperación y reenvío 3/min cada uno.
- Se utiliza `createRateLimit` del plugin existente y su normalización de IP. El control agregado comprueba `isExceeded`; `isAllowed` por sí solo no indica que quede presupuesto en esta API del plugin.
- Hash y verificación comparten un semáforo de **cuatro operaciones Argon2 por proceso**, sin cola ilimitada. La saturación devuelve `503`, código existente `RATE_LIMITED` y mensaje en español para reintentar. El semáforo libera capacidad también ante errores.
- Un fallo transitorio al crear el hash ficticio de login no deja en caché una promesa rechazada permanentemente.

Código: `api/src/modules/auth/rate-limit.ts`, `routes.ts` y `api/src/lib/auth/{concurrency,password}.ts`.

### H05 — Registro opaco

- Se elimina completamente `GET /auth/availability`, tanto para email como para cédula, junto con su esquema sin uso.
- Una entrada válida en registro devuelve siempre **202** y exactamente `{ "message": "Revisa tu correo." }`, tanto si se crea la cuenta como si hay conflicto de email o cédula. No devuelve usuario, disponibilidad, identificador duplicado ni detalles del conflicto.
- Se hace el mismo trabajo de hash antes de insertar en todos esos casos. `ON CONFLICT DO NOTHING` también cubre registros concurrentes sin convertirlos en un 409 público.
- Para email ya registrado se encola `account_exists` a ese email, con el aviso de cuenta existente y enlace a `/auth/recuperar`. No se sobrescriben perfil, contraseña ni rol. Un conflicto solo de cédula no crea la cuenta ni envía datos a un correo ajeno al titular.
- Una cuenta nueva conserva rol `user`, confirmación de correo obligatoria y las validaciones anteriores.

Código: `api/src/modules/auth/registration.ts`, rutas/esquemas de auth y plantilla de correo.

### H11 — Outbox cifrada

- Los payloads con `token` se cifran completos con **AES-256-GCM**, clave de 32 bytes, IV aleatorio de 12 bytes y tag obligatorio de 16 bytes. Destinatario y plantilla forman los datos autenticados adicionales.
- Se guardan en `encrypted_payload` con sobre versionado; `payload` queda `{}`. `auth_tokens` sigue almacenando únicamente hashes.
- La entrega descifra únicamente para construir el correo. Éxito y fallo terminal borran tanto el payload JSON como el cifrado. Los reintentos temporales conservan solo el cifrado.
- `expires_at` coincide con el token emitido: confirmación 24 horas; recuperación/invitación una hora. `email-dispatch` purga expirados antes de entregar, aunque su próximo reintento sea futuro o estén fallidos.
- Los mensajes de error almacenados son genéricos: ni siquiera una excepción de proveedor puede copiar el token a `last_error`.

Código: `api/src/lib/mail/{payload,outbox}.ts`, emisión de tokens y `api/src/jobs/email-dispatch.ts`. No fue necesario modificar la lógica de `jobs/cleanup.ts` para este hallazgo.

## Contrato de API para integrar en el front

Todos los paths siguientes llevan `/api/v1`.

| Operación | Resultado que debe consumir el front |
|---|---|
| `POST /auth/register` con datos válidos | `202 { message: "Revisa tu correo." }`. Ya no hay `user`, ni 409 por email/cédula duplicados. Mostrar el mismo estado de revisión de correo. |
| `GET /auth/availability` | Retirado: 404. Eliminar las comprobaciones públicas de email y cédula. |
| `PATCH /me/password` | `200 { message: "Contraseña actualizada.", accessToken: string }`. Sustituir el bearer en memoria; conservar la cookie actual. El bearer anterior devuelve 401. |
| Login/registro/recuperación/reenvío con presupuesto agotado | `429`, código `RATE_LIMITED`. El límite agregado añade `Retry-After`. |
| Cualquier operación de contraseña sin capacidad Argon2 | `503`, código `RATE_LIMITED`, mensaje de autenticación ocupada. Permitir reintentar más tarde. No se añadió un nuevo valor al enum común de errores. |
| JWT de sesión revocada, caducada o versión anterior | `401 UNAUTHORIZED`, aunque la firma y el `exp` del JWT sean válidos. |
| Reuso de refresh fuera de gracia | 401 y revocación de todas las sesiones del usuario, también las de otros dispositivos. |
| SSE terminado por revocación o una hora de duración | Pedir un ticket nuevo con una sesión vigente; no reutilizar el ticket anterior. |

Las validaciones de formato de registro mantienen sus errores 400 y los límites pueden devolver 429/503. La respuesta idéntica de registro se aplica a entradas válidas que alcanzan el servicio. No se editaron archivos del front; esta integración corresponde a Claude. H10 no forma parte de esta tarea.

## Migración y configuración

Nueva migración: **`api/drizzle/0007_t09a_sessions_mail.sql`**, registrada como entrada 7 en `api/drizzle/meta/_journal.json`, conservando la entrada concurrente 8 de T09b.

Añade `users.credentials_version`, el índice de familias activas y `email_outbox.{encrypted_payload,expires_at}`. Para no conservar enlaces antiguos en claro, invalida los auth tokens anteriores, limpia los correos que contenían `token` y los marca fallidos. También revoca los refresh existentes: **el despliegue requiere volver a iniciar sesión y solicitar de nuevo los enlaces anteriores**. Se aplicó mediante los helpers de pruebas en `simaud_test2`; no se ejecutó contra otras BD.

Nueva variable **`MAIL_PAYLOAD_KEY`**: 64 caracteres hexadecimales, obligatoria en desarrollo y producción. Solo en `NODE_ENV=test` se permite una clave aleatoria efímera por proceso, sin escribirla en disco.

Generación en PowerShell, capturando el valor sin mostrarlo:

```powershell
$env:MAIL_PAYLOAD_KEY = node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
```

Este comando es documentación: no se ejecutó ni se generó/imprimió una clave de despliegue en esta tarea. Persistir el valor en la configuración privada de ejecución, fuera de la BD y del repositorio, y compartirlo entre los procesos que encolan y entregan correo. Conservarlo mientras haya correos cifrados pendientes; cambiarlo sin tratar esos pendientes impide descifrarlos. No se editaron `.env` ni archivos de deploy para introducirlo.

## Verificación

Se usó `npm.cmd` por la política de PowerShell que bloquea `npm.ps1`.

| Comprobación desde `api/` | Resultado |
|---|---|
| Formato de los archivos propios, con lista explícita de paths | Aprobado. |
| `npm run format:check` | Aprobado globalmente en la última ejecución. |
| `npm run typecheck` | Aprobado en la última ejecución. Una ejecución anterior detectó un enum `money` en un test T09b que cambió durante el trabajo. |
| `npm run build` | Aprobado. |
| `npm audit` | Aprobado: 0 vulnerabilidades. |
| Pruebas nuevas T09a | **35 aprobadas, ninguna fallida**; también todas aprobadas dentro de la suite completa. |
| Última repetición de `test/t09a-mail-security.test.ts` tras fijar el tag GCM a 16 bytes | **7/7 aprobadas**. |
| `npm test` completo | **383 aprobadas / 37 fallidas**, 9 archivos fallidos / 12 aprobados; 403,48 segundos. |
| `git diff --check` de los paths propios | Sin errores de whitespace. |

Cobertura añadida en archivos propios:

- `t09a-sessions.test.ts`: 7 casos de familia estable, logout, logout-all, reuso global, refresh concurrente, cambio/reset de contraseña, versión y caducidad de familia.
- `t09a-events.test.ts`: 13 casos de ticket revocado/de un uso, cierre real tras logout/logout-all/reset/desactivación/cambio de rol, aislamiento entre familias, heartbeat contra BD, duración máxima y fallo de revalidación. Temporizadores controlados; se espera la promesa de BD sin sleeps para comprobar el heartbeat.
- `t09a-registration-rate.test.ts`: 6 casos de registro opaco, concurrencia, retirada de disponibilidad, presupuestos independientes y otra IP legítima.
- `t09a-password-capacity.test.ts`: 2 casos de límite compartido de Argon2 y liberación ante error.
- `t09a-mail-security.test.ts`: 7 casos de persistencia cifrada, entrega, nonce y autenticación GCM, limpieza en fallos/caducidad, rollback y validación de la clave sin exponerla.

### Fallos de la suite completa que requieren integrar los tests anteriores

| Archivo | Fallos | Motivo observado |
|---|---:|---|
| `contracts.test.ts` | 13 | Fixtures firman JWT sin crear sesión: ahora reciben 401. Usar login real o familia persistida y `familyId`. |
| `lifecycle.test.ts` | 11 | Diez casos dependen de JWT sin sesión; otro caso de preferencias usa ese fixture para actualizar al usuario y no aplica la preferencia. |
| `core.test.ts` | 4 | Dos casos esperan registro 201/409 y disponibilidad pública; otro espera conservar otra familia tras reuso; el caso de avatar pertenece al cambio concurrente de validación/normalización de imagen T09b. |
| `admin.test.ts` | 2 | Un caso conserva el bearer anterior al cambio de contraseña; otro intenta leer `payload.token` en claro en vez de obtener el enlace mediante entrega/descifrado autorizado. |
| `mail-outbox.test.ts` | 1 | Intenta entregar en 2040 un reset generado con fecha actual; ahora se purga por caducidad. Usar fecha de emisión/expiración coherente. |
| `contracts-unit.test.ts` | 1 | Fixture de configuración fuera de test sin `MAIL_PAYLOAD_KEY`. |
| `mail.test.ts` | 2 | Fixture de configuración sin la clave y lista de enlaces que no contempla `/auth/recuperar` de `account_exists`. |
| `database.test.ts` | 1 | Espera exactamente 18 tablas; T09b añade la tabla de revisión de vínculos de firmantes. |
| `t09b-history-lists.test.ts` | 2 | Durante esa ejecución usaba enum `money` y esperaba un conteo de firmas distinto. El archivo estaba cambiando; el enum ya había pasado a `date` al comprobar tipos después. No se certifica aquí el resultado final de T09b. |

No se editaron los tests anteriores para adaptar sus expectativas; los tests funcionales nuevos se añadieron exclusivamente en los cinco archivos T09a. Queda pendiente integrar esos fixtures/contratos y repetir la suite completa sobre el árbol ya estabilizado con T09b.

## Incidencia de alcance durante el formato

**Se incumplió accidentalmente la restricción de no tocar archivos T09b al ejecutar el formato.** Se intentó ejecutar `npm run format` con un archivo temporal de exclusiones bajo `docs/tasks/T09a-format.ignore`, pero sus patrones no limitaron los paths como se esperaba y Prettier reformateó también archivos compartidos. No fueron cambios funcionales de esta implementación. Se retiró ese archivo temporal y las siguientes operaciones de formato usaron una lista explícita de paths permitidos.

La salida de Prettier marcó cambios de formato en estos paths ajenos al alcance funcional T09a:

- `api/src/jobs/cleanup.ts`.
- `api/src/lib/storage-image-validation.ts`, `storage-png.ts`, `storage.ts`.
- `api/src/modules/contracts/catalog.ts`, `identities.ts`, `pdf.ts`, `routes.ts`, `service.ts`, `signatures.ts`, `variable-history.ts`.
- `api/src/modules/me/avatar.ts`.
- `api/src/modules/renewals/queries.ts`, `service.ts`.
- `api/test/t09b-helpers.ts`, `t09b-history-lists.test.ts`, `t09b-identities.test.ts`, `t09b-images.test.ts`.

Se informó al usuario durante el trabajo. No se revirtieron esos archivos porque estaban siendo editados simultáneamente por T09b y una restauración podía eliminar sus cambios. Las modificaciones funcionales de T09b, sus migraciones y los cambios concurrentes de deploy/paquetes se conservaron; no se atribuyen a T09a.

## Decisiones y límites

- Sin caché de autenticación: revocación observable en la siguiente comprobación de petición. Las peticiones que ya pasaron autenticación no se cancelan retroactivamente.
- Semáforo con rechazo inmediato, sin cola creciente; presupuestos y límite de cuatro hashes son por proceso.
- Bus SSE en memoria, con comprobación persistente de respaldo. El escalado con cierre inmediato entre procesos requeriría un bus compartido y queda documentado, sin ampliar el alcance a infraestructura.
- Se eligió cifrado de la outbox: un hash de token no permite reconstruir el enlace para enviarlo.
- Se requieren la nueva clave y la integración del front antes de considerar completo el despliegue. No se publicó, desplegó ni hizo commit.
