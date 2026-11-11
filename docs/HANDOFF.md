# HANDOFF — SIMAUD: estado del trabajo y cómo continuar

## ⚡⚡ ÚLTIMA ACTUALIZACIÓN (sesión 4, 10 nov 2026, ~02:00) — LEER PRIMERO (la sesión 3, debajo, sigue valiendo)
Rama `feat/backend-propio-y-nueva-ui`. Commits de esta sesión: `aaba3ad` (fix /app: contador de firmas paginado),
`11f0dd4` (borrar notificaciones), `bb231e1` (filtros Plantillas/Variables), `0cb2bd7` (preview de plantilla),
`66dcf50`…`34d2d86` (editor TipTap con formato), `ae1cab0` (módulo Variables), **`51a3e88` T10 + T12a (Codex)**,
`dcdc549`/`a5f4fce`/`9d79f28` (docs: plan premium, rich-v2, T14), **`4036335` editor premium fase 1**.

### ⚡⚡⚡⚡⚡⚡ ESTADO 10 nov ~20:40 (sesión 5) — camino a producción (decisiones del dueño)
- Desplegado en SIMAUD_RUN: T17, T18, T19 (roles = casillas de la plantilla, `party` = prefijo de datos), T20 (cédula
  obligatoria) y **cargo = dato de plantilla** (los usuarios SOLO tienen rol; el campo «Cargo» de usuarios se quitó del front y
  la API ya no rellena `{party}_cargo` desde el usuario; la columna `users.position` queda sin uso).
- **T21 recorrido e2e Playwright** (`npm run e2e` sin ventana, `e2e:headed`, `e2e:ui`; BD local `simaud_e2e`, API :3100,
  Vite :5175, Chrome instalado; resultados en `e2e/output/<fecha>/RESUMEN.md`). Encontró y se arreglaron: vista previa
  «undefined» con rich-v2, cédula sin formato en la declaración, recuadro de firma que dibujaba solo un punto / se borraba.
  Pendiente front: el documento del detalle muestra «[Firmante n]» en vez de nombres.
- **Plan acordado:** recorrido completo en verde → activar **SMTP real (Brevo, ya en api/.env)** en SIMAUD_RUN y probar con un
  correo de prueba que dará el dueño (enlaces a http://localhost:5173) → **ensayo en staging Instabox** (compose de producción,
  nginx, backups, repetir e2e) → revisión del dueño → servidor de la universidad.
- **Sin nueva auditoría de seguridad** (decisión del dueño). **Clave de sello**: se genera al instalar en el servidor de la
  universidad (uso institucional/demostración, no contratos reales).

### ⚡⚡⚡⚡⚡ ESTADO 10 nov ~17:20 (sesión 5)
- **T18 commiteada y desplegada** (`2de9681` API, `50e2e60` front Verificar v2 + ajustar firma). SIMAUD_RUN en `50e2e60`,
  `npm ci` (pdf-lib) y migración 0015 aplicadas; API reiniciada. Suite 666/666 local.
- Front de hoy además: `26a68b1` firma dibujada redibujada con grosor fijo (`signature-export.ts`) + vista previa en la casilla;
  `114f15c` aviso en el editor si falta el bloque «Firmas». La plantilla de prueba se pasó a rich-v2 con bloque Firmas
  (`SIMAUD_RUN/api/tmp/fix-template-signatures.ts`). **Contratos de `simaud_dev` borrados a petición del dueño** (numeración reiniciada).
- **T17 lanzada** con «Pedir nueva firma» / «Reiniciar firmas» (antes de activar) + enmiendas (después). BD local `simaud_test2`.
- Ojo para reiniciar la API de SIMAUD_RUN: hay que pararla antes de `npm ci` (Windows bloquea los .node).

### ⚡⚡⚡⚡ ESTADO 10 nov ~16:40 (sesión 5, otra cuenta)
- **T15 + T16 commiteados** (`dabb3e1` API, `954dbcc` front: importes exactos + `fetchAllPages` porque aprobaciones/versiones/
  elegibles ahora se paginan). Suite completa **642/642 en 5 min contra PostgreSQL LOCAL** (ver abajo). Arreglos míos: test de
  migración de almacenamiento determinista; el repartidor de correos usa el reloj de la BD (el de PG iba ~10 ms adelantado).
