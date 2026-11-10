# T03 — API: renovaciones, notificaciones en tiempo real, tareas programadas, estadísticas, reportes y PDF

**Asignado a:** Codex · **Revisa:** Claude · **Depende de:** T01 y T02 (lee sus REPORT primero).
Solo `api/` y `docs/tasks/`. Referencia de dominio: `supabase/functions/{renewal-manager,contract-expiry-checker,contract-lifecycle,dashboard-stats,reports-*,contract-pdf}` (corrige sus fallos documentados en `docs/PLAN.md`, no los copies).
Dependencias ya instaladas por Claude: `pdfmake`, `exceljs`, `node-cron` (y sus tipos). No añadas otras sin anotarlo en el REPORT.

## 0. Legibilidad (revisión de Claude sobre T02)
El código de T02 está muy compactado (varias sentencias por línea, nombres de una letra). Antes de empezar: `npm run format` (Prettier ya instalado, `.prettierrc.json`), y a partir de aquí escribe código legible: nombres descriptivos, una sentencia por línea, funciones pequeñas con nombre. Refactoriza `src/modules/contracts/*` en ese sentido SIN cambiar comportamiento (los 235 tests deben seguir pasando). `npm run format:check` debe pasar al final.

## 1. Renovaciones (`/api/v1/renewals`)
- `GET /renewals?status=&priority=&page` → con contrato, días al vencimiento, valor actual vs propuesto (+% de variación), solicitante. Permisos: admin/supervisor todas; gestor las de sus contratos; firmante las que pidió.
- `GET /renewals/eligible` → contratos `active|expiring_soon|expired` sin renovación pendiente, que el usuario puede renovar (una sola consulta, sin N+1).
- `POST /renewals` {contractId, proposedStartDate, proposedEndDate, proposedValue, reason} → valida fechas (inicio > fin actual - 1 día; fin > inicio), prioridad calculada: `urgent` ≤15 días, `high` ≤30, `medium` ≤60, `low` resto. Notifica al creador del contrato y admin/supervisores.
- `POST /renewals/:id/approve` {response?} → transacción con `FOR UPDATE`, idempotente (409 si ya no está pending): crea contrato hijo en `draft` (copia plantilla, variables con fechas/valor nuevos, firmantes con mismo orden; `parent_contract_id`, `renewal_type='manual_renewal'`), enlaza `new_contract_id`. El original pasa a `renewed` **cuando el hijo se active** (hook en la activación de T02), no antes. Notifica.
- `POST /renewals/:id/reject` {response} (obligatorio) · `POST /renewals/:id/cancel` (solicitante).
- Quién procesa: admin, supervisor o el creador del contrato.

## 2. Notificaciones (`/api/v1/notifications`)
- `GET /notifications?unread=&page` · `GET /notifications/unread-count` · `POST /notifications/:id/read` · `POST /notifications/read-all` · `DELETE /notifications/:id`. Solo las propias.
- Cada notificación lleva `link` relativo del front (`/contratos/<id>`, `/aprobaciones`, `/renovaciones`, `/firmas`).
- **SSE** `GET /api/v1/events` (auth por access token en query `?token=` de vida corta: crea `POST /events/ticket` que devuelve un ticket de un solo uso, 30 s, para no exponer el JWT en logs). Emite `notification` (nueva notificación), `unread-count`, `role-changed` (si el admin cambia el rol del usuario: el front recarga sesión) y `ping` cada 25 s. Implementación con un bus en memoria (EventEmitter) detrás de una interfaz para poder cambiar a Postgres LISTEN/NOTIFY después.
- Preferencias: `GET/PATCH /me/notification-preferences` {emailOnSignatureRequired, emailOnApprovalResult, emailOnExpiry} (tabla nueva o columna jsonb en users; migración).

## 3. Tareas programadas (`src/jobs/`)
- Scheduler con `node-cron` activado por `JOBS_ENABLED=true` (false en tests). Lock por `pg_try_advisory_lock` para que con varias instancias solo corra una. Tabla `job_runs` (name, started_at, finished_at, ok, summary jsonb, error).
- `contract-status` (cada día 00:15 America/Santo_Domingo + al arrancar): `active→expiring_soon` si vence en ≤ `EXPIRY_WARNING_DAYS` (config, def. 30); `active|expiring_soon→expired` si `end_date < hoy`. Audita cada cambio con usuario `system`.
- `expiry-notifications` (diario 08:00): avisos a 30, 15, 7 y 1 día al creador y firmantes; ≤7 días también a admin/supervisores. Deduplicado por (contrato, usuario, umbral) con índice único, no por ventana de tiempo.
- `cleanup` (semanal): borra notificaciones leídas > 90 días y refresh/auth tokens vencidos > 30 días.
- Endpoints admin: `GET /system/jobs` (último run de cada job) · `POST /system/jobs/:name/run`.
- `GET/PATCH /system/settings` (admin): `expiryWarningDays`, `expiryNotificationDays` [30,15,7,1], datos de la institución para el PDF (nombre, RNC, dirección, logo opcional). Tabla `settings` clave/valor jsonb.

