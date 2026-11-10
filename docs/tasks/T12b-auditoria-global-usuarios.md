# T12b — Auditoría global y gestión de acceso de usuarios (lanzar DESPUÉS de T10: necesita migración)

**Asignado a:** Codex · **Revisa:** Claude. Lee `docs/PRINCIPIOS.md`, `docs/CODE_STANDARDS.md`, informes T09a y T10.
Alcance: `api/src/modules/audit/**` (nuevo), `api/src/modules/users/**`, `schema.ts` + migración nueva, `api/test/t12b-*.test.ts`. No toques `src/**`.

## 1. Auditoría de administración persistente
Hoy los cambios de usuarios, configuración y plantillas solo van al log del servidor. Tabla `admin_audit_logs` (inmutable desde la API; encadenada con `entryHash/previousHash` como en T10): `id, at, actorId, actorName, area ('users'|'settings'|'templates'|'variables'|'storage'|'auth'), action, targetType, targetId, targetLabel, details jsonb (sin secretos ni datos sensibles), ip`. Escribirla en la misma transacción que cada cambio de: alta/edición/rol/activación/baja de usuarios, ajustes del sistema, plantillas y variables, almacenamiento, ejecución manual de jobs.

## 2. `GET /audit` (admin)
Feed unificado (contratos + administración), paginado `{ data, meta }`, más reciente primero. Filtros: `from`, `to`, `actorId`, `area` (incluye `contracts`), `action`, `contractId`, `q` (código/título/etiqueta). Elemento: `{ id, source: 'contract'|'admin', at, area, action, actorId, actorName, targetType, targetId, targetLabel, contractId, contractCode, summary }` (`summary` = frase en español en pasado). `GET /audit/export?format=csv|xlsx` con los mismos filtros. Solo lectura.

## 3. Acceso de usuarios (nunca fijar contraseñas ajenas)
- `POST /users/:id/password-reset` (admin): envía al usuario el enlace de restablecimiento (mismo mecanismo y caducidad que «olvidé mi contraseña»), cierra sus sesiones, audita. Respuesta 202.
- `POST /users/:id/resend-invite` (admin): reenvía la invitación si aún no activó la cuenta; 409 si ya está activa.
- `GET /users` gana `status` (`active|inactive|invited`) y devuelve `lastLoginAt` e `invitedAt` si existen.

El administrador **no** puede establecer la contraseña de otro (PRINCIPIOS §3/§5); el sistema antiguo lo permitía y se retira a propósito.

## 4. Tests e informe
Permisos, inmutabilidad, cadena, filtros, ausencia de secretos, rate limit en los envíos. `docs/tasks/T12b-auditoria-global-usuarios.REPORT.md` con el contrato para el front. No hagas git commit. No imprimas secretos.