- `f4ee36b` transiciones suaves (View Transitions) en Firmar y Verificar.
- **SIMAUD_RUN en `954dbcc`**, migraciones 0013/0014 aplicadas a `simaud_dev`, API reiniciada (en segundo plano de la sesión 5).
- PDF nuevo comprobado renderizando CT-2026-0018 (`SIMAUD_RUN/api/tmp/render-contract.ts`, no guarda nada): igual que la
  pantalla, sin cabecera «SIMAUD». Los contratos YA firmados conservan su PDF final antiguo (inmutable, sellado).
  **Las firmas solo caen en su casilla si la plantilla usa el bloque «Firmas»**; la plantilla de prueba tiene líneas `____` a mano.
- **T18 lanzada** (`docs/tasks/T18-verificacion-y-colocacion-de-firmas.md`, BD local `simaud_test2`): verificación v2 (código
  largo, huella en navegador, copia oficial con marca), colocación de firmas (arrastrar/ajustar, re-firmar antes de activar),
  IP real tras proxy, cédulas con formato, H17. Después **T17** (enmiendas). Front de T18 = Claude.
- Decisiones del dueño hoy: copia oficial descargable con el código largo (protegida); Instabox gratis = pausa a las 8 h o 30 min
  sin uso; PostgreSQL portable local para tests (Docker descartado por pesado).
- El túnel 55432 lo relanza la sesión 5 en bucle; si se cambia de wifi se cae y vuelve solo.

### ⚡⚡⚡ ESTADO 10 nov ~15:00 — (anterior) cambio de cuenta
**Sin commitear en `api/`: trabajo de Codex T15 + T16 (NO descartar).** **T16 además modificó archivos del front** (`src/features/reports/*`, `src/features/dashboard/AdminDashboardExtras.tsx`, `src/ui/bar-charts.tsx`, `src/lib/format.ts` + test: importes exactos como string, H11) y `docs/PRINCIPIOS.md` (regla de autoaprobación): revisar ese diff antes de commitear (front = Claude). T15 terminó su código e informe
(`docs/tasks/T15-plantillas-premium-pdf.REPORT.md`, ya en disco sin commitear). T16 estaba pasando su suite completa
(60 casos OK, 0 fallos a las 14:53) sobre el árbol con T15+T16; su informe saldrá en `docs/tasks/T16-correcciones-auditoria.REPORT.md`.
Al retomar:
1. `tasklist | grep -c codex.exe` (2 = ninguno vivo) y `ls docs/tasks/T16*REPORT*`. Si T16 no tiene informe y no hay Codex vivo,
   relanzarlo (BD `simaud_test3`) con «hay trabajo parcial tuyo sin commitear; complétalo sin rehacerlo, solo repite las pruebas y termina el informe».
2. Leer informes T15 y T16. T15 avisó de 5 fallos que venían de T16 a medias (autoaprobación admin, importes como string, límites de correo):
   comprobar que T16 los resolvió.
3. En `api/` (Git Bash, NADA más corriendo, comprobar que no quedan `node … vitest` vivos): `npm run typecheck && npm run format:check && npm test`
   (`npm audit` falla por TLS del registro en esta red; repetir más tarde). Si `simaud_test` da «cédula duplicada»: hay vitest zombi
   o BD sucia → matar procesos y `NODE_ENV=test npm run db:reset` (solo afecta a simaud_test).
4. Commit (T15 y T16 por separado si se puede) → SIMAUD_RUN: `git -C ../SIMAUD_RUN checkout --detach <commit>`, `npm run db:migrate`
   (0013 T15, 0014 T16), reiniciar API (`MAIL_DRIVER=log npx tsx src/server.ts` en SIMAUD_RUN/api). Con eso: plantillas guardan `rich-v2`
   (página, firmas), pestaña «PDF» del editor activa, PDF idéntico a pantalla.
5. Prueba de punta a punta y AVISAR AL DUEÑO (lo pidió: «avísame cuando esté 100 % para probar»).
6. Luego lanzar **T17 enmiendas** (`docs/tasks/T17-enmiendas.md`).

