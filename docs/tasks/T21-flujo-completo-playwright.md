# T21 — Flujo completo de punta a punta con Playwright

**Asignado a:** Codex · **Revisa:** Claude. Lee `docs/PRINCIPIOS.md`, `docs/CODE_STANDARDS.md` y los informes T15–T20.
Sin commit, sin imprimir secretos, sin leer `api/.env`.

## Objetivo (pedido del dueño, 10 nov 2026)
Un recorrido automático **en orden, como el día a día del sistema, sin saltarse nada**, usando la interfaz real en un
navegador. Primero se ejecuta **sin ventana** y deja como resultado los PDF, capturas, vídeos y un resumen; después debe
poder repetirse **con ventana** o en modo interfaz para verlo en vivo. **Sin registro de cuentas**: se usan cuentas
precreadas (el dueño gestiona las cuentas reales aparte).

## Entorno aislado (no tocar `simaud_dev` ni la API/Vite del dueño en :3000/:5173)
- BD **`simaud_e2e`** en el PostgreSQL local (`postgres://simaud@127.0.0.1:55433/simaud_e2e`, ya creada). Cada ejecución la
  reinicia, migra y siembra.
- API propia en **:3100** y Vite propio en **:5175**, levantados por `webServer` de Playwright. `vite.config.ts` puede leer
  el destino del proxy de una variable (`VITE_API_PROXY`, por defecto `http://localhost:3000`): único cambio permitido
  fuera de `e2e/`, `playwright.config.ts`, `package.json` (scripts) y un script de siembra en `api/src/db/`.
- Configuración de la API de e2e generada por un script de preparación en `e2e/.env.e2e` (añadir a `.gitignore`): secretos
  aleatorios, `APP_URL=http://localhost:5175`, `MAIL_DRIVER=log`, almacenamiento en un directorio temporal de `e2e/`,
  clave de sello de prueba generada con el script existente en un directorio ignorado. Nada de eso se imprime.
- **Cuentas precreadas** por la siembra, con correo confirmado y contraseñas generadas guardadas solo en `e2e/.env.e2e`:
  admin, supervisor, gestor, dos firmantes y un testigo (rol usuario), con cédulas válidas sintéticas.
- `@playwright/test` ya está instalado en la raíz. Usar el **Google Chrome instalado** en el equipo (`channel: 'chrome'`); el
  Chromium propio de Playwright puede no estar descargado. No añadir otras dependencias sin justificarlo en el informe.
- **No modificar `src/`** (la app). Usar selectores accesibles (rol, etiqueta, texto). Si algo no se puede automatizar o
  encuentras un fallo de la app, **documéntalo en el informe** con captura en vez de cambiar la app.

## Recorrido (en este orden, con capturas por paso)
1. **Admin**: inicia sesión; crea variables del catálogo (p. ej. `ciudad_firma`, `forma_pago`, `representante_cargo`);
   crea una **plantilla** en el editor: título, categoría, texto con formato (títulos, negrita, lista, tabla), variables
   insertadas con «{{», bloque **Firmas** con 2 casillas («EL CONTRATISTA» datos `cliente`; «POR LA INSTITUCIÓN» datos
   `representante`), configuración de página; revisa la pestaña **PDF**; guarda y reabre. Revisa Usuarios, Configuración,
   Auditoría y Reportes (filtra y **exporta** CSV).
2. **Supervisor**: inicia sesión; revisa su panel y el catálogo.
3. **Gestor**: crea el contrato con el asistente: plantilla, datos (incluido el cargo como dato), **firmantes por cédula**
   (se rellenan solos), «**Añadir testigo**», revisa la vista previa, descarga el PDF de borrador y **envía a aprobación**.
4. **Supervisor**: **devuelve** con comentario → **Gestor** corrige y reenvía → **Supervisor** **aprueba**.
5. **Firmante 1**: bandeja «Por firmar»; abre, lee hasta el final, acepta la declaración, **sube `e2e/fixtures/firma-a.png`**,
   en «Así quedará tu firma» la **arrastra y cambia su tamaño**, confirma.
6. **Gestor**: «**Pedir nueva firma**» a Firmante 1 con motivo → Firmante 1 vuelve a firmar **dibujando** con el ratón.
7. **Firmante 2**: firma subiendo **`e2e/fixtures/firma-b.png`**. **Testigo**: firma **escribiendo** su nombre.
8. Contrato **Vigente**: descarga el **PDF final** y comprueba (páginas, nombres y cédulas con formato, roles de las casillas,
   que no hay cabecera «SIMAUD» en la primera página, constancia con QR/código). Guarda el PDF en la carpeta de resultados.
9. **/verificar** (sin sesión): con el código de la constancia → «Código registrado»; comprobar el PDF descargado →
   «**Documento auténtico**»; un PDF alterado (1 byte) → «**NO coincide**»; descargar la **copia oficial**.
10. **Enmienda**: Gestor «Crear enmienda» con motivo, cambia una cláusula, envía; Supervisor aprueba; firman todos →
    original «**Enmendado**» con la cadena visible; /verificar del original → «sustituido por la enmienda E1».
11. **Resto del ciclo**: un segundo contrato para **cancelar** (con motivo) y **archivar/desarchivar**; **renovación**
    (solicitar y procesar) si el contrato es elegible (si no lo es, crearlo con fechas que lo hagan elegible);
    **notificaciones** (campana) del firmante; **Mi perfil** (cambiar teléfono); **Reiniciar firmas** en un contrato con
    firmas parciales.

## Resultados
- Carpeta `e2e/output/<fecha-hora>/` (ignorada por git): PDFs (borrador, final, copia oficial, enmienda), capturas por paso,
  vídeos, el informe HTML de Playwright y **`RESUMEN.md`** con: cada paso OK/fallo, códigos de contrato y de verificación,
  rutas de los PDF y avisos.
- Scripts: `npm run e2e` (sin ventana), `npm run e2e:headed` (con ventana, `slowMo`), `npm run e2e:ui` (modo interfaz).
- Debe durar menos de ~10 minutos y ser repetible (cada ejecución parte de cero).

## Entrega
El recorrido completo pasa de principio a fin sin ventana. Informe `docs/tasks/T21-flujo-completo-playwright.REPORT.md` con
cómo ejecutarlo, qué cubre, la última carpeta de resultados y **todo fallo o rareza de la app encontrado** (con captura).
