# T04 — Web: capa de datos (cliente API, sesión, hooks, formato)

**Asignado a:** Codex · **Revisa:** Claude · **Lee primero:** `docs/CODE_STANDARDS.md` (obligatorio), `api/README.md`, `docs/tasks/T01..T03` (T03 se está implementando en paralelo: usa su especificación como contrato).

## Alcance estricto
Trabaja SOLO en:
- `src/lib/api/**` (nuevo), `src/lib/auth/**` (nuevo), `src/lib/format.ts` (nuevo), `src/lib/query.ts` (nuevo), tests en `src/**/*.test.ts(x)`
- `vite.config.ts`: únicamente añadir `server.proxy` para `/api` → `http://localhost:3000` (no toques el plugin `simaud-ui-mock`)
- `package.json` raíz: solo scripts `test`, `typecheck` (`tsc --noEmit -p tsconfig.app.json`), `format`, `format:check`; añade `vitest.config.ts` (jsdom).
NO toques `api/`, ni componentes en `src/components/**`, ni `App.tsx`, ni `AuthContext.tsx` actual, ni estilos. Claude integra la UI después.
Dependencias ya instaladas: `@tanstack/react-query`, `vitest`, `jsdom`, `msw`, `@testing-library/react`, `prettier`. No añadas otras sin anotarlo en el REPORT.

## 1. Cliente HTTP — `src/lib/api/client.ts`
- `apiFetch<T>(path, { method, body, query, signal, formData })` sobre `fetch` con base `/api/v1`, `credentials: 'include'`, JSON por defecto, query string tipado.
- Access token **solo en memoria** (nunca localStorage). Cabecera `Authorization: Bearer`.
- Si responde 401: un único refresh en vuelo (single-flight) a `POST /auth/refresh`; reintenta la petición original una vez. Si refresh responde `409 REFRESH_RACE`, espera 300 ms y reintenta el refresh una vez (otra pestaña ya rotó la cookie). Si falla, emite evento `session-expired`.
- Sincroniza entre pestañas con `BroadcastChannel('simaud-auth')`: login, logout y token renovado.
- Errores normalizados en `class ApiError extends Error { status; code; details; }` con el formato de la API; errores de red → `code: 'NETWORK'` con mensaje en español.
- Descargas: `apiDownload(path, query)` que devuelve `{ blob, filename }` leyendo `Content-Disposition` (para PDF/XLSX/CSV).

## 2. Tipos — `src/lib/api/types.ts`
Tipos TS de todas las respuestas y cuerpos de T01–T03 (usuario, rol, contrato con `status` único y `can`, firmante, versión, auditoría, aprobación, plantilla, variable, renovación, notificación, dashboard por rol, reportes, settings, jobs). `ContractStatus` y su mapa de etiquetas en español + tono de color (`neutral|warning|danger|info|success|violet`) en `src/lib/api/status.ts` (Borrador, En aprobación, Devuelto, Por firmar, Vigente, Por vencer, Vencido, Cancelado, Renovado). Lo mismo para roles (Administrador, Supervisor, Gestor, Firmante).

## 3. Hooks TanStack Query — `src/lib/api/hooks/*.ts`
Un archivo por dominio: `auth`, `me`, `users`, `templates`, `variables`, `contracts`, `approvals`, `signatures`, `renewals`, `notifications`, `dashboard`, `reports`, `system`.
- Claves de query centralizadas en `src/lib/api/keys.ts`.
- Mutaciones que invalidan exactamente lo afectado (ej. aprobar → `contracts.detail(id)`, `contracts.list`, `contracts.counts`, `approvals`, `dashboard`).
- Listados paginados con `placeholderData: keepPreviousData`.
- `useContractCounts()` para las pestañas; `useUnreadCount()`.
- `useServerEvents()` en `notifications.ts`: pide ticket (`POST /events/ticket`), abre `EventSource('/api/v1/events?ticket=')`, reconecta con backoff, y al recibir `notification`/`unread-count` actualiza la caché; en `role-changed` invalida `me`.
- `src/lib/query.ts`: `createQueryClient()` con reintentos solo para errores de red/5xx (nunca 4xx), `staleTime` razonable, y manejador global que en `session-expired` limpia la caché.

## 4. Sesión — `src/lib/auth/`
- `AuthProvider` + `useAuth()` nuevos (no sustituyen aún al viejo; Claude los conectará): estado `loading | authenticated | anonymous`, `user`, `login`, `logout`, `register`, `hasRole(...roles)`. Al arrancar intenta `POST /auth/refresh` silencioso y luego `GET /me`.
- `RequireAuth` y `RequireRole` (componentes guard sin estilos: reciben `fallback` y `children`) para React Router 7.

## 5. Formato — `src/lib/format.ts`
`formatMoney(value: string|number)` → `RD$ 87.500,00` (es-DO, DOP; acepta string decimal sin pasar por float cuando sea posible), `formatMoneyShort` → `RD$ 42,6 M`, `formatDate` (`9 nov 2026`), `formatDateTime`, `formatRelative` (`hace 2 h`, `en 12 días`), `daysUntil`, `formatCedula` / `isValidCedula` (algoritmo de dígito verificador de la cédula dominicana), `formatPhone`. Todo con tests.

## Tests (Vitest + MSW)
Refresh single-flight con 3 peticiones 401 simultáneas → un solo refresh; `REFRESH_RACE` reintenta; `session-expired` al fallar; normalización de errores; invalidaciones de una mutación de ejemplo; formateadores (incluye cédulas válidas e inválidas).

## Criterios de aceptación
`npm run test`, `npm run format:check` (solo sobre los archivos nuevos: configura Prettier para no reformatear el resto del frontend todavía, p. ej. `.prettierignore` con `src/components/**`), `npx tsc --noEmit -p tsconfig.app.json` sin errores NUEVOS en tus archivos (el resto del frontend tiene errores previos que no son tuyos), `npm run build`. Escribe `docs/tasks/T04-web-capa-datos.REPORT.md`.