**PostgreSQL LOCAL para tests (10 nov, autorizado por el dueño):** PostgreSQL 17.11 portable en `C:\Users\ismae\pgsql-simaud`
(sin instalador; solo escucha en 127.0.0.1:55433; auth `trust` solo local; `fsync=off`, SOLO para tests). BD: `simaud_test`,
`simaud_test2`, `simaud_test3`. Arrancar: `/c/Users/ismae/pgsql-simaud/bin/pg_ctl.exe -D /c/Users/ismae/pgsql-simaud/data -l /c/Users/ismae/pgsql-simaud/data/server.log start`
(parar: `… stop`). Usar en tests sin tocar `api/.env` (dotenv no pisa variables ya exportadas):
`export DATABASE_URL_TEST=postgres://simaud@127.0.0.1:55433/simaud_test PATH="/c/Users/ismae/pgsql-simaud/bin:$PATH"`.
A Codex pasarle la misma variable con `simaud_test2`/`simaud_test3`. `simaud_dev` sigue en Instabox.

**Instabox (BD de desarrollo; ya no para tests): plan GRATUITO** → se pausa tras **8 h seguidas** o **30 min sin uso** (dato oficial de
Instabox confirmado por el dueño; el «120 min» anterior era erróneo). Hora de arranque: `runStartedAt` en `GET /v1/machines/<id>` (UTC). Al volver no hay que hacer nada (vuelve sola a `running`); el túnel se reconecta solo.
Error «Ocurrió un error interno» al entrar = máquina suspendida (ver `GET /v1/machines/<id>` con la clave de `.env.ops`: `state`, `cooldownUntil`).
La suite de la API tarda ~30 min y no hay que lanzar dos a la vez. Propuesto al dueño: Postgres local en Docker para tests (sin respuesta).

**Datos de prueba creados en `simaud_dev`** (todas con la contraseña `SEED_PASSWORD` del `.env`, no imprimirla):
admin Rosa Almonte Díaz 001-1234567-3 · supervisor Carlos Rodríguez Peña 001-2345678-2 · gestor María Fernández Lora 001-3456789-0 ·
firmantes Laura Méndez Pérez `firmante.prueba@simaud.local` 402-2098765-1 y Pedro Gómez Santana `usuario@simaud.local` 031-4567890-4.
Plantilla «Contrato de prestación de servicios profesionales» (id `dc847da6-…`, rich-v1) + variables `ciudad_firma`, `representante_nombre/cedula/cargo`.
En dev los correos no salen (log) y los enlaces de invitación no se pueden abrir: para activar cuentas de prueba se fijó la contraseña en BD.

**Front hecho hoy (todo commiteado, 141 tests, build OK; casi nada verificado con sesión por el dueño):**
`ff38385` avisos arriba al centro + no «salir sin guardar» tras guardar · `fc1b410` abrir y salir sin cambios no pregunta (`sameDocument`) ·
`c9d7b31` «contrato a medias» solo si hay contenido · `1654d26`/`764b4e3`/`d001791`/`e5a0c2f` asistente: fechas/valor/duración no se repiten,
**los datos de las personas salen de los firmantes** (rol Cliente → `cliente_*`, rol «Por la institución» (API `contractor`) → `representante_*`),
una tarjeta de firmante por persona que nombra la plantilla, la cédula rellena sola, solo se envían las variables que usa la plantilla
(arreglo de «Variables desconocidas») · `e351c0e` pestaña «PDF» del editor (usa `/templates/preview-pdf` de T15) ·
`9a2c535` **área del firmante**: Inicio, Mis contratos, Verificar; «volver» del contrato según rol.
Lógica clave: `src/features/contracts/wizard/bound-variables.ts`, `src/lib/rich-doc/*`, `src/features/signer/*`.

**Pendiente/propuesto al dueño:** campo «Cargo» en usuarios para que `representante_cargo` salga solo (recomendado; sin respuesta) ·
10 avisos de lint antiguos (compilador de React) en `src/ui/{Dialog,Toast,charts}`, `ReassignDialog`, `ContractDialogs`, `StepSignatories`,
`ApprovalsPage`, `lib/validation/contact.ts` · verificación con el dueño a 1440/768/375 · staging en Instabox · prueba con los 4 roles ·
rotar claves Resend/Instabox/Brevo (recordárselo).

### ESTADO 10 nov ~13:45
- **T13 + T12b commiteados** en `e54e1ed` (suite completa 573/574 en verde, 1 omitido; `npm audit` online bloqueado por un problema TLS
  del registro npm en esta red: repetir cuando funcione). `simaud_test` se reinició con `NODE_ENV=test npm run db:reset`
  (quedó sucia por procesos de vitest que no murieron: al parar una suite, comprobar que no queden `node … vitest`).
