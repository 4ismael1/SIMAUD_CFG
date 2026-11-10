# HANDOFF — SIMAUD: estado del trabajo y cómo continuar

## ⚡ ÚLTIMA ACTUALIZACIÓN (fin sesión 2, 9-10 nov 2026) — LEER PRIMERO
Rama `feat/backend-propio-y-nueva-ui` (todo commiteado salvo el trabajo en curso de Codex en `api/`). `main` intacta.
Lee también **`docs/PRINCIPIOS.md`** (obligatorio: lo firmado no se borra, auditoría, mínimo privilegio…) y **`docs/CODE_STANDARDS.md`** (sección «Interfaz: acciones y avisos»).

### Modo de trabajo
- El dueño quiere: **Codex escribe la lógica; Claude revisa/comprueba y hace el front/diseño.** Ahorra cuota de Claude.
- **Binario de Codex**: usar `/c/Users/ismae/AppData/Local/OpenAI/Codex/bin/f71a721e0e6193a9/codex.exe` (0.167). El `codex` del PATH (0.162) está roto (`setup refresh had errors`). Si la app de Codex se actualiza, buscar el `codex.exe` más nuevo en `AppData/Local/OpenAI/Codex/bin/*/` y probar con una tarea trivial. Escalonar ~30 s los lanzamientos paralelos. Flags: `exec -C . -s workspace-write -c sandbox_workspace_write.network_access=true -c model_reasoning_effort=high --skip-git-repo-check -o <scratch>/codex-TXX-last.md "Implementa docs/tasks/TXX…"`.
- Dos BD de pruebas en Instabox: `simaud_test` y `simaud_test2`. Para un segundo Codex en paralelo, exportar `DATABASE_URL_TEST` igual al de `api/.env` cambiando el nombre de BD a `simaud_test2` (sin imprimirla).
- `api/vitest.config.ts` fuerza `MAIL_DRIVER=log` (los tests nunca envían correos reales).

### Codex: estado
- Hecho y commiteado: T01–T03, T03b, T05 (despliegue), T06 (validaciones cédula JCE/RNC/teléfono/montos), T07 (auditoría), T08 (correo + outbox + primer admin), T09a (sesiones/SSE/límites/registro opaco/outbox cifrada), T09b (vínculo de firmantes, imágenes, variables históricas, DTOs de listas, papelera).
- **EN CURSO al cortar** (pueden haber terminado: revisar `docs/tasks/*.REPORT.md` y `git status`):
  - **T11 almacenamiento disco/S3** (`docs/tasks/T11-almacenamiento.md`, BD `simaud_test`, dep `aws4fetch@1.0.20`): archivos nuevos `api/src/lib/storage-*`, `api/src/modules/system/storage-*`, migración `0009_t11_storage`. Pedirá `SETTINGS_ENCRYPTION_KEY`: generarla en `api/.env` sin imprimirla (como `MAIL_PAYLOAD_KEY`).
  - **T09c adaptar tests antiguos** (BD `simaud_test2`): ~35 tests antiguos fallaban por firmar JWT sin sesión.
  - Al terminar: leer informes; en `api/`: `npm run typecheck && npm run format:check && npm test && npm audit`; commit.
- **Siguiente: T10** (`docs/tasks/T10-firma-certificada.md`): evidencia + cadena de hashes, auditoría encadenada, PDF sellado + QR + verificación pública, API de firma escrita guardada (`/me/signature-style`) y `method/fontId` en la firma (ampliar límite multipart; luego el front los envía), **prohibir borrar contratos firmados (solo draft/rejected sin firmas)**, cifrado de firmas en disco (`FILE_ENCRYPTION_KEY`) sobre la interfaz `StorageDriver` de T11. Lanzar tras T11.
- Después: segunda auditoría completa (Codex, solo lectura) y tests e2e Playwright (Codex).

