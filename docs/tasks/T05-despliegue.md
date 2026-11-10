# T05 — Despliegue y endurecimiento (servidor de la universidad)

**Asignado a:** Codex · **Revisa:** Claude.
Alcance: crea/edita **solo** `api/Dockerfile`, `api/.dockerignore`, `Dockerfile.web` (raíz), `.dockerignore` (raíz),
`docker-compose.prod.yml`, `deploy/**`, `docs/DEPLOY.md`, `api/.env.example` (si falta algo). **No toques** `api/src/**`,
`api/test/**` ni `src/**` (otras tareas trabajan ahí en paralelo). Si necesitas un cambio de código, descríbelo en el informe.
Lee `docs/CODE_STANDARDS.md`, `docs/HANDOFF.md` (secciones 3 y 5) y `api/README.md` primero.

## Contexto
Monorepo: web React/Vite en la raíz (`npm run build` → `dist/`), API Fastify/TS en `api/` (`npm run build` → `api/dist`, `npm start`),
PostgreSQL 17. La API ya soporta `TRUST_PROXY`, `JOBS_ENABLED`, `APP_URL`, `SMTP_URL` (revisa `api/src/config/env.ts` para la lista real).
Uploads/PDF se guardan en `api/storage/` (revisa la ruta real en el código). El servidor de la universidad puede **no tener salida a internet**:
todo lo necesario va dentro de las imágenes.

## Entregables
1. `api/Dockerfile` multi-stage (node:24-alpine o slim): deps → build → runtime con `npm ci --omit=dev`, usuario no root, `HEALTHCHECK` contra el endpoint de salud real de la API, volumen para storage. Las migraciones se ejecutan con un comando explícito (servicio `migrate` de un solo uso en compose o script `deploy/migrate.sh`), no en cada arranque silenciosamente.
2. `Dockerfile.web`: build de Vite → nginx:alpine sirviendo `dist/` con fallback SPA (`try_files ... /index.html`).
3. `deploy/nginx/nginx.conf` (o `default.conf`): proxy `/api/` → api:3000 (incluye SSE: `proxy_buffering off`, `proxy_read_timeout` largo para `/api/v1/events`), gzip, caché larga para `/assets/*` con hash y `no-cache` para `index.html`, `client_max_body_size` acorde al límite de uploads de la API, cabeceras: `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options DENY`, y una **CSP** estricta compatible con la app (scripts/estilos self; `img-src 'self' data: blob:`; `connect-src 'self'`; anota si Google Fonts sigue en uso — se va a autoalojar). TLS: plantilla con certificados montados (`/etc/nginx/certs`), redirección 80→443.
4. `docker-compose.prod.yml`: servicios `db` (postgres:17-alpine, volumen, sin puerto publicado), `api` (depende de db healthy, `TRUST_PROXY=1`, `JOBS_ENABLED=true`, env desde `.env.prod` no versionado), `web` (nginx, único con puertos publicados 80/443), `migrate` (perfil `tools`), `backup`. Redes internas; `restart: unless-stopped`; límites de logs.
5. Backups: `deploy/backup/` con script `pg_dump -Fc` diario, rotación (7 diarios, 4 semanales), y script de restauración documentado. También copia del volumen de storage.
6. `deploy/.env.prod.example` con todas las variables (sin secretos reales) y cómo generar secretos (`openssl rand -base64 48`).
7. `docs/DEPLOY.md` en español, paso a paso para alguien de TI de la universidad: requisitos, primera instalación, migraciones, crear primer admin (revisa si existe script de seed/admin; si no, indícalo como pendiente en el informe), actualizar versión, backups/restauración, renovación de certificados, logs, solución de problemas.
8. Verificación posible sin red/Docker: valida la sintaxis que puedas (p. ej. `docker compose config` si Docker existe; si no, anótalo). No intentes descargar imágenes.

## Informe
`docs/tasks/T05-despliegue.REPORT.md`: qué se creó, decisiones, lo que no pudiste verificar, y cambios de código que harían falta en `api/src` o `src/`. No hagas git commit.
