# T09b — Correcciones de seguridad y lógica: contratos, firmas, archivos y copias

**Asignado a:** Codex · **Revisa:** Claude · **Origen:** `docs/tasks/T07-auditoria-seguridad.REPORT.md` (léelo: H01, H03, H08, H09, H12).
**Depende de:** T06 y T08 terminados.
Alcance: `api/src/modules/contracts/**`, `api/src/modules/renewals/**`, `api/src/modules/me/avatar.ts`, `api/src/modules/me/service.ts` (solo el vínculo por cédula de H01), `api/src/lib/storage*` / archivos, `api/src/jobs/cleanup.ts`, migración nueva (numera después de la de T09a si ya existe; si chocan, renómbrala y anótalo), `deploy/backup/**`, `docs/DEPLOY.md` (sección copias), `api/test/**` (archivos propios), `docs/tasks/T09b*`.
**No toques:** `plugins/auth.ts`, `lib/auth/**`, `modules/auth/**`, SSE/notificaciones, `lib/mail/**`, `jobs/email-dispatch.ts`, `config/env.ts` (T09a trabaja ahí en paralelo; si necesitas una variable, pídela en el informe).
Base de pruebas: la por defecto (`simaud_test`). Lee `docs/CODE_STANDARDS.md`.

## Correcciones
- **H01 (Alta) — vínculo de firmantes**: un firmante invitado sin `userId` solo se vincula a una cuenta por **correo confirmado** que coincida exactamente (normalizado). La cédula del perfil **nunca** concede acceso ni vincula. En la creación/edición de contratos, `reconcileSignatories` solo autocompleta el `userId` cuando correo y cédula coinciden con un usuario con correo confirmado (si solo coincide la cédula, el firmante queda como invitado por correo). Garantiza un único firmante por (contrato, usuario) con índice único. Revisa vínculos existentes en la migración (deja un informe de los que no cumplan, no los borres). Tests de todos los escenarios del informe.
- **H03 — imágenes de firma**: decodificar el PNG antes de persistir (usa el decodificador ya instalado — `png-js`/`pngjs` vía pdfkit — o `zlib` + verificación de chunks; no añadas dependencias nativas), límites de ancho/alto (p. ej. ≤ 2000×1000) y de píxeles, y recodificar/guardar solo si decodifica. 400 claro si no. Mismo criterio para avatar y logo institucional si se aceptan PNG/JPEG (al menos verificar decodificación). Tests: truncado, enorme, válido; ninguna fila/archivo parcial.
- **H08 — variables históricas**: snapshot de las definiciones de variables (nombre, tipo, requerido, opciones) en la versión del contrato al crearlo/versionarlo, y la renovación usa ese snapshot. Además, impedir borrar una variable referenciada por contratos no cancelados/archivados (409 con explicación). Migración que rellene el snapshot de contratos existentes desde las definiciones actuales.
- **H12 — DTOs de listas**: `GET /me/signatures` y las listas de renovaciones devuelven un resumen explícito (id, code, title, status, valor, fechas, mi firmante/rol/orden, `myTurn`, progreso de firmas, creador nombre) sin `content`, `generatedContent`, `variablesData`, rutas ni hashes de PDF. Paginación en `/me/signatures` (por estado). Documenta el nuevo shape en el informe para que Claude ajuste `src/lib/api`.
- **H09 — copias coherentes**: los borrados físicos de archivos (contrato eliminado, avatar reemplazado, etc.) pasan a mover el archivo a `storage/.trash/AAAA-MM-DD/` y el job `cleanup` purga la papelera con más de 8 días (mayor que la retención diaria de copias + margen). Así un `pg_dump` seguido del `tar` nunca pierde archivos referenciados. Actualiza `deploy/backup/backup.sh` para excluir `.trash` del tar solo si se documenta por qué es seguro (si no, inclúyela) y la guía. Añade a `restore.sh` una comprobación de referencias BD ↔ archivos que liste faltantes.

## Verificación
`npm run format && npm run format:check && npm run typecheck && npm test && npm audit` desde `api/`.

## Informe
`docs/tasks/T09b-seguridad-contratos.REPORT.md`: cambios por hallazgo, nuevos shapes de API para el front, migración, tests. No hagas git commit.