### Entorno local (IMPORTANTE al retomar)
- La API que corría en :3000 era **vieja (20:19, sin T06–T09)** y por eso «Por firmar» fallaba. Se pidió al dueño detenerla (Claude no puede matar procesos de otra sesión) con PowerShell: procesos `node` cuyo comando contenga `tsx` y `src/server.ts` y no `SIMAUD_RUN` → `Stop-Process`.
- **Worktree limpio** en `C:\Users\ismae\Desktop\simaud\SIMAUD_RUN` (detached en el último commit revisado), con `npm ci` hecho en `api/` y `api/.env` copiado: sirve para correr la API sin el código a medias de Codex. Migraciones 0000–0008 ya aplicadas a `simaud_dev` (la 0007 cerró todas las sesiones). Arrancar en segundo plano desde `SIMAUD_RUN/api` con `MAIL_DRIVER=log npx tsx src/server.ts` (en desarrollo usar `log`: los usuarios seed tienen correos falsos `@simaud.local` y Brevo rebotaría). Cuando entren T11/T10: `git -C ../SIMAUD_RUN checkout --detach <commit>`, copiar `api/.env` si cambió, `npm run db:migrate` ahí.
- Front: Vite del dueño en :5173 (la API solo acepta origen 5173; la preview de Claude va en :5174). Claude no puede leer `SEED_PASSWORD`: el dueño inicia sesión en su navegador o en el panel.
- Correo en `api/.env`: Brevo SMTP (`SMTP_URL`, `MAIL_FROM=SIMAUD <simaud.notificaciones@gmail.com>`, `MAIL_DRIVER=smtp`, probado OK), `RESEND_API_KEY` (alternativa), `MAIL_PAYLOAD_KEY`. Gmail con contraseña de aplicación bloqueado por cuenta nueva (reintentar).
- Instabox (staging autorizado; tocar SOLO la máquina `simaud` = `m_agq4fpcgma6kpfqey5ffoy2wui`): clave en `.env.ops` (ignorado por git). API `https://api.instabox.sh/v1`, cabecera `X-API-Key`; publicar puerto con `POST /v1/machines/<id>/ports` → `https://<puerto>-agq4fpcgma6kpfqey5ffoy2wui.<dominio>/` (HTTPS lo pone Instabox). Docker 29 + Compose v5, 4 CPU, 8 GB. Plan: override de compose para staging con nginx solo HTTP (p. ej. 8080), `TRUST_PROXY=2`, `APP_URL` pública.
- Recordar al dueño **rotar** las claves de Resend, Instabox y Brevo (se pegaron en el chat).

### Front hecho en la sesión 2
Landing rediseñado (scroll-spy, perfiles interactivos, FAQ), acceso pulido, animación (CSS + `motion@14.6.0` vía `m.*` con `LazyMotion` estricto), **sistema de acciones** (`useAction`, `useConfirm`, toasts con «Deshacer» y «en curso», diálogos con salida animada), `cn()` con `tailwind-merge`, firma (pad suavizado, «Ampliar» a pantalla completa, **firma escrita con 8 fuentes manuscritas**), asistente de contrato (firmantes ilimitados, en orden/a la vez/por pasos, arrastrar), cambio de contraseña temporal, fuentes autoalojadas (sin Google), `scrollbar-gutter`, rutas con `lazy` del router. Pantallas: Por firmar, Aprobaciones, Usuarios, Perfil, Configuración, Plantillas + editor, Renovaciones, Reportes. **Ninguna verificada todavía con sesión iniciada.**

### ❗ Críticas del dueño pendientes (diseño → Claude; en este orden)
> **Énfasis del dueño (10 nov):** el panel de **admin está muy vacío**; faltan muchas opciones que **el sistema original ya tenía**. Antes de rediseñar, **inventariar el código viejo** (`src/components/**`, en especial `dashboards/admin`, `contracts/ContractManagement*`, modales de edición/borrado, y las funciones `supabase/functions/*`) y listar TODAS las capacidades del admin original; cada una debe existir en la versión nueva (si falta API → tarea para Codex). Los **reportes son muy malos** (rehacerlos completos). Además: **barrido y pulido general de TODA la interfaz** — los paneles (dashboards) de los 4 roles (admin, supervisor, gestor, firmante), listas, detalle de contrato, formularios y estados vacíos: nada de pantallas simples o pobres; todo con calidad premium coherente con el lienzo aprobado. El **sidebar** y la **barra de búsqueda global** (Ctrl+K) se ven **toscos**: rediseñarlos con calidad de producto premium.
1. **Sidebar** «feo, plano»: más jerarquía visual, **plegable** (modo solo iconos, recordar estado en localStorage con try/catch), y el **bloque de usuario abajo** («admin / Administrador» con chevron) se ve pobre → menú de cuenta bien diseñado (perfil, configuración, cerrar sesión) con nombre real y avatar.
2. **Aprobaciones** «confusa y rara»: rediseñar la vista dividida (cabecera con datos clave, resumen de cambios legible, acciones fijas visibles, mejor en móvil).
3. **Admin «vacío» y sin «acceso a todo»**: el admin debe ver y operar todo. **Módulo avanzado de administración de contratos** en lista y detalle: editar lo permitido, forzar estado con motivo, reasignar gestor, cancelar/archivar (también en lote), eliminar SOLO borradores (PRINCIPIOS: lo firmado se cancela/archiva). Panel de admin más rico. Si falta API (p. ej. reasignar gestor, acciones en lote), escribir la tarea para Codex.
4. **Reportes** «muy básicos y limitados»: filtros (estado, plantilla, gestor, fechas), gráficos (`LineChart`/`DonutChart` de `src/ui/charts`), comparativas con período anterior, KPIs, exportación. Si la API no da los datos, tarea para Codex.
5. Verificar TODAS las pantallas con sesión (el dueño inicia sesión) a 1440/768/375 px y corregir.
6. Pendientes previos: Configuración › Almacenamiento (tras T11), página pública `/verificar` (tras T10), stagger en paneles, borrar código viejo (`src/components`, Supabase; pedir OK para `supabase/`), staging en Instabox y prueba completa con los 4 roles.

