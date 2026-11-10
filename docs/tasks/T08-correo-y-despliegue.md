# T08 — API: correo (Resend + SMTP) y preparación para desplegar

**Asignado a:** Codex · **Revisa:** Claude · **Depende de:** T03b terminado.
Alcance: `api/src/lib/mailer*`, `api/src/lib/mail/**` (nuevo), `api/src/config/env.ts`, `api/src/server.ts`, `api/src/jobs/**`, `api/src/db/schema.ts` + migración nueva en `api/drizzle/`, `api/src/db/create-admin.ts` (nuevo), los puntos donde se envían correos (`auth`, `notifications`, jobs), `api/test/**`, `api/.env.example`, `api/README.md`, `deploy/.env.prod.example`, `docs/DEPLOY.md`, `docs/tasks/T08*`.
**No toques** los `*/schemas.ts` de los módulos ni `src/lib/validation` (otra tarea, T06, trabaja ahí en paralelo). Lee `docs/CODE_STANDARDS.md` primero.
Sin dependencias nuevas: Resend se llama con `fetch` a su API HTTP (`POST https://api.resend.com/emails`, cabecera `Authorization: Bearer <RESEND_API_KEY>`, JSON `{from, to, subject, html, text}`); SMTP sigue con nodemailer.

## 1. Correo con proveedor configurable
- `MAIL_DRIVER` = `resend` | `smtp` | `log` (por defecto `log` en desarrollo/test; en producción obligatorio `resend` o `smtp`).
  - `resend`: requiere `RESEND_API_KEY`. `smtp`: requiere `SMTP_URL` (o `SMTP_HOST/PORT/USER/PASS/SECURE` si es más claro; elige uno y documéntalo). `log`: escribe en consola **sin** el cuerpo completo ni los enlaces con token (solo destinatario, asunto y tipo).
  - `MAIL_FROM` obligatorio fuera de `log`. Opcional `MAIL_REPLY_TO`.
  - Validación en `config/env.ts` con mensajes claros. Cambiar de Resend a SMTP debe ser solo cambiar variables, sin tocar código.
- Interfaz `MailTransport { send(message): Promise<{ id?: string }> }` con una implementación por driver; errores tipados (temporal vs permanente: 429/5xx/timeouts = temporal; 4xx = permanente).
- **Cola de salida (outbox)**: tabla `email_outbox` (id, to, subject, template, payload jsonb, status pending|sent|failed, attempts, next_attempt_at, last_error recortado, provider_id, created_at, sent_at). Los flujos (registro, recuperación, avisos, firmas pendientes…) **encolan** dentro de su transacción en lugar de enviar en línea; un job (`email-dispatch`, cada minuto, con el advisory lock existente) envía con reintentos exponenciales (máx. 6) y marca `failed`. Así un fallo del proveedor nunca rompe un registro ni una firma. Limpieza de enviados > 30 días en el job `cleanup`.
- Endpoint admin `POST /system/mail/test` {to} que encola un correo de prueba, y que `GET /system/jobs` muestre pendientes/fallidos del outbox.
- **Plantillas** en `src/lib/mail/templates/`: HTML sencillo y compatible con clientes de correo (tablas, estilos en línea, ancho 600px, logo opcional por URL `APP_URL/logo-email.png`, color de acento `#8B2029`, fuente del sistema) + versión texto. Escapa todo dato del usuario. Plantillas: confirmar correo, restablecer contraseña, invitación de usuario (si existe el flujo), es tu turno de firmar, contrato aprobado/devuelto (con comentario), contrato activado (todas las firmas), aviso de vencimiento (30/15/7/1), renovación solicitada/resuelta, correo de prueba. Respeta las preferencias de notificación por email del usuario donde apliquen (los correos de seguridad —confirmar, restablecer— siempre se envían).
- Los enlaces usan `APP_URL` (`/auth/confirmar?token=`, `/auth/restablecer?token=`, `/app/contratos/<id>`, `/app/firmas`).

## 2. Preparación para desplegar (pendientes de T05)
- **HOST**: `server.ts` escucha hoy en `127.0.0.1` fijo. Añade `HOST` validado en `env.ts` (por defecto `127.0.0.1`; el compose de producción pone `0.0.0.0`). Actualiza `docker-compose.prod.yml` solo en la variable `HOST` del servicio api y `deploy/.env.prod.example`.
- **Primer administrador**: script `src/db/create-admin.ts` (y su versión compilada usable en el contenedor: `node dist/db/create-admin.js`) que pide nombre, correo y cédula por argumentos/variables, genera una contraseña temporal fuerte que imprime una sola vez (o la lee de una variable), crea el usuario `admin` con correo confirmado y obliga a cambiar la contraseña en el primer inicio (si no existe ese mecanismo, añade columna `must_change_password` + bloqueo en la API salvo `/me/password` y `/auth/logout`, con tests). Idempotente: si el correo ya existe, no hace nada y lo dice.
- `DATABASE_URL_TEST` no debe ser obligatoria en producción.
- Actualiza `docs/DEPLOY.md` (sección correo: cómo usar Resend —verificar dominio en Resend, registros DNS SPF/DKIM— y cómo pasar a SMTP institucional) y la sección del primer administrador.

## 3. Tests
Transportes con `fetch`/nodemailer simulados: éxito, 429 → reintento, 4xx → failed, outbox encolado dentro de la transacción (si la transacción falla, no queda correo), el job no envía dos veces el mismo correo con dos instancias, `log` no imprime tokens, plantillas escapan HTML, `create-admin` idempotente, `must_change_password`.
Verificación: `npm run format && npm run format:check && npm run typecheck && npm test && npm audit`.

## Informe
`docs/tasks/T08-correo-y-despliegue.REPORT.md`: variables nuevas, cómo probar el envío real, migración añadida, cambios en flujos. No hagas git commit. No imprimas secretos.
