# HANDOFF — SIMAUD: estado del trabajo y cómo continuar

## ⚡ ÚLTIMA ACTUALIZACIÓN (sesión 2, 9 nov 2026) — leer primero
- Rama: **`feat/backend-propio-y-nueva-ui`**. Sigue commiteando aquí (solo archivos propios; no commitear trabajo de Codex a medias).
- **T03 verificado**: typecheck, format:check, `npm audit` = 0 y **255 tests pasan**. Seguía compactado → se escribió **`docs/tasks/T03b-api-legibilidad.md`** (refactor sin cambiar comportamiento + escribir `T03-api-ciclo-vida.REPORT.md`). Codex lo estaba ejecutando al cortar. Log: `<scratchpad>/codex-T03b.log`.
- **T05 despliegue** escrito (`docs/tasks/T05-despliegue.md`: Dockerfiles, nginx con CSP/HSTS y SSE, compose prod, backups, `docs/DEPLOY.md`). Codex lo estaba ejecutando en paralelo (no toca `api/src`). Revisar ambos REPORT cuando existan; si no existen, relanzar con el mismo prompt.
- **Pulido de pantallas públicas (hecho y verificado en navegador a 1440 y 375 px)**: landing reescrito (contenedor máx. 1200px, cabecera fija con menú móvil, fondo de puntos en vez de la marca de agua, CTA final nuevo), AuthLayout/AuthCardLayout (tarjetas centradas, panel derecho sin marca de agua), título de pestaña «SIMAUD-LEX · Módulo de Gestión Legal Digital».
- **Bugs corregidos**: el ojo de la contraseña salía debajo del campo (IconButton tenía `relative` fijo y `cn` no resuelve conflictos → también rompía el botón cerrar del menú móvil). Botones deshabilitados ahora gris neutro (antes vino deslavado); con `loading` conservan el color (`data-loading`).
- ⚠️ **Trampa conocida**: `cn()` NO fusiona clases de Tailwind. Pasar `hidden`/`absolute` a un componente que ya trae `inline-flex`/`relative` no funciona: envolver en un contenedor o quitar la clase base. Valorar `tailwind-merge`.
- **Sistema de animación** (CSS, sin framer-motion): tokens en `src/index.css` (`animate-page-in`, `animate-rise-in`, `animate-hero-doc`, `animate-float`), utilidades `.stagger` (hijos escalonados al montar), `.reveal`/`.reveal-stagger` + hook `useScrollReveal(ref)` (`src/ui/motion.ts`), `.lift` (hover). Respeta `prefers-reduced-motion`. AppLayout anima cada cambio de ruta. **Pendiente**: aplicar `.stagger` a las rejillas de KPIs/tarjetas de los paneles y listas internas.
- **Ruta de firma registrada**: `/app/contratos/:id/firmar` (pantalla completa dentro de `ProtectedRoute`). Redirige bien al login sin sesión. **No probada con sesión**: el usuario `usuario@simaud.local` tiene su turno en CT-2026-0004 (`00000000-0000-4000-8001-000000000004`). El navegador de Claude no pudo leer la contraseña seed (bloqueado por permisos): pedir al dueño que inicie sesión en el panel o que lo pruebe él.
- Nota seguridad a revisar: `GET /me/signatures` devuelve el contrato entero (incluye `signedPdfPath`, `content`, `variablesData`…). Recortar a lo que usa la bandeja.
- **T05 terminado y revisado** (`docs/tasks/T05-despliegue.REPORT.md`, `docs/DEPLOY.md`, `deploy/`, Dockerfiles, compose). CSP estricta sin `unsafe-inline` → nada de `<style>`/scripts en línea en el front (ya movido el de HeroDocument a index.css). Pendientes que deja T05: (1) **bloqueante**: `api/src/server.ts` escucha en `127.0.0.1` fijo → añadir `HOST` validado en `config/env.ts` (def. 127.0.0.1; 0.0.0.0 en contenedor) — hacerlo cuando T03b termine para no pisar a Codex; (2) comando seguro para crear el primer admin sin el seed demo; (3) autoalojar fuentes; (4) probar la app bajo la CSP; (5) `DATABASE_URL_TEST` no debería ser obligatoria en producción.
- **Sesión 2 (tarde)**: landing rediseñado en `src/features/landing/` (LandingHeader con scroll-spy y desplazamiento suave, HeroSection con tarjetas flotantes, LandingSections: franja de valor, recorrido con barra de progreso, perfiles con pestañas y vista previa, constancia sin scroll, FAQ, footer). Verificado a 1440 y 375 px.
- **Codex en cola** (tareas escritas): T03b (en curso), **T07 auditoría de seguridad SOLO LECTURA** (en curso, `codex-T07.log`), **T06 validaciones** (cédula JCE/Luhn, RNC, teléfono RD, montos…) y **T08 correo Resend+SMTP con outbox + HOST + crear primer admin** → lanzar ambas cuando termine T03b (límites de archivos ya separados en las tareas). Después: repartir hallazgos de T07 entre dos Codex.
- **Instabox** sirve de servidor de pruebas (autorizado por el dueño): Docker 29.8, Compose v5.6, 4 CPU, 7.8 GB RAM, 9.8 GB libres. Desplegar allí con `docker-compose.prod.yml` tras T08.
- Correo: el dueño usará **Resend** ahora y **SMTP institucional** después (ambos configurables, T08). Falta que el dueño ponga `RESEND_API_KEY` en `api/.env` y verifique un dominio en Resend.
- Pendiente de diseño: pulir de nuevo AuthLayout/tarjetas de acceso (el dueño las considera pobres), stagger en paneles.
- **Instabox por API** (autorizado por el dueño; tocar SOLO la máquina `simaud` = `m_agq4fpcgma6kpfqey5ffoy2wui`, nunca `projectcloud` ni `android`). Clave en `.env.ops` (raíz, ignorado por git). API: `https://api.instabox.sh/v1`, cabecera `X-API-Key`. Puertos: `GET/POST /v1/machines/<id>/ports` (body `{port, name, access:"public", protocol:"http"}`, enviar `Idempotency-Key`); URL pública `https://<puerto>-agq4fpcgma6kpfqey5ffoy2wui.<dominio>/` con HTTPS ya terminado por Instabox. Máx. 16 puertos. CLI alternativa: `npx instabox port publish ...` con `INSTABOX_API_KEY`.
- **Plan de staging**: Instabox termina TLS → crear `deploy/docker-compose.staging.yml` (override) con nginx solo HTTP en un puerto ≥1024 (p. ej. 8080), sin redirección 80→443, `TRUST_PROXY=2`, `APP_URL` = URL pública; publicar ese puerto. HSTS puede quedarse (la URL pública es HTTPS).
- **No hay datos de Supabase que migrar** (confirmado por el dueño): BD limpia en producción.
- `RESEND_API_KEY` ya está en `api/.env`. Al terminar T08: configurar `MAIL_DRIVER=resend` y `MAIL_FROM`; sin dominio verificado en Resend solo se puede enviar al correo del dueño de la cuenta (usar `onboarding@resend.dev` como remitente para pruebas).
- Recomendar al dueño **rotar** las claves de Resend e Instabox al final del proyecto (se pegaron en el chat).
- **Correo configurado con Brevo (SMTP)** en `api/.env`: `SMTP_URL` (smtp-relay.brevo.com:587) y `MAIL_FROM=SIMAUD <simaud.notificaciones@gmail.com>`. Verificado: login OK y correo de prueba aceptado (250). `MAIL_DRIVER=smtp` está **comentado** a propósito: activarlo solo tras confirmar que los tests fuerzan `MAIL_DRIVER=log` (si no, enviarían correos reales a direcciones falsas y dañarían la reputación de la cuenta). Gmail bloqueó crear contraseña de aplicación por ser cuenta nueva → reintentar en 1-2 días; Resend queda como alternativa.
- **Estado (9 nov, noche)**: T06 y T08 revisados y commiteados (369 tests API OK, 94 web). `MAIL_DRIVER=smtp` ACTIVO (Brevo); `vitest.config.ts` fuerza `MAIL_DRIVER=log`. Codex en curso: **T09b** (simaud_test, `codex-T09b.log`) y **T09a** (simaud_test2 vía env, `codex-T09a.log`). En cola: **T10 firma certificada** (lanzar tras T09b; tarea escrita).
- Front nuevo (sin probar con sesión porque Claude no puede leer la contraseña seed): asistente `/app/contratos/nuevo` y `/:id/editar` (`src/features/contracts/wizard/`: firmantes ilimitados ≤100, modos en orden / a la vez / por pasos, arrastrar para reordenar, lookup por cédula, autoguardado en sessionStorage), pad de firma con «Ampliar» a pantalla completa (`SignatureFullscreen.tsx`, exporta PNG recortado ≤1600×700), pantalla `/auth/cambiar-clave` (H10) y manejo de `PASSWORD_CHANGE_REQUIRED` en `useSessionState`.
- Pendiente del dueño: posicionar firmas «en el lienzo» del documento (interpretado como colocar los bloques de firma sobre el documento; requiere soporte en API/PDF → valorar junto a T10). Bandeja `/app/firmas` espera el DTO nuevo de T09b.
- ⚠️ **Binario de Codex**: el `codex` del PATH (0.162, `AppData/Local/Programs/OpenAI/Codex/bin`) ya NO funciona: la app de Codex se actualizó el 8 nov a 0.167 con su servicio de sandbox y la CLI vieja falla con `setup refresh had errors` (no ejecuta ni escribe). Usar **`/c/Users/ismae/AppData/Local/OpenAI/Codex/bin/f71a721e0e6193a9/codex.exe`** (0.167). Si la app vuelve a actualizarse, buscar el `codex.exe` más reciente en `AppData/Local/OpenAI/Codex/bin/*/` y probar con una tarea trivial antes de lanzar trabajo largo. Escalonar ~30 s los lanzamientos paralelos.
- **Firma escrita (tipográfica)** hecha en el front: modo «Escribir» (por defecto) en la página de firma, 8 fuentes manuscritas autoalojadas `@fontsource/*` (OFL/Apache, subconjunto latin, cargadas solo en el chunk de firma) — `signature-styles.ts`, `TypedSignature.tsx`, `FittedSignatureText.tsx` (encoge, nunca corta). Genera PNG recortado en canvas → mismo endpoint de firma. Estilo guardado vía `src/lib/api/hooks/signature-style.ts` (`GET/PUT/DELETE /me/signature-style`, 404 = sin preferencia) — **la API la hace T10 §5**. Solo se recuerda la firma escrita. **Tras T10**: enviar `method`/`fontId` en `useSignContract` (hoy el parser solo admite 2 campos y rompería la firma).
- **`docs/PRINCIPIOS.md`** (nuevo, obligatorio): reglas de dominio y seguridad. Detectado: un admin podía borrar contratos firmados → se corrige en **T10 §6** (solo borradores/devueltos sin firmas). T10 §7 añade cifrado AES-256-GCM de firmas en disco (`FILE_ENCRYPTION_KEY`).
- **T09a terminado** (35 tests nuevos OK; informe en `docs/tasks/T09a-seguridad-sesiones.REPORT.md`). `MAIL_PAYLOAD_KEY` ya añadida a `api/.env`. Front integrado: registro opaco (202), sin `/auth/availability`, `PATCH /me/password` devuelve `accessToken` → `changePassword()` en `hooks/me.ts` hace `updateSession("token-renewed")`. **Pendiente**: 37 tests antiguos fallan porque firman JWT sin sesión → tarea T09c (adaptar fixtures) tras T09b. Codex formateó por error archivos de T09b (solo formato).
- Siguiente: probar firma con sesión, bandeja `/app/firmas`, stagger en paneles, asistente de nuevo contrato (6.3 punto 4).

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