### Preguntas abiertas al dueño
- Datos de la institución (nombre, RNC, dirección) para el PDF y la constancia.
- Plazo legal de conservación de contratos firmados.
- «Moverlo y editarlo en el lienzo»: ¿posicionar los recuadros de firma dentro del documento? (requiere API y PDF).
- OK para borrar la carpeta `supabase/`.

> Escrito por Claude el 9 nov 2026 para que otra sesión (otra cuenta) continúe **exactamente** donde se quedó.
> Léelo completo antes de tocar nada. Después lee `docs/PLAN.md` y `docs/CODE_STANDARDS.md`.

## 1. Objetivo del proyecto (lo que pidió el dueño)

1. **Sacar el sistema de Supabase** a un **backend propio** (Node + PostgreSQL), seguro.
2. **Rehacer y pulir toda la interfaz**: profesional, responsive, sin fallos.
3. Mantener el **flujo de negocio** existente: plantillas → contrato → aprobación → firmas en orden → vigencia/vencimiento → renovación / cancelación / archivo, con 4 roles (admin, supervisor, gestor, user=firmante).
4. Al final todo (API + web + BD) se desplegará en un **servidor de la universidad**.
5. Prioridades del dueño: **seguridad**, **que no se rompa nada**, **código mantenible** (lo exige explícitamente: nada de código compactado/ilegible).

## 2. Forma de trabajo (muy importante)

- **Claude lidera**: planifica, escribe las tareas, **revisa todo lo que entrega Codex**, y hace **todo el frontend/diseño**.
- **Codex** (CLI instalado en el PC, `gpt-6.1-sol`, razonamiento `medium`) escribe la **lógica** (backend y capa de datos) por tareas acotadas en `docs/tasks/Txx-*.md`. Al terminar escribe `docs/tasks/Txx-*.REPORT.md`.
- Se pueden usar **2 Codex en paralelo** si tocan archivos distintos (el dueño lo autorizó).
- Codex **no tiene red** en su sandbox: **Claude instala las dependencias** (`npm install …`) antes de lanzar la tarea y lo indica en el prompt. Revisar siempre `npm audit` (debe dar 0).
- Comando para lanzar Codex (desde `SIMAUD_CFG/`, en segundo plano):
  ```bash
  codex exec -C . -s workspace-write -c sandbox_workspace_write.network_access=true -c model_reasoning_effort=medium --skip-git-repo-check -o <scratchpad>/codex-TXX-last.md "Implementa la tarea docs/tasks/TXX-....md. Lee primero docs/CODE_STANDARDS.md (obligatorio) ... Trabaja solo en <alcance>. No hagas git commit. ... termina escribiendo docs/tasks/TXX-....REPORT.md." > <scratchpad>/codex-TXX.log 2>&1
  ```
- **Revisión de Claude tras cada entrega**: leer el REPORT, ejecutar `npm run typecheck`, `npm test`, `npm audit`, y leer el código sensible (auth, permisos, firmas). Si el código está compactado → exigir refactor (pasó en T02).
- **Git**: NADA está commiteado todavía (el dueño no lo ha pedido). Rama actual: `main` del clon de `https://github.com/4ismael1/SIMAUD_CFG`. Si se commitea: crear rama primero. Hay que preguntar al dueño antes.
- Idioma con el dueño: **español**. Textos de UI en español; código en inglés.

## 3. Infraestructura de desarrollo