- SIMAUD_RUN en `e54e1ed`, migraciones 0011/0012 aplicadas a `simaud_dev`, API corriendo. El editor ya guarda en `rich-v1`.
- **Codex en curso (lanzados ~13:40)**: **T15** (BD `simaud_test2`, migración 0013) y **T16** (BD `simaud_test3`, migración 0014).
  Logs en el scratch de la sesión 4: `codex-T15.log`, `codex-T16.log`. Después: **T17** enmiendas (`docs/tasks/T17-enmiendas.md`).
- Front hecho hoy: `213f0cd` /verificar + método de firma, `3a476d9` Usuarios (invitaciones/enlaces), `918c38c` Auditoría,
  `2a4507e` firmas cómodas (no saltan, ↑↓, no se borran al escribir), `dbd8383` **código viejo y supabase/ borrados**.
- La suite de la API tarda ~29 min (tests de integración contra el Postgres del VPS por el túnel). Propuesto al dueño: Postgres
  local en Docker para tests (2–4 min) o repartir en 3 BD; sin decidir.

### ESTADO A LAS 02:00
- **T12b TERMINADO** (informe `docs/tasks/T12b-auditoria-global-usuarios.REPORT.md`), **sin revisar ni commitear**.
- **T13 casi terminado**: sus 61 tests pasan, typecheck/format/build/audit OK; estaba corriendo la 2.ª suite completa.
  Si al retomar no hay `codex.exe` vivo (`tasklist | grep -c codex.exe` → 2 = solo la app) y no existe
  `docs/tasks/T13-documentos-con-formato.REPORT.md`, relanzar T13 con «completa el trabajo parcial sin rehacerlo» y BD `simaud_test2`.
- **Todo lo de `api/` sin commitear es de T13 + T12b** (comparten `schema.ts`, `_journal.json`, migraciones 0011/0012). No descartar.
- Ambos avisan: `api/test/database.test.ts` espera 22 tablas y ahora hay 24 (T12b añade `admin_audit_head`, `admin_audit_logs`):
  **ajustarlo yo** (Claude) al revisar.
- Pasos al retomar: leer ambos informes → revisar diff → ajustar `database.test.ts` → en `api/` (Git Bash)
  `npm run typecheck && npm run format:check && npm test && npm audit` con **nada más corriendo** → commit (uno por tarea si
  se puede) → SIMAUD_RUN: `git checkout --detach <commit>`, `npm run db:migrate`, reiniciar API → lanzar **T15**.
- Front posterior a la tabla de abajo: `913899f` menú «/» y barra flotante, `1d32c93` fix lint, **`a4bea71` hojas separadas y
  paginación real** (regla en `src/lib/rich-doc/pagination.ts`: bloque que cabe en una página no se parte, títulos con su
  párrafo, salto de página; editor vía extensión `pagination-extension.ts` con decoraciones; vistas vía `Sheet.tsx`).
  Verificado midiendo el DOM (5 hojas iguales en editor y vista previa); **falta que el dueño lo vea en su navegador**
  (el panel de Claude estaba oculto y sus capturas no se actualizaban; por eso los planificadores usan `setTimeout`, no rAF).
- Pendiente del editor premium: biblioteca de cláusulas, arrastrar bloques, visor del PDF real tras T15.
- **T12b cambia la API de usuarios**: el admin ya NO elige contraseña al crear/editar (invitación/restablecimiento por
  enlace, `POST /users/:id/password-reset`). Adaptar el front de Usuarios (alta y `EditUserDialog`) y hacer la pantalla
  **Auditoría** (`GET /audit`, export CSV/XLSX) con el contrato del informe T12b.

