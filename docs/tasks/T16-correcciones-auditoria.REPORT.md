# T16 — Correcciones de la auditoría T14

Fecha: 10 de noviembre de 2026.

## Resultado y alcance

Implementadas las correcciones de H02, H06, H07, H08, H09, H10, H11, H12 y H16 en los módulos propios, y la extracción acotada de H18. H17 queda pendiente en el catálogo reservado a T15. También quedan fuera de H16 las entradas del catálogo/preview y del PDF contractual, por esa misma reserva.

Se leyeron CODE_STANDARDS, PRINCIPIOS, la tarea T16 y los informes T14, T10, T12a, T12b y T13 antes de implementar. La excepción de autoaprobación del administrador se incorporó a PRINCIPIOS para reflejar la decisión expresa del dueño en T16.

No se hizo commit, no se cambió DATABASE_URL_TEST ni se leyó api/.env. Los comandos npm y las pruebas se ejecutaron desde Git Bash. El lanzador local comprueba que la URL heredada apunta exactamente a simaud_test3 y desactiva la carga implícita de dotenv mediante un path inexistente. La prueba de migración contrasta current_database() con la configuración heredada, sin codificar una base que impida ejecutar la suite paralela de T15.

## Correcciones

### H02 — Autoría histórica y autoaprobación

- `createdBy` sigue siendo el responsable reasignable. `originalCreatedBy` conserva al creador/solicitante original; aprobaciones y renovaciones conservan `originalRequestedBy`.
- Los campos históricos no tienen FK destructivas y sus triggers impiden modificarlos. La reasignación y la baja de un usuario no borran esa identidad histórica.
- Supervisor no puede aprobar/devolver si es autor original, responsable actual o solicitante de la aprobación vigente. Gestor continúa sin aprobación contractual ordinaria. Las renovaciones propias se deniegan a supervisor/gestor aunque cambie su rol o el responsable.
- Admin puede aprobar lo suyo. Se emiten `approved_own` y `renewal-approved_own`, con los datos de auditoría y la transacción habituales. La decisión usa la solicitud pendiente concreta, incluso si hubo revisiones anteriores de la misma versión.
- Detalle `can.approve`/`can.reject`, cola de aprobaciones y cola del dashboard aplican la misma separación. Las columnas internas no se añaden a los DTO contractuales o de renovación.

### H06 — Logo después de autorización y presupuesto temprano

El límite general de Fastify pasa a `onRequest`. Se elimina el hook cruzado de contratos: settings valida y sanea el logo desde su servicio, después de autorizar al admin y validar el objeto. Hay una única imagen en proceso por instancia; no se conserva una cola de logos. Los rechazos por sesión, rol o presupuesto no invocan el decodificador.

Se conserva el decodificador síncrono acotado existente. Se eligió la alternativa de limitar concurrencia contemplada por H06; no se añadió un worker ni una biblioteca de imágenes.

### H07 — Presupuestos por cuenta y destinatario

- Login: cinco intentos por identidad normalizada/minuto, compartidos por PostgreSQL entre IP e instancias. Se conservan los presupuestos agregados por IP y por IP+email de T09a.
- Registro, recuperación, reenvío y cambio de email comparten tres intentos/minuto por destinatario normalizado. Cambio de email tiene además tres/minuto por actor.
- Las claves persistidas son hashes del propósito y de la identidad, sin correo en claro. La reserva es atómica mediante UPSERT; las ventanas caducadas se limpian por índice.
- Recuperación/reenvío y cambio de email reutilizan durante sesenta segundos un token vigente para ese mismo destinatario/propósito; no duplican el correo ni invalidan el enlace anterior durante ese enfriamiento.
- Se mantienen respuestas opacas y `Retry-After` en 429. Los límites por cuenta/destinatario nuevos son compartidos; los presupuestos IP existentes siguen siendo locales al proceso.

### H08 y H09 — Bloqueos y admisión de archivos

Se reservan contratos en orden de ID, incluyendo todos los ancestros de una cadena de renovación, antes de usuario y firmantes. Firma, acciones, detalle y solicitud de renovación usan el mismo orden. La bandeja reserva los contratos candidatos antes de vincular invitados, también los ya firmados cuyo trigger vuelve a bloquear el contrato. La vinculación de una operación individual se limita a ese contrato. No se reestructuró la generación del PDF final.