- Repo: `C:\Users\ismae\Desktop\simaud\SIMAUD_CFG` (frontend en la raíz, API en `api/`).
- **PostgreSQL 17** corre en Docker en el VPS **Instabox**: contenedor `simaud-pg`, solo escucha en `127.0.0.1:5432` del VPS. BDs: `simaud_dev` y `simaud_test`, usuario `simaud`.
- Acceso SSH al VPS (lo dio el dueño): `ssh -p 2222 ibssh_b7cb2flwf2so4oiciez7hzln2e@ssh.instabox.sh` (clave ya configurada en el PC).
- **Túnel obligatorio** para que la API local llegue a la BD (puerto local 55432). Lanzarlo en segundo plano con reconexión:
  ```bash
  while true; do ssh -p 2222 -o BatchMode=yes -o ServerAliveInterval=20 -o ServerAliveCountMax=3 -o ExitOnForwardFailure=yes -N -L 55432:127.0.0.1:5432 ibssh_b7cb2flwf2so4oiciez7hzln2e@ssh.instabox.sh; sleep 3; done
  ```
- Secretos: `api/.env` (DATABASE_URL, DATABASE_URL_TEST, JWT_ACCESS_SECRET, APP_URL, PORT). **No imprimir ni commitear.** `.env.local` en la raíz tiene `VITE_UI_MOCK=1` y placeholders de Supabase (solo para el modo demo antiguo).
- Contraseña del seed: la imprimió `npm run db:seed` una sola vez; si se necesita, definir `SEED_PASSWORD` en `api/.env` y re-ejecutar el seed. Usuarios seed: `admin@simaud.local`, `supervisor@simaud.local`, `gestor@simaud.local`, `usuario@simaud.local`.
- Levantar en local: túnel → `cd api && npm run dev` (puerto 3000) → en la raíz `npm run dev` (Vite 5173, proxy `/api` → 3000). Hay un `.claude/launch.json` en `C:\Users\ismae\Desktop\simaud` con la config `web`.

## 4. Diseño aprobado por el dueño