### Codex — tabla del lanzamiento (~01:10)
| Tarea | BD de pruebas | Informe al terminar |
|---|---|---|
| **T13** documentos con formato `rich-v1` en API/PDF (`docs/tasks/T13-documentos-con-formato.md`; migración **0011**) | `simaud_test2` | `docs/tasks/T13-documentos-con-formato.REPORT.md` |
| **T12b** auditoría global + gestión de acceso (migración **0012**) | **`simaud_test3`** (creada esta sesión en el VPS) | `docs/tasks/T12b-auditoria-global-usuarios.REPORT.md` |
| **T14** auditoría de seguridad (solo lectura) | — | ✅ entregado y commiteado: 18 hallazgos (0 críticos, **3 altos**: H01 borrar contrato aprobado sin firmas, H02 autoaprobación de admin/renovaciones, H03 auditoría persistente incompleta) |
- Logs en el scratch de la sesión 4 (`…/9fd9f427-…/scratchpad/codex-T13.log`, `codex-T12b.log`).
- Al terminar T13 y T12b: revisar diffs (ambos tocan `schema.ts` y `_journal.json`), **correr la suite COMPLETA**
  (la última corrida quedó contaminada por los cambios en curso y por una caída breve del túnel: 11 fallos explicables),
  commitear, actualizar SIMAUD_RUN (migrar 0011/0012) y lanzar **T15** (`docs/tasks/T15-plantillas-premium-pdf.md`:
  `rich-v2` en API/PDF, fuente Source Serif embebida, papel/márgenes, firmas estampadas en su casilla, `/templates/preview-pdf`,
  `/templates/capabilities`). Después: convertir los hallazgos de T14 en tareas (decidir H02 con el dueño).

### Entorno (cambios de esta sesión)
- SIMAUD_RUN en `51a3e88`, migración 0010 aplicada a `simaud_dev`, API corriendo (`MAIL_DRIVER=log npx tsx src/server.ts`).
- **Clave de sello de desarrollo** en `SIMAUD_RUN/api/signing-secrets/` (ignorada por git) y en el `.env` de SIMAUD_RUN:
  `SIGNING_KEY_PATH`/`SIGNING_CERT_PATH` **con rutas Windows `C:/…`** (con `/c/…` Node no las lee y la API no arranca) y
  `SIGNATURE_BACKFILL_PENDING=false`. `db:encrypt-signatures` ejecutado (0 firmas). El `.env` de SIMAUD_CFG NO las tiene
  (los tests usan clave efímera).
- El túnel 55432 tiene un bucle de reconexión (se cayó y volvió a las 01:15).
- Codex: binario `…/Codex/bin/f71a721e0e6193a9/codex.exe` (es el único con codex.exe). Lanzar con `run_in_background`.

### Editor de plantillas (decisiones del dueño, ver `docs/PLANTILLAS_PREMIUM.md`)
- Quiere un editor «premium»: hoja real, varias páginas, firmas donde van, formato fácil. Plan por fases A–E en ese doc.
- Decidido: papel **Carta** por defecto con opción Oficio/A4; encabezado/pie **vacíos** por defecto pero configurables
  (logo con tamaño, texto, «Página X de Y», posición); **un único rol «firmante»**, la etiqueta (EL CLIENTE…) se escribe
  en cada casilla; casilla n = firmante con orden de firma n.
- Hecho (front, `4036335`): hoja real, diálogo «Página», bloque «Firmas», cláusulas numeradas (CSS counters,
  `@counter-style clause-ordinal-es`), vista previa = misma hoja, menú Tabla con columnas sin bordes, pantalla completa
  en `<body>` (portal), lista de datos en portal. Formato en `src/lib/rich-doc/` (tipos, `sanitize`, `convert`,
  `page`, `Sheet`, `RichDocumentBody`). **El editor guarda en el mejor formato que acepte la API**
  (`useBestContentFormat`: v2 si `/templates/capabilities` lo anuncia, v1 si las plantillas traen `contentFormat`, si no
  texto) y degrada sin perder firmas (`richDocToV1`). Hoy la API guarda solo texto → no guardar plantillas con tablas.
- Pendiente front (fase D/E): menú «/», barra flotante al seleccionar, arrastrar bloques, panel de datos mejorado,
  visor del PDF real (pdf.js) cuando exista `/templates/preview-pdf`, biblioteca de cláusulas.
- **Ojo**: el PDF actual usa Roboto 10 pt A4 (distinto de la pantalla); T15 lo corrige.

### Decisiones del dueño (10 nov, mañana)
- **H02**: el admin SÍ puede aprobar sus propios contratos y renovaciones (queda auditado como autoaprobación); supervisor y gestor no, tampoco renovaciones que solicitaron. Incluido en `docs/tasks/T16-correcciones-auditoria.md`.
- **Contrato firmado → enmienda con nueva firma** (decidido). Tarea `docs/tasks/T17-enmiendas.md` (incluye H01), lanzar tras T15 y T16.
- **S3 cifrado en BD: aceptado** y documentado como excepción en PRINCIPIOS §5 (H15 resuelto por decisión).
- Pendiente: H03/H04/H05 (auditoría completa y DTO de privacidad) para otra tarea; H13/H14 (vigencia del certificado, DNS de S3) también.

