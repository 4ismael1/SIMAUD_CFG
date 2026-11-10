# T15 — Plantillas premium: `rich-v2`, maqueta única y firmas en su casilla (lanzar DESPUÉS de T13)

**Asignado a:** Codex · **Revisa:** Claude. Lee `docs/PRINCIPIOS.md`, `docs/CODE_STANDARDS.md`,
`docs/PLANTILLAS_PREMIUM.md`, `docs/RICH_DOC_FORMAT.md` y **`docs/RICH_DOC_FORMAT_V2.md` (manda)**, y los informes
T10 y T13.

Alcance: `api/src/lib/rich-doc/**`, `api/src/lib/pdf.ts`, `api/src/modules/contracts/**` (PDF, constancia, preview,
catálogo), `api/assets/fonts/**`, `api/src/modules/system/settings.ts` (solo lectura del logo), schema + migración
nueva si hace falta (número **0013**; T16 en paralelo usa la 0014), `api/test/t15-*.test.ts`. No toques `src/**` (front).

## 1. Formato `rich-v2`
- `content_format` admite `'rich-v2'`. Valida estrictamente `RICH_DOC_FORMAT_V2.md` (página, encabezado/pie, `signatures`,
  `signatureSlot`, `heading.numbered`). Un documento `rich-v1` se acepta y se trata con los valores por defecto.
- Canonicalización y hash documental (T10/T13) incluyen los ajustes de página: cambiar márgenes cambia el hash.

## 2. Maqueta única en el PDF
- Embebe **Source Serif 4** (regular, itálica, negrita, negrita-itálica; OFL, ficheros TTF en `assets/fonts`, con su
  licencia) y **Geist** para `font: "sans"`. Sin descargas en tiempo de ejecución.
- Tamaño de papel, márgenes (mm → pt), fuente, tamaño e interlineado desde `page`. Los documentos `plain` y `rich-v1`
  usan los valores por defecto de v2 (Carta, 25 mm, Source Serif 11 pt, 1,5): así pantalla y PDF coinciden siempre.
  La constancia de T10 conserva su diseño pero usa el mismo papel.
- Encabezado/pie según `Band` (texto, logo de la institución con su altura, «Página X de Y»; `skipFirstPage`).
- Paginación **idéntica a la del editor** (`src/lib/rich-doc/pagination.ts`, léelo): un bloque de primer nivel que cabe
  en una página **no se parte** (si no cabe en lo que queda, pasa entero a la siguiente: párrafos, listas, tablas,
  citas y `signatures`); solo un bloque más alto que una página continúa en la siguiente; un título va siempre con el
  inicio del bloque siguiente (≈ 2 líneas); tras `pageBreak` empieza página nueva. En pdfmake: `unbreakable` en los
  bloques que quepan en una página, `pageBreakBefore` para títulos huérfanos, `headerRows: 1` en tablas con encabezado.
- Títulos numerados (`ordinal`/`decimal`) según la especificación, en español, por nivel.

## 3. Firmas en su casilla
- Casilla n ↔ firmante con orden de firma n (reglas de casillas sobrantes y faltantes de la especificación).
- Plantilla/borrador/preview: «[Firmante n]» y línea. Contrato con firmantes: nombre y cédula reales (si `showName/showId`).
- PDF final (última firma, T10): la imagen de cada firma (descifrada en memoria, nunca a disco en claro) se estampa sobre
  su línea, con la fecha de firma debajo. El PDF final sigue siendo inmutable y su hash entra en el sello como hoy.

## 4. Capacidades
`GET /templates/capabilities` (staff) → `{ formats: ["plain", "rich-v1", "rich-v2"], paperSizes: ["letter","legal","a4"],
fonts: ["serif","sans"], previewPdf: true }`. El front lo usa para decidir qué formato guardar.

## 5. Vista previa con el PDF real
`POST /templates/preview-pdf` (mismos permisos que `/templates/preview`): recibe `{ contentFormat, content, title }`
y devuelve el PDF (application/pdf, `no-store`) con los datos como «[Etiqueta]» y las firmas como «[Firmante n]».
Límite de tamaño y rate limit (p. ej. 20/min por usuario). `GET /contracts/:id/pdf` ya existente sirve para contratos.

## Entrega
Suite completa en verde al final (`npm run typecheck && npm run format:check && npm test && npm audit`, Git Bash).
Revisa visualmente PDFs sintéticos: Carta y A4, 3 páginas, encabezado/pie, cláusulas numeradas, tabla larga partida,
firmas en 1/2/3 columnas, firma estampada; descríbelos en el informe. No hagas git commit. No imprimas secretos.
Termina con `docs/tasks/T15-plantillas-premium-pdf.REPORT.md`.