La cola de mutaciones admite ocho operaciones contando la activa y ejecuta una a la vez. Firma/avatar entran antes de leer y sanear sus buffers. La saturación devuelve 503 con Retry-After; abortar una petición en espera retira su trabajo y libera la plaza. Las operaciones anidadas conservan la reserva y los locks de migración/backup. Una operación ya iniciada conserva la semántica transaccional y la limpieza tras rollback.

### H10 — Consultas y exportaciones acotadas

- Listado contractual: decoración por lotes de firmas, plantillas y responsables; el número de consultas no crece con los cien contratos de una página.
- Aprobaciones: joins para solicitante y versiones actual/anterior; no se carga todo el historial para cada fila. Aprobaciones, elegibles y arrays históricos admiten page/pageSize sin convertir sus respuestas en objetos.
- Consultas costosas de estos listados y de reportes usan instantánea repeatable-read/read-only, máximo dos lecturas simultáneas por instancia y statement_timeout local de diez segundos.
- Overview admite como máximo 3660 días; se comprueba antes de materializar períodos. Sus activaciones se agregan exclusivamente sobre contratos elegibles para el actor/filtros.
- Cada consulta tabular de reportes se limita a 10001 filas y rechaza más de 10000. Exportar admite dos trabajos simultáneos por instancia, incluyendo la consulta. Se comprueban antes de generar el archivo: 10000 filas, 100000 celdas y 5 MiB de datos; PDF limita a 2000 filas y 20000 celdas. Los totales/cabeceras consumen también presupuesto. Los volúmenes superiores piden acotar filtros; no se truncan silenciosamente ni se crean trabajos asíncronos ficticios.
- Índice parcial del hash del PDF final. EXPLAIN con 5000 contratos sintéticos comprueba su uso para una búsqueda sin coincidencia. No se añadieron los otros índices especulativos del informe sin medirlos.

### H11 y H12 — Dinero exacto y fechas locales

Importes de overview y de los campos monetarios de dashboard se calculan en numeric y se devuelven como strings decimales. Sumas/series mantienen dos decimales; las medias se redondean a dos decimales mediante round(numeric, 2), con mitades alejadas de cero. Conteos, tasas y duraciones conservan sus contratos. Los reportes antiguos ya devolvían dinero como texto; XLSX deja de convertirlo a Number y lo conserva como texto exacto, también para cantidades pequeñas.

Se adaptaron los tipos y consumidores monetarios del front. Ordenación y variaciones de dinero usan centavos BigInt. Los gráficos aproximan únicamente la geometría; sus tooltips conservan los decimales originales. CSV, XLSX y PDF reciben los strings exactos.

Los tres reportes antiguos usan límites `date::timestamp AT TIME ZONE 'America/Santo_Domingo'`, con fin exclusivo del día siguiente. El reporte de usuarios aplica también el rango a sus altas. `daysToExpiry` y los rangos por defecto comparten el día de Santo Domingo y admiten reloj inyectado.

### H16, H17 y H18 — Validación y extracción acotada

Se hacen estrictos registro/login/tokens, perfil, listas de usuarios, paginación, auditoría, SSE y los objetos propios que faltaban. Se limitan páginas a 10000, búsquedas a 200 caracteres, nombres de variables a 100, opciones a 100 y valores de variables a 5000 claves. Un hook de entradas verifica params completos y objetos vacíos de body/query cuando no se esperan datos, respetando los esquemas completos de cada ruta. Dashboard conserva su parámetro legítimo months.

Los parámetros del detalle de versión se validan juntos y antes de consultar el recurso: UUID y número de versión entre 1 y 2147483647, evitando convertir un desbordamiento de integer de PostgreSQL en un error 500.

Se extraen permisos de revisión, decoración, listados/aprobaciones, orden de locks, fechas y presupuestos. `escapeLike()` se comparte entre búsquedas de contratos, usuarios y auditoría. No se cambia el catálogo de T15: su búsqueda literal (H17) y su validación completa quedan expresamente pendientes de integración con ese dueño.