### Otros cambios de esta sesión
- Admin: añadido módulo **Variables** al menú (`/app/variables`). El admin ya ve todas las pantallas existentes.
- Pregunta abierta nueva: corregir un contrato **ya firmado** — «enmienda con nueva firma» (recomendado) o
  «corrección directa». Sin respuesta.
- S3 cifrado en BD: sigue sin respuesta (recomendado aceptar la excepción y documentarla).
- Recordar al dueño rotar claves de Resend, Instabox y Brevo.

## ⚡ ACTUALIZACIÓN ANTERIOR (sesión 3, 10 nov 2026)
Rama `feat/backend-propio-y-nueva-ui`. `main` intacta. Últimos commits de front: `1bf4a40`, `f214b4c`, `5f62a82`, `afbf8e8`, `e43de7f`, `0dfde5f`, `c4d4929`, `c3f6cdf` (detalle abajo); backend: `cd3cb3f` (T11 + T09c). **Sin commitear: solo el trabajo en curso de Codex en `api/` (T10 y T12a).**
Lee también **`docs/PRINCIPIOS.md`** (obligatorio) y **`docs/CODE_STANDARDS.md`** (sección «Interfaz: acciones y avisos»).

### Modo de trabajo
- **Codex escribe la lógica y el backend; Claude revisa/comprueba y hace todo el front y el diseño.** Hablamos en español.
- **Binario de Codex**: `/c/Users/ismae/AppData/Local/OpenAI/Codex/bin/f71a721e0e6193a9/codex.exe` (el `codex` del PATH está roto). Si la app se actualiza, buscar el `codex.exe` más nuevo en `AppData/Local/OpenAI/Codex/bin/*/`. Lanzar desde la raíz del repo, en segundo plano: `exec -C . -s workspace-write -c sandbox_workspace_write.network_access=true -c model_reasoning_effort=high --skip-git-repo-check -o <scratch>/codex-TXX-last.md "Implementa docs/tasks/TXX…" > <scratch>/codex-TXX.log 2>&1`. Escalonar ~30 s los lanzamientos paralelos.
- Dos BD de pruebas en Instabox: `simaud_test` y `simaud_test2`. Para un segundo Codex en paralelo, exportar `DATABASE_URL_TEST` igual al de `api/.env` cambiando el nombre de BD a `simaud_test2` (sin imprimirla).
- **Los tests de `api/` se corren desde Git Bash, no PowerShell** (`t09b-backup.test.ts` necesita `sh`; en PowerShell falla con «sh: command not found», no es un defecto).
- **No crear archivos con heredocs largos de Bash** (fallan con texto en español/comillas): usar siempre la herramienta Write.
- Typecheck del front filtrado (el código viejo de `src/components` tiene errores previos que se ignoran): `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "^src/\(app\|features\|ui\|lib\)"`.

### Codex: estado
- Hecho y commiteado: T01–T09b, **T09c** (tests antiguos adaptados) y **T11** (almacenamiento disco/S3; migración `0009`; `SETTINGS_ENCRYPTION_KEY` ya generada en `api/.env`). Comprobado: typecheck, format:check, audit (0) y 437 tests en verde.
- **AL RETOMAR EN OTRA SESIÓN/CUENTA (estado al 10 nov 2026, 00:21):** T10 y T12a seguían ejecutándose y **no había informes** (`docs/tasks/T10-*.REPORT.md`, `T12a-*.REPORT.md`). Los procesos de Codex, el túnel SSH y la API pertenecen a la sesión anterior y pueden haber muerto al cerrarla. Pasos:
  1. `git status --short` y `ls docs/tasks/*.REPORT.md`. Hay ~55 archivos sin commitear, todos de Codex (`api/`, `deploy/signing.compose.yml`, `deploy/.env.prod.example`, `docs/DEPLOY.md`). **No descartarlos.**
  2. Si existe el informe de una tarea → revisar el diff, correr las comprobaciones de `api/` (Git Bash) y commitear.
  3. Si NO existe el informe y no hay un `codex.exe` vivo (`tasklist | grep -i codex`) → relanzar esa tarea con el mismo comando, añadiendo al prompt: «Ya hay trabajo parcial tuyo sin commitear en el árbol; revísalo con git status/diff, complétalo sin rehacerlo y termina con el informe». T10 usa `simaud_test`; T12a usa `simaud_test2`.
  4. Reabrir el túnel SSH (puerto 55432; comando en la sección del VPS, más abajo) y arrancar la API desde `SIMAUD_RUN/api` con `MAIL_DRIVER=log npx tsx src/server.ts` si no responden.
  5. Los logs antiguos de Codex estaban en el scratch de la sesión anterior (`codex-T10.log`, `codex-T12a.log`); pueden haberse borrado, no son necesarios.
