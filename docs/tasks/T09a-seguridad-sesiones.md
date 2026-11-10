# T09a — Correcciones de seguridad: sesiones, autenticación y correo

**Asignado a:** Codex · **Revisa:** Claude · **Origen:** `docs/tasks/T07-auditoria-seguridad.REPORT.md` (léelo: H02, H04, H05, H06, H07, H11).
**Depende de:** T06 y T08 terminados.
Alcance: `api/src/plugins/auth.ts`, `api/src/lib/auth/**`, `api/src/modules/auth/**`, `api/src/modules/me/service.ts` y `me/routes.ts` (solo contraseña/sesiones), `api/src/modules/notifications/events.ts` (SSE), `api/src/lib/events.ts`, `api/src/lib/mail/**`, `api/src/jobs/email-dispatch.ts`, `api/src/db/schema.ts` + migración nueva, `api/src/config/env.ts`, `api/test/**` (tests nuevos en archivos propios), `docs/tasks/T09a*`.
**No toques:** `api/src/modules/contracts/**`, `renewals/**`, `catalog`, `me/avatar.ts`, `jobs/cleanup.ts`, `deploy/**` (T09b trabaja ahí en paralelo).
Base de pruebas: usa la variable `DATABASE_URL_TEST` de tu entorno (apunta a `simaud_test2`). Lee `docs/CODE_STANDARDS.md`.

## Correcciones
- **H02 — revocación de access tokens**: sesión estable (familia de refresh) con id en el JWT (`sid`), comprobada en cada `authenticate` (estado activo de la familia) **y** `credentials_version`/`tokens_valid_after` en users. Logout revoca su familia; logout-all, reset de contraseña y detección de reuso revocan todas; cambio de contraseña desde el perfil revoca las demás y conserva la actual. La rotación de refresh no debe invalidar la familia. Coste: una consulta indexada por request (o caché en memoria ≤ 30 s documentada).
- **H06 — SSE**: el ticket y la conexión llevan `sid`; al revocar se cierran las conexiones de esa sesión/usuario desde el servidor (vía el bus de eventos); revalidación periódica (cada heartbeat o ≤ 60 s) y duración máxima de conexión (p. ej. 1 h) que obliga a pedir ticket nuevo. Mismo efecto para inactivación/cambio de rol.
- **H07**: al cambiar la contraseña (perfil o reset) invalidar en la misma transacción los `password_reset` pendientes del usuario.
- **H04 — rate limit**: además del límite por IP+email, un presupuesto agregado por IP en login (p. ej. 20/min) y en registro/recuperar/reenviar; límite de concurrencia del hash Argon2 (cola/semaforo, p. ej. 4 simultáneos) con 503/429 claro. Tests.
- **H05 — enumeración**: eliminar la comprobación pública de cédula; el registro no debe revelar si un correo o cédula ya existe: respuesta idéntica (202 «Revisa tu correo») y, si el correo ya tenía cuenta, encolar un aviso a ese correo («ya tienes cuenta; ¿olvidaste tu contraseña?»). Mantener la disponibilidad de email solo si se documenta como decisión; por defecto retírala también. Coordina el contrato de respuesta en el informe para que Claude ajuste el front.
- **H11 — outbox**: no guardar tokens en claro: cifrar el payload sensible con AES-256-GCM con clave `MAIL_PAYLOAD_KEY` (env, obligatoria fuera de test; documentar generación) o, mejor si encaja, guardar solo el id del `auth_token` y reconstruir el enlace al enviar (requiere poder regenerar → normalmente no; elige cifrado). Borrar el payload al envío, al fallo terminal y al expirar el token (`expires_at` en la fila; el job `email-dispatch` purga expirados).

## Verificación
`npm run format && npm run format:check && npm run typecheck && npm test && npm audit` desde `api/`. Todos los tests nuevos que propone el informe T07 para estos hallazgos.

## Informe
`docs/tasks/T09a-seguridad-sesiones.REPORT.md`: qué cambió por hallazgo, contrato de API que cambia (registro, disponibilidad, errores nuevos) para el front, migración, variables nuevas. No hagas git commit. No imprimas secretos.
