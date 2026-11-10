# T01 — API: esqueleto, esquema de BD, auth y usuarios

**Asignado a:** Codex · **Revisa:** Claude · **Contexto:** lee `docs/PLAN.md` primero.

Trabaja SOLO dentro de `api/`. No toques `src/`, `package.json` raíz ni nada del frontend.
No borres `supabase/` (es referencia: el esquema actual está en `supabase/migrations`, la lógica en `supabase/functions`).

## Stack (obligatorio)
- Node 24, TypeScript estricto, ESM (`"type": "module"`), `tsx` para dev.
- Fastify 5, `@fastify/cookie`, `@fastify/cors`, `@fastify/rate-limit`, `@fastify/helmet`.
- PostgreSQL vía `pg` + **Drizzle ORM** + `drizzle-kit` (migraciones SQL generadas en `api/drizzle/`).
- Zod para validar body/query/params (usar `fastify-type-provider-zod`).
- `argon2` para contraseñas, `jose` para JWT, `nodemailer` para email (en dev: transport que imprime el email y el enlace en consola).
- Vitest para tests. Usa versiones actuales y que `npm audit` dé 0 vulnerabilidades.

## Configuración
- `api/.env` ya existe (no lo commitees, no lo imprimas). Variables: `DATABASE_URL`, `DATABASE_URL_TEST`, `JWT_ACCESS_SECRET`, `APP_URL`, `PORT`. Crea `api/.env.example` con las mismas claves y valores de ejemplo. Valida env con Zod al arrancar.
- La BD está en un VPS accesible por túnel en `127.0.0.1:55432` (ya abierto). `simaud_dev` para dev, `simaud_test` para tests.
- Scripts: `dev`, `build`, `start`, `typecheck`, `test`, `db:generate`, `db:migrate`, `db:seed`, `db:reset` (solo si NODE_ENV != production).

## Estructura
```
api/src/
  app.ts            (buildApp(): FastifyInstance — usado por server y tests)
  server.ts
  config/env.ts
  db/schema.ts      (todas las tablas) · db/client.ts · db/seed.ts
  lib/              (errors.ts, auth/jwt.ts, auth/password.ts, mailer.ts, audit.ts)
  plugins/          (auth.ts: decora request.user; requireRole(...roles))
  modules/auth/     (routes.ts, service.ts, schemas.ts)
  modules/me/
  modules/users/
api/test/           (helpers para crear usuarios y obtener tokens; limpiar BD entre tests)
```

## Convenciones de API
- Prefijo `/api/v1`. JSON en camelCase. IDs uuid.
- Error uniforme: `{ "error": { "code": "VALIDATION_ERROR" | "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "EMAIL_NOT_CONFIRMED" | "INVALID_CREDENTIALS" | "RATE_LIMITED" | "INTERNAL", "message": "<texto en español para el usuario>", "details"?: ... } }`.
- Listados: `{ "data": [...], "meta": { "page", "pageSize", "total" } }` con `?page&pageSize&q&sort`.
- Nunca devolver `password_hash`, tokens ni hashes.

## Esquema (todas las tablas ahora; los endpoints de contratos vienen en T02)
Basado en el esquema FINAL de Supabase pero limpio. Enums de Postgres:
- `user_role`: admin, supervisor, gestor, user
- `contract_status` (ÚNICO campo de estado, sustituye status/approval_status/actual_status): draft, pending_approval, rejected, pending_signatures, active, expiring_soon, expired, cancelled, renewed
- `signatory_role`: client, witness, contractor · `signatory_status`: pending, signed, declined
- `approval_status`: pending, approved, rejected · `renewal_status`: pending, approved, rejected, cancelled · `priority`: low, medium, high, urgent
- `variable_type`: text, date, number, select, textarea · `template_status`: active, inactive
- `cancellation_reason`: breach, mutual_agreement, client_request, payment_default, other
- `auth_token_type`: email_confirmation, password_reset

Tablas: `users` (id, email unique citext/lower, password_hash, name, phone, cedula unique parcial cuando no vacía, role default user, avatar_path, email_confirmed_at, is_active default true, deleted_at, last_login_at, timestamps) · `refresh_tokens` (id, user_id, token_hash, family_id, expires_at, revoked_at, replaced_by, user_agent, ip, created_at) · `auth_tokens` (id, user_id, type, token_hash, expires_at, used_at) · `template_variables` · `contract_templates` (variables text[]) · `contracts` (status contract_status, archived bool, archived_at, archived_by, current_version, contract_value numeric(15,2), currency default 'DOP', start_date, end_date, generated_content, variables_data jsonb, parent_contract_id, renewal_type, created_by, approved_by/at, rejection_reason, notes, timestamps) · `contract_signatories` (+ cedula, user_id, signing_order, signature_path, signed_at, ip, user_agent) · `contract_versions` · `contract_approvals` · `contract_audit_logs` · `contract_renewals` · `contract_cancellations` · `notifications` (type text con CHECK de los tipos actuales + approval_result, signature_required, contract_signed) · `files` (id, owner_id, kind avatar|signature|export, path, mime, size, created_at).
Índices donde haya filtros (status, created_by, end_date, user_id+read_at…). FKs con on delete coherente (contratos NO se borran en cascada al borrar usuario: soft delete de usuarios).