## Migración 0014 y coordinación

`0014_t16_audit_corrections.sql` añade las tres marcas históricas, sus triggers, el índice parcial de signed_pdf_sha256 y auth_request_budgets con índice de caducidad. No modifica 0013 ni reemplaza el esquema o journal completos. Se releyeron ambos archivos compartidos antes de añadir las entradas propias y se conservaron las ampliaciones rich-v2 de T15. Se sigue el patrón de migraciones SQL manuscritas de T10–T13, sin generar snapshots históricos nuevos.

El backfill prioriza la solicitud de renovación que creó el hijo, la primera versión, el evento create y la primera reasignación documentada antes de recurrir al responsable actual. Si una importación no conserva ninguna evidencia de autoría original, no puede reconstruirse retrospectivamente: ese fallback es un límite explícito.

No se editaron los archivos reservados rich-doc/**, lib/pdf.ts, contracts/pdf.ts, pdf-attestation.ts ni catalog.ts. Los cambios de T15 presentes en esos paths no se atribuyen a T16. Se conservó su ajuste concurrente del bloqueo de conversión rich-v2 a plain en contracts/routes.ts.

## Cambios visibles para el frontend

1. Dinero de overview/dashboard: strings decimales; promedios monetarios redondeados a dos decimales. XLSX monetario es texto exacto. Los tipos y consumidores existentes de esos valores se adaptaron.
2. Los arrays de aprobaciones, elegibles y versiones/aprobaciones históricas conservan su forma y ahora aceptan page/pageSize (1/20 por defecto, tamaño máximo 100). Los consumidores que necesiten más de una página deben recorrerlas. GET /contracts conserva data/meta.
3. Registro rechaza role y cualquier campo desconocido con 400; antes los descartaba. Campos/query/body inesperados y cotas excesivas también producen 400. El registro válido sigue imponiendo role=user y devolviendo el mismo 202.
4. Límites de autenticación/correo: 429 con Retry-After y conservación del enlace durante el enfriamiento. Saturación de archivos/reportes o timeout de consulta: 503 con Retry-After. Rangos/exportaciones excesivos: 400.
5. can.approve/can.reject y las colas excluyen revisiones propias no administrativas. Las nuevas acciones de autoaprobación tienen etiquetas explícitas en auditoría del front.

## Verificación

Todas las pruebas y comandos npm se ejecutaron desde Git Bash. La conexión heredada se comprobó también por SQL: `current_database()` devolvió **simaud_test3**.

| Comprobación | Resultado |
| --- | --- |
| API `npm run typecheck` | Correcto al iniciar la última suite. La comprobación posterior a los cambios concurrentes de T18 falla en `src/lib/rich-doc/signatures.ts:67`, TS2353: `id` no pertenece a `ContentStack`. |
| API `npm run format:check` | Correcto al iniciar la última suite. Tras las escrituras concurrentes de T18 señala 16 archivos; se enumeran debajo. |
| API `npm run build` | Correcto antes de los cambios concurrentes de T18. La comprobación final falla por el mismo TS2353 de rich-doc. |
| Regresión propia dirigida | **26/26 aprobadas**, siete archivos, 175,62 s. Incluye el backfill de 0014, seis casos de concurrencia, admisión HTTP saturada y sumas que terminan en .99. |
| API suite completa final | **558 aprobadas, 85 omitidas; 15 archivos fallidos y 38 aprobados**, 643 casos, 1714,20 s. Los hooks de esos 15 archivos fallan al aplicar la migración concurrente 0015 de T18: `index evidence_signatory_version does not exist`. No hay una suite completa final en verde. |
| API `npm audit` | Correcto: **0 vulnerabilidades**, también después de la última suite. |
| Web `npm run typecheck` | Correcto. |
| Web `npm test` | **141/141 aprobadas**, 17 archivos, en la comprobación ejecutada. |
| Web `npm run build` | Correcto; aviso de chunk mayor de 500 kB. |
| Web `npm run format:check` | Señala **29 archivos fuera de los cambios propios**. No se reformatearon indiscriminadamente; los paths propios se formatearon por lista explícita. |
| `git diff --check` | Correcto antes de las últimas escrituras concurrentes. La comprobación posterior señala whitespace en `api/src/modules/verify/service.ts:25`, fuera de T16; no se editó ese archivo. |

La suite propia contiene cinco pruebas de permisos, seis de concurrencia, tres de admisión, tres de identidad/correo/validación, dos de consultas, seis de reportes y una de migración. Usa barreras y relojes inyectados; no añade sleeps. En el front se añadieron tres regresiones para dinero, variaciones y tooltips exactos.

Las cinco pruebas de permisos se repitieron después de la última extracción del helper de solicitud pendiente: **5/5 aprobadas**, 58,52 s. Las selecciones dirigidas y los resultados web de la tabla corresponden al árbol anterior a las modificaciones de T18; no certifican esos cambios posteriores.

### Incidencias de verificación

**Bloqueo final por escrituras concurrentes de T18.** La suite arrancó a las 16:12, con typecheck/format correctos. Durante la ejecución apareció `0015_t18_verification_placement.sql` y su entrada en el journal (mtime 16:38:45, hora local de Windows). La migración intenta `DROP INDEX evidence_signatory_version` y falla en simaud_test3; los archivos ya ejecutados no habían tenido fallos. No se editó esa migración, no se retiró su entrada del journal y no se falsificó el historial de migraciones. La comprobación estática posterior registra además el TS2353 y los avisos de formato de la tabla. Se trasladó al usuario el error para coordinarlo con el dueño de T18. Queda pendiente repetir la suite completa sobre un árbol compartido estable, una vez corregida esa tarea.

Los 16 archivos señalados por el último format:check de API son:

```text
src/app.ts
src/db/schema.ts
src/lib/render-template.ts
src/lib/rich-doc/document-pdf.ts
src/lib/rich-doc/signatures.ts
src/lib/signature-placement.ts
src/lib/storage-png.ts
src/lib/validation/format-cedula.ts
src/modules/contracts/evidence.ts
src/modules/contracts/pdf-attestation.ts
src/modules/contracts/pdf.ts
src/modules/contracts/routes.ts
src/modules/contracts/service.ts
src/modules/contracts/signature-placement.ts
src/modules/contracts/signatures.ts
src/modules/verify/codes.ts
```

Una corrida anterior perdió el túnel de PostgreSQL y terminó con **430 aprobadas, 10 fallidas, 202 omitidas y un error de conexión**, 642 casos, 550,82 s. Antes de caer encontró el rechazo indebido del parámetro legítimo `dashboard?months=12`, que se corrigió. Los demás errores posteriores fueron `ECONNRESET`/`ECONNREFUSED`. No se cambió a simaud_test2 ni a otra URL; se esperó al restablecimiento de la conexión y se comprobó la base real antes de repetir.

Otra corrida sufrió una nueva desconexión y terminó con **601 aprobadas, 4 fallidas, 38 omitidas y dos errores de conexión**, 643 casos, 2210,14 s. No sustituye al resultado de la comprobación final. No se modificó la configuración de energía: Windows rechazó ejecutar el script auxiliar para impedir la suspensión y se continuó directamente desde Git Bash.

La desconexión dejó una sesión propia de la corrida anterior reteniendo el advisory lock exclusivo de configuración. Una repetición encontró tres rechazos por almacenamiento en migración y se detuvo. Se identificó y cerró únicamente esa sesión inactiva de simaud_test3, verificando PID, fechas de apertura/última consulta, consulta exacta y bloqueo, y se comprobó que el bloqueo quedara libre antes de reiniciar la suite. Su log parcial se conserva en `api/tmp/t16-stale-lock.log`.

Tras corregir las expectativas heredadas y aislar con UUID nuevos el fixture de concurrencia, una ejecución dirigida de cinco archivos aprobó **21/21** casos. La selección unitaria de autenticación, contratos y períodos aprobó **203/203**. Estas cifras describen selecciones distintas de la suite, no casos adicionales a su total.

Se actualizaron las expectativas heredadas que descartaban role en registro, invalidaban el enlace de confirmación durante el enfriamiento, recibían dinero XLSX como Number o permitían repetir intentos contra la misma cuenta desde otra IP. Se mantiene la imposición de role=user y se prueban los rechazos de campos desconocidos.

T15 registró un timeout de la prueba nueva de bandeja en una corrida antigua. En la regresión final dirigida de T16 ese caso pasó en 5,21 s junto a las otras cinco pruebas de concurrencia, incluida la reserva de ancestros. Se distinguen las corridas antiguas sobre el árbol cambiante de los procesos nuevos comprobados.

Los logs conservados están en `api/tmp/t16-connection-outage.log`, `t16-stale-lock.log`, `t16-full-suite.log`, `t16-typecheck.log`, `t16-format-check.log`, `t16-final-{typecheck,format,build}.log` y `t16-audit.log`, ignorados por git. No se reinició PostgreSQL, no se cerraron sesiones ajenas ni se alteraron credenciales o la URL de pruebas. Una incidencia anterior de validación TLS del registro npm quedó resuelta en la ejecución posterior de audit, sin desactivar TLS ni cambiar la confianza o la configuración de npm.

Con DATABASE_URL_TEST heredada, desde Git Bash, las comprobaciones se reproducen sin cargar api/.env así:

```sh
cd api
export DOTENV_CONFIG_PATH="$PWD/tmp/t16-no-dotenv"
export NODE_ENV=test MAIL_DRIVER=log JOBS_ENABLED=false
export DATABASE_URL="${DATABASE_URL:-postgresql://unused:unused@localhost/simaud_unused}"
export JWT_ACCESS_SECRET="${JWT_ACCESS_SECRET:-t16-synthetic-test-key-at-least-32-characters}"
export APP_URL="${APP_URL:-http://localhost:5173}"
node -e 'if (new URL(process.env.DATABASE_URL_TEST).pathname !== "/simaud_test3") process.exit(1)'
npm run typecheck
npm run format:check
npm test -- --reporter=verbose
npm run build
npm audit --fetch-retries=0 --fetch-timeout=30000 --logs-max=0
```

No se asigna ni se imprime DATABASE_URL_TEST. Los valores alternativos son exclusivamente sintéticos para pruebas.

### Web: paths pendientes de formato fuera de T16

```text
src/lib/api/admin-types.ts
src/lib/api/catalog-types.ts
src/lib/api/client.ts
src/lib/api/contract-types.ts
src/lib/api/core-types.ts
src/lib/api/hooks/audit.ts
src/lib/api/hooks/contract-admin.ts
src/lib/api/hooks/me.ts
src/lib/api/hooks/renewals.ts
src/lib/api/hooks/signature-style.ts
src/lib/api/hooks/signatures.ts
src/lib/api/hooks/storage.ts
src/lib/api/hooks/system.ts
src/lib/api/hooks/templates.ts
src/lib/api/hooks/users.ts
src/lib/api/hooks/verify.ts
src/lib/api/keys.ts
src/lib/api/lifecycle-types.ts
src/lib/api/status-colors.ts
src/lib/api/storage-types.ts
src/lib/api/types.ts
src/lib/auth/AuthProvider.tsx
src/lib/auth/useSessionState.ts
src/features/contracts/wizard/bound-variables.test.ts
src/features/contracts/wizard/wizard-state.test.ts
src/features/signer/useMyContracts.test.ts
src/features/templates/catalog-filters.test.ts
src/lib/rich-doc/pagination.test.ts
src/lib/rich-doc/rich-v2.test.ts
```

## Límites y trabajo reservado

Quedan fuera H01, H03, H04, H05, H13, H14 y H15, como ordena T16. H17 sigue pendiente en el catálogo de T15: su búsqueda todavía construye el patrón de ILIKE sin escapar el texto. También se reservan a T15 las entradas de H16 en catálogo/preview/PDF. La utilidad común de escape queda disponible para su integración.

No se certifican con fixtures el proveedor S3 real, recuperación de backups ni una infraestructura distribuida completa. Los nuevos presupuestos de identidad/correo usan PostgreSQL compartido; las colas de lectura/exportación/archivos y los límites IP existentes son por instancia. No se introdujo streaming ni un servicio de exportación asíncrona: los volúmenes superiores a los presupuestos se rechazan y deben acotarse.