- **EN CURSO al escribir esto** (revisar `docs/tasks/*.REPORT.md`, `git status` y los logs del scratch):
  - **T10 firma certificada** (`docs/tasks/T10-firma-certificada.md` **con ADENDA al final, que manda**; BD `simaud_test`): migración `0010_t10_certified_signatures`, `api/src/lib/crypto/`, `modules/contracts/{evidence,pdf-attestation,signature-style}.ts`, `modules/verify/`.
  - **T12a API de admin y reportes** (`docs/tasks/T12a-admin-reportes-api.md`; BD `simaud_test2`): `POST /contracts/:id/reassign`, `POST /contracts/bulk`, `GET /reports/overview`, `GET /reports/filters`, `GET /reports/overview/export`, campos nuevos (aditivos) en el dashboard de admin. Archivos: `modules/contracts/admin-{actions,routes}.ts`, `modules/reports/overview*.ts`, `modules/dashboard/rich-queries.ts`.
  - Los dos tocan `contracts/routes.ts` y `service.ts`: **revisar el diff conjunto con cuidado** antes de commitear. Al terminar: leer informes; en `api/` (Git Bash): `npm run typecheck && npm run format:check && npm test && npm audit`; commit por tarea si se puede separar.
- **Siguiente: T12b** (`docs/tasks/T12b-*.md`, ya escrita) tras T10. Después: segunda auditoría completa (Codex, solo lectura) y tests e2e Playwright (Codex).
- Hallazgos de mi revisión de T11 para decidir con el dueño: el secreto S3 se guarda **cifrado en BD** (PRINCIPIOS §5 dice «secretos nunca en BD») → o se acepta la excepción y se documenta, o se pasa a variable de entorno.

### Entorno local (IMPORTANTE al retomar)
- La API vieja de :3000 ya se detuvo. La API corre desde el **worktree limpio** `C:\Users\ismae\Desktop\simaud\SIMAUD_RUN` (detached en `1bf4a40`; migraciones 0000–0009 aplicadas a `simaud_dev`), en segundo plano desde `SIMAUD_RUN/api` con `MAIL_DRIVER=log npx tsx src/server.ts` (los usuarios seed tienen correos falsos `@simaud.local`). **Como T12a aún no está ahí, Reportes, los filtros de plantilla/gestor de Contratos, «Reasignar gestor» y las acciones en lote darán error hasta actualizarlo.** Cuando se commiteen T10/T12a: `git -C ../SIMAUD_RUN checkout --detach <commit>`, `npm ci` si cambió el lock, copiar `api/.env` si cambió, `npm run db:migrate`, reiniciar.
- El túnel SSH a la BD (puerto local 55432) debe estar abierto antes de arrancar la API.
- Front: Vite del dueño en :5173 (la API solo acepta ese origen; la preview de Claude va en :5174, así que **Claude no puede ver pantallas con sesión**: el dueño inicia sesión y revisa, o comparte capturas). Claude no puede leer `SEED_PASSWORD`.
- Correo en `api/.env`: Brevo SMTP, `RESEND_API_KEY` (alternativa), `MAIL_PAYLOAD_KEY`.
- Instabox (staging autorizado; tocar SOLO la máquina `simaud` = `m_agq4fpcgma6kpfqey5ffoy2wui`): clave en `.env.ops` (ignorado por git). API `https://api.instabox.sh/v1`, cabecera `X-API-Key`; publicar puerto con `POST /v1/machines/<id>/ports`. Plan: override de compose para staging con nginx solo HTTP (p. ej. 8080), `TRUST_PROXY=2`, `APP_URL` pública.
- Recordar al dueño **rotar** las claves de Resend, Instabox y Brevo (se pegaron en el chat).