## Auth (`/api/v1/auth`)
- `POST /register` {email, password(≥8, letra+número), name, phone, cedula} → crea usuario con rol **siempre `user`** (ignorar cualquier rol enviado), envía email de confirmación, 201. Email/cédula duplicados → 409 con `details.field`.
- `GET /availability?email=&cedula=` → `{ emailAvailable, cedulaAvailable }` (rate-limited).
- `POST /confirm-email` {token} · `POST /resend-confirmation` {email} (respuesta idéntica exista o no el email).
- `POST /login` {email, password} → `{ accessToken, user }` + cookie httpOnly `simaud_rt` (SameSite=Lax, Secure en prod, path `/api/v1/auth`). Email sin confirmar → 403 EMAIL_NOT_CONFIRMED. Usuario inactivo/borrado → 401 genérico. Rate limit 5/min por IP+email.
- `POST /refresh` → rota el refresh token (familia; si se reutiliza uno ya rotado, revocar toda la familia). Devuelve nuevo accessToken.
- `POST /logout` → revoca el refresh actual y borra cookie. `POST /logout-all`.
- `POST /forgot-password` {email} (respuesta idéntica siempre) · `POST /reset-password` {token, password} → revoca todos los refresh tokens del usuario.
- Access token JWT HS256, 15 min, claims: sub, role. El rol se relee de BD en el plugin de auth (si cambió o el usuario está inactivo → 401), para que cambios de rol apliquen al instante.
- Tokens de email/reset: aleatorios 32 bytes, guardar solo hash SHA-256, expiran (confirmación 24 h, reset 1 h), un solo uso. Enlaces: `${APP_URL}/auth/confirmar?token=…` y `${APP_URL}/auth/restablecer?token=…`.

## Perfil propio (`/api/v1/me`)
- `GET /me` · `PATCH /me` {name, phone, cedula} (cédula única → 409)
- `PATCH /me/password` {currentPassword, newPassword} → revoca otros refresh tokens
- `PATCH /me/email` {newEmail, password} → envía confirmación al nuevo email; el cambio se aplica al confirmar (puedes guardar pending_email en users)
- `PUT /me/avatar` (multipart, ≤2 MB, jpeg/png/webp; validar magic bytes; guardar en `api/storage/avatars/` con nombre aleatorio) · `DELETE /me/avatar` · `GET /files/avatars/:name` sirve el archivo.

## Usuarios (`/api/v1/users`, solo admin salvo lookup)
- `GET /users?q=&role=&page=&pageSize=` · `GET /users/:id`
- `POST /users` {email, name, phone, cedula, role, password?} → si no hay password, crea con email confirmado y envía enlace para fijar contraseña (reset token).
- `PATCH /users/:id` {name, phone, cedula, role, email, isActive}
- `DELETE /users/:id` → soft delete + revoca sesiones. Un admin no puede borrarse ni quitarse el rol admin a sí mismo, ni dejar el sistema sin ningún admin (409).
- `GET /users/lookup?cedula=` → para autocompletar participantes: devuelve solo {id, name, email, phone, cedula}; permitido a admin, supervisor, gestor.

## Auditoría
- `lib/audit.ts`: helper `audit(tx, {userId, action, entityType, entityId, oldValues, newValues, ip, userAgent})` que escribe en `contract_audit_logs` cuando aplique (se usará mucho en T02). Para usuarios basta con log estructurado de Fastify.

## Seed (`npm run db:seed`, idempotente)
- Un usuario por rol con email confirmado: admin@simaud.local, supervisor@simaud.local, gestor@simaud.local, usuario@simaud.local; la contraseña sale de `SEED_PASSWORD` del env (añádela a `.env.example`; si no existe, genera una y la imprime una sola vez).
- Las 10 variables y la plantilla de ejemplo de las migraciones de Supabase.

## Tests (Vitest, contra `DATABASE_URL_TEST`, migrar antes de la suite y truncar entre tests)
Mínimo: registro ignora `role:"admin"`; login bloqueado sin confirmar; confirmación de email; refresh rota y detecta reutilización; logout; forgot/reset invalida sesiones; `/me` actualiza y rechaza cédula duplicada; usuarios: no-admin recibe 403, admin no puede borrarse a sí mismo ni quedar sin admins, soft delete bloquea login; rate limit de login.

## Criterios de aceptación
1. `cd api && npm install && npm run db:migrate && npm run db:seed && npm test && npm run typecheck && npm run build` pasan.
2. `npm run dev` levanta en :3000, `GET /api/v1/health` → `{status:"ok", db:"ok"}`.
3. `npm audit` → 0 vulnerabilidades.
4. Al final, escribe `api/README.md` (cómo levantar, scripts, endpoints) y un resumen de lo hecho y de cualquier decisión o duda en `docs/tasks/T01-api-core.REPORT.md`.