## 4. Estadísticas (`GET /api/v1/dashboard`), rol SIEMPRE del token
Devuelve exactamente lo que pintan las pantallas del diseño (ver `docs/ui-redesign.html` y el lienzo):
- **admin**: `attention {pendingApprovals, oldestPendingDays, expiring30, urgentRenewals}`, `kpis {activeContracts, activeValue, pendingSignatures, contractsAwaitingSignatures, avgApprovalDays}` cada uno con `previous` (mes anterior) y `trend` (últimos 6 valores mensuales para la sparkline), `monthly [{month:'2026-06', created, signed}]` 6 o 12 meses (`?months=`), `byStatus {status:count}`, `pendingApprovals [5 más antiguas]`, `upcomingExpirations [5]`.
- **supervisor**: `kpis {toReview, approvedThisMonth, returnedThisMonth, returnRate, myAvgResponseDays}`, cola (5), `templateUsage [{templateId,title,count}]`, `myRecentDecisions [5]`.
- **gestor**: `kpis {myActive, myValue, firstTimeApprovalRate, institutionFirstTimeApprovalRate, pendingSignatures}`, `lanes {returned:[], drafts:[], awaitingSignatures:[]}` (con progreso de firmas y comentario de devolución), `recent [5]`.
- **user**: `myTurn []`, `waitingOthers []`, `signed []` (vía firmantes).
Todo con consultas agregadas en SQL (sin traer tablas completas a memoria). Montos como string decimal, nunca float.

## 5. Reportes (`/api/v1/reports`), admin y supervisor (gestor: solo sus contratos)
- `GET /reports/contracts?from&to&groupBy=status|month|template|manager&templateId&managerId` → filas + totales.
- `GET /reports/users?groupBy=role|activity` (solo admin; sin cédulas ni teléfonos).
- `GET /reports/approvals?from&to` → tiempos de aprobación, tasa de devolución por gestor y por supervisor.
- `GET /reports/:type/export?format=csv|xlsx|pdf&…mismos filtros` → descarga real (`Content-Disposition`), XLSX con `exceljs` (cabecera con estilo, anchos, formato de moneda DOP y fechas), PDF con `pdfmake`. CSV con BOM UTF-8 y `;` como separador (Excel en español).

## 6. PDF del contrato
- `GET /contracts/:id/pdf` (mismos permisos que ver el contrato) → `application/pdf` generado con `pdfmake`: cabecera con datos de la institución (settings), título, código y versión, contenido renderizado (sin HTML crudo: convierte el texto con párrafos y negritas `**…**` simples), bloque de firmas con la imagen PNG de cada firma, nombre, rol, cédula, fecha y hora, y una página final de **constancia** con la auditoría de firma (fecha/hora, IP, user agent, versión, hash SHA-256 del contenido firmado).
- Al completarse la última firma (T02), guarda el PDF final en `storage/contracts/<id>-v<n>.pdf` y su hash en el contrato (`signed_pdf_path`, `signed_pdf_sha256`; migración). `GET /contracts/:id/pdf?final=true` sirve ese archivo.
- Fuentes: incluye en `api/assets/fonts/` las TTF de Source Serif 4 y Geist si están en `node_modules` de algún paquete; si no, usa Roboto que trae pdfmake y anótalo en el REPORT.

## Tests
Renovación: idempotencia (doble approve → 409, un solo hijo), hijo activo → original `renewed`. Jobs: transición de estados por fecha (fecha simulada), deduplicación de avisos, lock. SSE: recibe `notification` tras una firma. Dashboard: forma de respuesta por rol y que un gestor no ve datos ajenos. Export: XLSX y CSV válidos (leer de vuelta), PDF empieza por `%PDF`. Permisos de reportes.

## Criterios de aceptación
`npm test`, `npm run typecheck`, `npm run build`, `npm audit --offline` limpios; actualiza `api/README.md` con todos los endpoints nuevos y `docs/tasks/T03-api-ciclo-vida.REPORT.md`.