### Front hecho en la sesión 3 (commiteado; typecheck filtrado limpio y `npm run build` en verde; **nada verificado aún con sesión**)
- **Sidebar** plegable a iconos (recuerda estado), con jerarquía por secciones, y **menú de cuenta** (`AccountMenu`). **Paleta Ctrl+K** rediseñada (`CommandPalette`). **Aprobaciones** rediseñada.
- **Reportes** rehechos: `src/features/reports/*` (filtros de período/estado/plantilla/gestor, 8 indicadores con comparación contra el período anterior, evolución, estados, plantillas, rangos de valor, tabla por gestor, mayores contratos, aprobaciones, usuarios; exportar PDF/Excel/CSV). Gráficos propios en `src/ui/bar-charts.tsx`; colores de estado en `src/lib/api/status-colors.ts`. Depende de T12a.
- **Módulo avanzado de contratos** (`src/features/contracts/ContractsListPage.tsx`, `ContractListFilters.tsx`, `admin/*`): filtros por plantilla, gestor y orden (en la URL); menú por fila según rol y estado; para admin, selección múltiple y barra de lote (archivar, desarchivar, cancelar con motivo). Hooks en `src/lib/api/hooks/contract-admin.ts`. Reasignar y lote dependen de T12a. En móvil no hay selección ni menú por fila.
- **Detalle de contrato** (`c4d4929`): «Reasignar gestor…» si la API manda `can.reassign` (T12a); eliminar solo borradores, sin `confirm` en el cuerpo (así lo espera la API) y con texto correcto.
- **Panel de admin** (`afbf8e8`): accesos rápidos, totales, mejores gestores, usuarios por rol, actividad reciente (`AdminDashboardExtras.tsx`).
- **Paneles de supervisor y gestor** (`0dfde5f`): supervisor con catálogo, plantillas más usadas/por categoría, decisiones y actividad; gestor con carriles (`GestorLanes.tsx`), gráfico de 12 meses, estados y vencimientos. Tarjetas compartidas: `ExpirationsCard.tsx`, `StatusBreakdownCard.tsx`. Todos los campos de T12a son opcionales en `dashboard-types.ts`: con una API antigua simplemente no se pintan.
- **Configuración › Almacenamiento** (`e43de7f`): `src/features/settings/StorageSection.tsx` + `src/lib/api/hooks/storage.ts` (disco/S3, «Probar conexión» con pasos y latencia, guardar con confirmación, aviso de destino pendiente y «Migrar ahora», sondeo mientras migra). El identificador de acceso hay que reescribirlo siempre al guardar S3 (la API lo exige); la clave secreta se puede dejar vacía si no cambian endpoint/bucket/identificador. **Sin probar contra un S3 real.**
- **Usuarios** (`c3f6cdf`): «Editar datos…» (`EditUserDialog.tsx`: nombre, cédula, teléfono; el correo no se edita ahí).

### Pendiente de front (en este orden)
1. **Página pública `/verificar`** y envío de `method/fontId` en la firma (tras T10; leer su informe para las rutas exactas).
2. Filtros en plantillas/variables; borrar notificaciones (`useDeleteNotification`); repaso de formularios (asistente de contrato, editor de plantilla) y de la bandeja del firmante (`SignaturesInboxPage`, ya aceptable).
3. Verificar TODO con el dueño con sesión a 1440/768/375 px y corregir (requiere actualizar `SIMAUD_RUN` con T12a/T10).
4. ~~Borrar código viejo~~ (hecho en `dbd8383`, incl. `supabase/`; el original sigue en `main`). Staging en Instabox y prueba completa con los 4 roles.

### Preguntas abiertas al dueño
- Secreto de S3 cifrado en BD: ¿se acepta como excepción a PRINCIPIOS §5 o se mueve a variable de entorno?
- «Forzar estado» del admin: ¿puede ir a cualquier estado o solo a transiciones razonables?
- Datos de la institución (nombre, RNC, dirección) para el PDF y la constancia.
- Plazo legal de conservación de contratos firmados.
- ¿Posicionar los recuadros de firma dentro del documento? (requiere API y PDF).
- ~~OK para borrar `supabase/`~~ (dado y hecho).

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
