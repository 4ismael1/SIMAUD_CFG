# T03 — API de ciclo de vida: informe de cierre

Fecha: 2026-11-09. Incluye la implementación T03 existente y el refactor T03b.

## Alcance y estado

Se leyeron primero docs/CODE_STANDARDS.md, T03-api-ciclo-vida.md y T03b-api-legibilidad.md; también los informes de T01 y T02. La implementación funcional de T03 ya estaba presente al comenzar. Esta sesión modifica exclusivamente api/src/** y este informe; no modifica tests, dependencias, migraciones, configuración de despliegue, Dockerfiles ni frontend. Se conservaron los cambios ajenos concurrentes. No se imprimió ni modificó api/.env. No se hizo commit ni staging.

El objetivo de T03b es mejorar la legibilidad conservando respuestas, permisos, parámetros SQL, orden de consultas y límites de las transacciones. No se encontraron bugs funcionales que requirieran cambios de comportamiento ni nuevas pruebas.

## Entrega funcional de T03

Todas las rutas llevan el prefijo /api/v1. Los permisos se obtienen de la autenticación del servidor.

| Área | Endpoints existentes |
| --- | --- |
| Renovaciones | GET /renewals; GET /renewals/eligible; POST /renewals; POST /renewals/:id/approve, /reject, /cancel |
| Notificaciones | GET /notifications; GET /notifications/unread-count; POST /notifications/:id/read; POST /notifications/read-all; DELETE /notifications/:id |
| SSE | POST /events/ticket; GET /events?token=… |
| Preferencias | GET/PATCH /me/notification-preferences |
| Sistema, solo admin | GET /system/jobs; POST /system/jobs/:name/run; GET/PATCH /system/settings |
| Dashboard | GET /dashboard?months=6 o 12 |
| Reportes | GET /reports/contracts, /reports/users, /reports/approvals; GET /reports/:type/export?format=csv, xlsx o pdf |
| PDF contractual | GET /contracts/:id/pdf; GET /contracts/:id/pdf?final=true |

### Renovaciones

Listado paginado con contrato, solicitante, días al vencimiento, valor actual/propuesto y variación decimal. Admin/supervisor ven todas; gestor las de sus contratos y solicitantes las propias. Elegibles aplica permisos y exclusión de renovaciones en una consulta con EXISTS. Solicitar valida fechas y calcula urgent/high/medium/low con umbrales de 15/30/60 días. El creador y admin/supervisor procesan; cancelar corresponde al solicitante y rechazar exige respuesta.

Aprobar bloquea primero el original y después la renovación con FOR UPDATE. La repetición devuelve 409. Crea un único hijo draft con plantilla, contenido, variables actualizadas si existen, datos del contrato y firmantes pendientes en el mismo orden. Conserva parentContractId, renewalType=manual_renewal y newContractId. El original pasa a renewed cuando el hijo se activa, mediante última firma o activación administrativa, con auditoría y avisos en la transacción.

### Notificaciones, SSE y preferencias

Listados, lectura y borrado se limitan al usuario. Se expone link relativo y se actualiza el contador al leer/borrar. Preferencias JSONB: emailOnSignatureRequired, emailOnApprovalResult y emailOnExpiry, true por defecto, con actualización parcial atómica; afectan al correo y conservan los avisos de aplicación.

El ticket SSE aleatorio se guarda hasheado, dura 30 segundos y se consume una vez. No se acepta el JWT en la URL SSE. Se revalida actividad y rol antes de conectar. Eventos: notification, unread-count, role-changed y ping cada 25 segundos. La interfaz EventBus usa EventEmitter; los efectos de notificación se publican después del commit y no se publican tras rollback. El cierre de la aplicación cancela conexiones y suscripciones.

### Jobs y ajustes

node-cron se habilita con JOBS_ENABLED=true y permanece deshabilitado en tests. Zona horaria: America/Santo_Domingo. Cada ejecución manual o programada conserva una conexión reservada para pg_try_advisory_lock; si otra ejecución tiene el lock devuelve skipped. job_runs registra inicio, fin, resultado, resumen y error saneado. El cierre espera los jobs activos.

| Job | Horario y comportamiento |
| --- | --- |
| contract-status | 00:15 y al arrancar: active → expiring_soon según expiryWarningDays; active/expiring_soon → expired si end_date < hoy; auditoría system, userId null |
| expiry-notifications | 08:00: umbrales 30/15/7/1 por defecto; creador y firmantes; hasta 7 días también admin/supervisor activos |
| cleanup | Domingo 03:00: leídas hace más de 90 días y auth/refresh tokens vencidos hace más de 30 días |

expiry_deliveries mantiene la clave única contrato/usuario/umbral aunque se borre el aviso o corra cleanup. Settings persiste expiryWarningDays, expiryNotificationDays e institution {name,rnc,address,logo}; los valores persistidos prevalecen sobre los predeterminados, incluido EXPIRY_WARNING_DAYS=30. Logo acepta PNG data URI opcional.

### Dashboard y reportes

Dashboard agrega y limita en PostgreSQL; el rol procede del usuario autenticado. Admin obtiene atención, KPIs con value/previous/trend, series de 6/12 meses, estados, cola y vencimientos. Supervisor obtiene su cola, métricas, plantillas y decisiones; gestor sus métricas, columnas y recientes, junto a la tasa institucional agregada; user obtiene turnos, espera y firmas propias. Los importes JSON son strings decimales.

Reportes comparten filtros y permisos entre JSON y exportaciones. Usuarios es exclusivo de admin y no expone cédulas ni teléfonos. Gestor queda limitado a sus contratos incluso con managerId ajeno. CSV usa BOM UTF-8, separador ;, escape y protección frente a fórmulas. XLSX usa ExcelJS con cabeceras, anchos, fechas, moneda DOP y totales. PDF usa pdfmake. Las descargas incluyen Content-Disposition y caché privada.

### PDF contractual

Se aplican permisos de lectura del contrato. El PDF contiene institución, título/código/versión, párrafos y negritas simples, imágenes y datos de firmantes, y constancia final con fecha/hora, IP, user agent, versión y SHA-256 del contenido firmado almacenado. La última firma persiste storage/contracts/<id>-v<n>.pdf y el hash de sus bytes; final=true verifica integridad y sirve esos bytes. La activación administrativa no fabrica un PDF firmado.

## Migraciones y decisiones existentes

- 0004_t03_lifecycle.sql: job_runs, settings, preferencias JSONB, metadatos signed_pdf_path/signed_pdf_sha256 e índice de deduplicación de avisos.
- 0005_t03_expiry_deliveries.sql: registro durable de entregas con índice único por contrato/usuario/umbral. El esquema conserva 17 tablas.
- README, configuración de ejemplo, fuentes y migraciones ya estaban implementados. T03b no los modifica ni vuelve a aplicar migraciones.
- Se usa Roboto distribuido por pdfmake: el informe previo de T03 documenta que Source Serif 4 y Geist TTF no estaban disponibles en los paquetes instalados. No se añadieron dependencias en T03b.
- Se excluyen también renovaciones aprobadas cuyo hijo sigue en curso; un hijo cancelado permite solicitar otra renovación.
- Bus y tickets SSE son locales a cada instancia; varias instancias requieren afinidad o un adaptador compartido. No hay replay SSE.
- El correo se envía después del commit, sin cola durable. PostgreSQL y archivos no comparten commit físico; una caída abrupta puede dejar archivos huérfanos.
- Los históricos mensuales usan auditoría y recurren al estado/valor conservado para documentos importados sin historial.

## T03b refactor

- Dashboard: routes.ts valida y delega; service.ts compone respuestas; queries.ts comparte alcance/cola y helpers; admin-queries.ts, supervisor-queries.ts, gestor-queries.ts y user-queries.ts agrupan consultas por rol.
- Renovaciones: schemas.ts conserva validaciones; queries.ts contiene elegibles/listado; service.ts contiene transacciones, permisos, avisos y creación del hijo extraída a una función propia; routes.ts se limita al flujo HTTP.
- Reportes: schemas.ts, service.ts y export.ts separan validación, consultas y generación de archivos. routes.ts conserva permisos HTTP y descargas.
- Sistema: consultas de últimas ejecuciones en service.ts y persistencia de ajustes en settings.ts.
- Notificaciones: operaciones y preferencias en service.ts; tickets/conexiones SSE en events.ts; routes.ts valida y delega.
- Jobs: index.ts conserva scheduler, locks y registro de ejecuciones; cada trabajo tiene su archivo. Se mantiene el orden y alcance transaccional original.
- SQL multilínea con columnas y cláusulas separadas; santoDomingoToday en lib/sql.ts reutiliza la expresión de fecha. Se añadieron separaciones entre imports/funciones y se eliminaron imports y parámetros sobrantes de las extracciones.
- Se documentó el motivo del catch de limpieza del PDF, conservando su comportamiento de mejor esfuerzo.
- Se conservaron las exportaciones previas de adminDashboard, renewalPriority, activateRenewalParent, csvCell y exportReport desde routes.ts para sus consumidores existentes.

No hubo correcciones funcionales. Como comprobación adicional se compararon los tokens y parámetros de las 61 plantillas SQL de los módulos T03 y jobs frente a HEAD, normalizando solo renombres de variables y expandiendo santoDomingoToday: sin consultas añadidas, eliminadas ni alteradas. Todos los archivos revisados de T03 quedan por debajo de 300 líneas y sin líneas de más de 120 columnas. Las consultas SQL y algunas operaciones transaccionales superan la orientación de 40 líneas para conservar juntas sus reglas y transacciones.

## Verificación de esta sesión

| Comprobación | Resultado |
| --- | --- |
| npm run format | Correcto, salida 0 |
| npm run format:check | Correcto, salida 0 |
| npm run typecheck | Correcto, salida 0 |
| npm test | 255/255 aprobadas, 6 archivos, sin skips, salida 0; 417,27 s |
| npm run build -- --outDir test/.t03b-build | Correcto, salida 0; salida temporal eliminada |
| npm audit | Falló la consulta a https://registry.npmjs.org/-/npm/v1/security/advisories/bulk; no se declara aprobado |
| npm audit --offline | 0 vulnerabilidades, salida 0 |
| Comparación de SQL | 61 plantillas equivalentes; sin diferencias de tokens/parámetros normalizados |
| Límites de legibilidad T03 | Ningún archivo revisado supera 300 líneas ni ninguna línea supera 120 columnas |
| git diff --check (api/src y api/test) | Correcto |


Se conservaron las 255 pruebas existentes. Cubren permisos y aislamiento, renovación concurrente y un único hijo, activación del padre, PDF final/hash, estados por fecha inyectada, deduplicación, locks, cleanup, preferencias, rollback/eventos, SSE real después de firmar, dashboards y exportaciones CSV/XLSX/PDF. T03b no modifica ni elimina aserciones.

La terminal estándar falla al iniciar con setup refresh had errors; se ejecutaron los scripts npm mediante Node 24.16.0 y el runtime de Node disponible. Para respetar el alcance de escritura, build emitió temporalmente en api/test/.t03b-build, directorio eliminado al terminar. No se modificaron los artefactos dist/.

La auditoría online no pudo confirmarse en esta sesión por el fallo de acceso al endpoint de auditoría npm. La auditoría offline con cero vulnerabilidades y el estado de partida verificado por Claude se registran por separado; no sustituyen una auditoría online nueva satisfactoria. No quedan decisiones de implementación pendientes; esa comprobación externa queda pendiente del entorno.