- Lienzo con las 22 pantallas (referencia visual obligatoria): **https://claude.ai/artifact/JdxL5NXACzEuhJ9tjh5PMV** (páginas: Landing y acceso · Panel por rol · Contratos y flujos · Administración). Fuente local de las maquetas en el scratchpad de la sesión anterior (no hace falta; el lienzo es la referencia).
- Propuesta escrita (inventario de fallos por pantalla): `docs/ui-redesign.html` (artefacto https://claude.ai/artifact/QLwGDz5pm4UWDZZ4ZULwWv). Ojo: su paleta azul quedó **descartada**.
- **Estilo final aprobado** («dashboard profesional»): base **blanca + gris pizarra (Tailwind slate)**, tipografía **Geist** (+ Geist Mono para códigos/cédulas, **Source Serif 4** solo para el documento del contrato), **vino del logo `#8B2029`** solo como acento (botón primario, ítem activo, contadores, serie principal de gráficos). Barra lateral **blanca** con el **logo original**. NADA de tonos cálidos/café (el dueño los rechazó) ni barra lateral oscura.
- Logo: `src/assets/logo-simaud.png` (completo, fondo transparente) y `src/assets/logo-columna.png` (solo la columna). Favicon ya actualizado.
- Móvil: no hay maquetas (el dueño dijo que no hacían falta); el responsive se resuelve al implementar.

## 5. Estado del BACKEND (`api/`)

Stack: Node 24, TypeScript estricto, Fastify 5, Drizzle ORM + PostgreSQL, Zod, argon2, jose (JWT), nodemailer, Vitest, Prettier. Lee `api/README.md`.

| Tarea | Estado | Notas |
|---|---|---|
| T01 núcleo: esquema, auth, `/me`, `/users`, seed | ✅ Revisado por Claude | 30 tests. Refresh token rotado en cookie httpOnly, JWT 15 min, rol releído de BD en cada request, registro siempre `role=user`. |
| T02 contratos: plantillas, variables, contratos, máquina de estados, aprobaciones, firmas, versiones, auditoría | ✅ Revisado | 235 tests. Estado único `contracts.status`: draft, pending_approval, rejected, pending_signatures, active, expiring_soon, expired, cancelled, renewed. El código salió muy compactado → T03 incluye refactor. |
| T03 renovaciones, notificaciones + SSE, jobs (node-cron), dashboard por rol, reportes + export CSV/XLSX/PDF, PDF del contrato | ⏳ **Codex lo estaba terminando** (suite de ~255 tests corriendo) | Al retomar: leer `docs/tasks/T03-api-ciclo-vida.REPORT.md`; si no existe, mirar `api/` y el log. **Revisar**: formato legible (sección 0 de la tarea), permisos de reportes, SSE con ticket, jobs con advisory lock. Deps ya instaladas: pdfmake, exceljs (override `uuid@^11.1.1`), node-cron, prettier. |

Pendiente backend (tareas aún NO escritas):
- **T05 despliegue y seguridad**: Dockerfile API, build web estático, `docker-compose.prod.yml` (api + nginx + postgres), nginx con cabeceras de seguridad/CSP/HSTS y proxy `/api`, `TRUST_PROXY`, backups de Postgres (cron + pg_dump), guía de despliegue en el servidor de la universidad, SMTP real (`SMTP_URL`).
- **Migración de datos desde Supabase**: preguntado al dueño, **sin respuesta** (¿hay datos reales que conservar?). Si los hay: script que lea Supabase y cargue la BD nueva (usuarios con reseteo de contraseña obligatorio).
- Revisión de seguridad final de toda la API (rate limits, permisos por endpoint, uploads, cabeceras).

## 6. Estado del FRONTEND

Stack: React 19, Vite 8, Tailwind 4 (`@theme` en `src/index.css`), React Router 7 (data router, rutas lazy), TanStack Query 5, lucide-react. Dependencias actualizadas, `npm audit` = 0.

### 6.1 Capa de datos (T04, Codex) — ✅ terminada, **pendiente mi revisión**
`src/lib/api/` (cliente `apiFetch` con token en memoria, refresh single-flight, `REFRESH_RACE`, BroadcastChannel entre pestañas, `ApiError`), tipos en `core-types.ts`, `catalog-types.ts`, `contract-types.ts`, `dashboard-types.ts`, `lifecycle-types.ts`, hooks por dominio en `src/lib/api/hooks/*`, `keys.ts`, `status.ts` (etiquetas/tonos de estados y roles), `server-events.ts` (SSE), `src/lib/auth/` (`AuthProvider`, `useAuth`: `status`, `user`, `login` (devuelve void), `logout`, `register`, `hasRole`), `src/lib/format.ts` (RD$, fechas es-DO, cédula con dígito verificador), `src/lib/query.ts`. 29 tests (`npm run test`). Al revisar: Codex volvió a escribir partes compactas; Prettier las formatea (`npm run format`).

### 6.2 UI nueva (Claude) — en curso. Estructura nueva en paralelo a la vieja:
```
src/main.tsx            → ya apunta a la App NUEVA (src/app/App.tsx)
src/index.css           → tokens nuevos (vino-50..900, fuentes, sombras, animaciones)
src/ui/                 → primitivas: Button/ButtonLink/IconButton, Field/Input/Select/Textarea/Checkbox,
                          display (Badge, Card, CardHeader, PageHeader, Alert, Kpi, Delta, Avatar, Logo, EmptyState, Skeleton, Spinner),
                          Dialog (<dialog> nativo: foco, Escape) + ConfirmDialog (motivo / escribir código), Menu (teclado),
                          Toast, navigation (Tabs, Segmented, SearchInput, Pagination), DataTable (tabla → tarjetas en móvil), charts (Sparkline, LineChart, DonutChart)
src/app/                → App.tsx (providers), router.tsx, guards.tsx (ProtectedRoute, PublicOnlyRoute, RoleRoute, StaffHome, Forbidden),
                          RouteError.tsx, navigation.ts (menú por rol), avatar.ts, layout/ (AppLayout, Sidebar, NotificationBell, GlobalSearch Ctrl+K, useNavCounts)
src/features/landing/   → LandingPage, HeroDocument  ✅
src/features/auth/      → Login, Registro, Verifica correo, Confirmar (/auth/confirmar?token), Recuperar, Restablecer (/auth/restablecer?token) ✅
src/features/dashboard/ → DashboardPage + Admin/Supervisor/Gestor views ⚠️ NO COMPILA: los tipos de dashboard cambiaron (T03/T04). Ajustar a dashboard-types.ts final.
src/features/contracts/ → ContractsListPage ✅, ContractDetailPage ✅ (+ components: ContractBits, DocumentView, ContractActions, ContractDialogs, SignatoriesPanel, ContractHistory)
src/lib/errors.ts, src/lib/download.ts
```
Rutas definidas: `/` landing · `/auth/{login,registro,verifica,recuperar,confirmar,restablecer}` · `/app` (panel por rol; firmante → `/app/firmas`).
**Las rutas de contratos aún NO están registradas en `src/app/router.tsx`** (el bloque `RoleRoute` tiene `children: []`). Hay que añadir: `/app/contratos`, `/app/contratos/:id`, `/app/contratos/nuevo`, `/app/contratos/:id/editar`, `/app/contratos/:id/firmar`, etc.

### 6.3 Pendiente frontend (en este orden)
1. Ejecutar `npx tsc --noEmit -p tsconfig.app.json` y arreglar errores de `src/ui`, `src/app`, `src/features` (los de `src/components` son del código viejo y se borrarán).
2. Ajustar los paneles (`features/dashboard/*`) a los tipos finales de `dashboard-types.ts`.
3. Registrar rutas de contratos en el router.
4. **Asistente de nuevo/editar contrato** (4 pasos: Plantilla → Datos → Participantes por cédula con `useUserLookup` → Revisar con vista previa `usePreviewTemplate`); autoguardado de borrador; ver lienzo «Nuevo contrato».
5. **Firmar** (`/app/contratos/:id/firmar`): leer todo el documento, declaración, pad de firma (canvas → PNG Blob → `useSignContract`), también subir imagen; versión móvil a pantalla completa. `react-signature-canvas` está instalado (o hacer canvas propio).
6. **Por firmar** (`/app/firmas`, firmante y cualquiera con firmas): bandeja «Es tu turno / Esperando a otro / Firmados».
7. **Aprobaciones** (vista dividida: lista + documento con cambios + aprobar/devolver con comentario obligatorio).
8. **Renovaciones** (tabla por prioridad + panel lateral para procesar; solicitar).
9. **Plantillas** (tarjetas + pestaña Variables) y **editor de plantilla** (variables con autocompletar `{{`, vista previa).
10. **Usuarios** (tabla + panel «Invitar usuario»; no permitir quitarse admin a sí mismo — la API ya lo impide).
11. **Reportes** (filtros, KPIs, gráficos, exportar con `downloadFromApi`).
12. **Perfil** (datos, avatar, contraseña, sesiones, preferencias de notificación) y **Configuración** (institución, días de aviso, tareas automáticas con «Ejecutar ahora»).
13. **Borrar el código viejo**: `src/components/**`, `src/contexts/**`, `src/types/**`, `src/App.tsx` viejo, `src/lib/supabase*.ts`, `src/lib/branding.ts` si no se usa, el plugin `simaud-ui-mock` de `vite.config.ts`, la dependencia `@supabase/supabase-js`, `html2canvas`/`jspdf`/`framer-motion`/`recharts` si no se usan, y la carpeta `supabase/` (pedir OK al dueño antes de borrar `supabase/`).
14. Fuentes autoalojadas (`@fontsource-variable/geist`, etc.) en lugar de Google Fonts, por si el servidor de la universidad no tiene internet.
15. `tsc` sin errores, `npm run build`, prueba manual de punta a punta con los 4 usuarios seed (usar el navegador del panel), revisión de responsive a 360/768/1280 px, accesibilidad básica.
16. Pruebas e2e (Playwright) de los flujos principales — opcional pero recomendado.

## 7. Decisiones ya tomadas (no re-discutir)
- Estado único de contrato (sustituye status/approval_status/actual_status de Supabase).
- Supervisores no aprueban sus propios contratos; la firma respeta `signing_order`; la última firma activa el contrato.
- Borrado de usuarios = soft delete. Borrado de contrato por admin exige escribir el código del contrato.
- El documento del contrato se muestra decodificando el texto escapado que da la API y renderizándolo como texto (nunca `dangerouslySetInnerHTML`).
- Rutas de enlaces de email: `/auth/confirmar?token=` y `/auth/restablecer?token=` (las genera la API con `APP_URL`).
- Enlaces de notificaciones de la API vienen sin `/app` (p. ej. `/contratos/:id`); `NotificationBell` antepone `/app`.
- Moneda DOP (RD$), zona horaria America/Santo_Domingo, formato es-DO.

## 8. Preguntas abiertas al dueño
- ¿Hay datos reales en Supabase que migrar?
- SMTP real para correos (confirmación, recuperación, avisos).
- Nombre/datos de la institución para el PDF (en `index.html` aparece «UAPA, Unidad de Gestión Legal»; en las maquetas se usó un nombre de ejemplo).
- Cuándo commitear y en qué rama.
