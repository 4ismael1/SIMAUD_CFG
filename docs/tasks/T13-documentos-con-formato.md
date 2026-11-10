# T13 — Documentos con formato (`rich-v1`) en API, PDF y evidencia

**Asignado a:** Codex · **Revisa:** Claude. Lee primero `docs/PRINCIPIOS.md`, `docs/CODE_STANDARDS.md`,
**`docs/RICH_DOC_FORMAT.md` (el contrato de esta tarea, manda)** y los informes T10 y T12a.

Alcance: `api/src/lib/render-template.ts` y un módulo nuevo `api/src/lib/rich-doc/**`, `api/src/modules/contracts/**`
(catálogo, servicio, rutas, PDF, constancia, evidencia, historial de variables), `api/src/modules/renewals/service.ts`,
`api/src/modules/verify/service.ts` (solo si usa el contenido), `api/src/db/schema.ts` + **migración nueva `0011`**,
`api/src/db/seed-contracts.ts` y `api/test/t13-*.test.ts`. **No toques `src/**` (front) ni `docs/RICH_DOC_FORMAT.md`**:
si algo del formato no encaja, explícalo en el informe.

## Contexto
El front ya tiene un editor tipo Word (TipTap) que produce un documento JSON con lista blanca (ver el formato). Hoy la
API solo guarda texto plano con `{{variable}}`, así que el front convierte a texto al guardar y se pierden títulos,
cursiva, listas, tablas, alineación, saltos de página y el «bloque de firmas» (tabla `borderless`). El front detecta
el soporte cuando las plantillas devuelven el campo `contentFormat`.

## 1. Modelo
- Columna `content_format text not null default 'plain'` con check `in ('plain','rich-v1')` en `contract_templates`,
  `contracts` y `contract_versions`. Nada se migra: todo lo existente queda `plain`.
- Con `rich-v1`, `content` y `generated_content` guardan el JSON **canónico** (claves ordenadas según el formato, sin
  espacios, atributos por defecto/nulos omitidos). Un contrato hereda el formato de su plantilla; cada versión, el del
  contrato en ese momento.

## 2. Validación (`lib/rich-doc/schema.ts`)
Zod **estricto** que implemente exactamente `docs/RICH_DOC_FORMAT.md`: nodos, marcas, atributos, rangos, límites
(500 KB serializado, profundidad 12, 2000 bloques, 5000 variables, 20 000 caracteres por nodo de texto, tablas 1–200 filas
y 1–12 columnas, `colspan/rowspan` coherentes). Lo desconocido → 400 `VALIDATION_ERROR` con la ruta del nodo. Normaliza
(quita nulos/por defecto) antes de canonicalizar. Tests de cada regla, incluidos intentos de colar HTML/atributos
(`href`, `style`, `class`, `onclick`, tipos de nodo inventados) y documentos gigantes.

## 3. Variables y renderizado (`lib/rich-doc/render.ts`)
- `extractVariables(doc)`: recorre el árbol (no regex sobre el JSON). Un `{{x}}` dentro de un nodo de texto es literal.
- `renderRichDoc(doc, values, defs)`: sustituye cada nodo `variable` por un nodo `text` con el valor formateado con
  **las mismas reglas** que `renderTemplate` (extrae esas reglas a una función compartida, sin duplicarlas), conservando
  sus marcas; si falta el valor, deja el nodo y lo añade a `missing`.
- Texto plano del documento (para búsqueda y longitud): función `richDocText`.
- Todo lo que hoy llama a `renderTemplate`/`extractVariables` debe elegir según `content_format` (catálogo, preview,
  creación/edición de contratos, renovaciones, historial de variables, seed).

## 4. API
- `POST/PATCH /templates`: aceptan `contentFormat` (`plain` por defecto). Con `rich-v1`, `content` es un **objeto**.
  Cambiar de `plain` a `rich-v1` está permitido (el front convierte las antiguas al abrirlas); al revés, no (400).
- `GET` de plantillas (lista y detalle), contratos (detalle) y versiones: incluyen **siempre** `contentFormat`
  (también `'plain'`, es la señal de soporte del front) y, con `rich-v1`, `content`/`generatedContent` como objetos.
- `POST /templates/preview`: `{ contentFormat?, content, values }` → `{ contentFormat: 'plain', html, missing }` o
  `{ contentFormat: 'rich-v1', document, missing }`. Mismos permisos y comprobaciones que hoy.
- Creación/edición de contratos: el contenido sale de la plantilla como hoy; si el front envía contenido propio del
  contrato, valida según el formato del contrato.

## 5. PDF (`pdf.ts`) y constancia
Mapea `rich-v1` a pdfmake: párrafos con alineación; títulos 1–3 (tamaños proporcionales a los actuales); listas con
viñetas/numeradas anidadas (respeta `start`); cita con sangría y borde izquierdo; línea horizontal; `pageBreak` → salto
real; tablas con `colSpan/rowSpan`, columnas de igual ancho (`'*'`), encabezado en negrita con fondo gris claro, y
`borderless` → `layout: 'noBorders'`; marcas → `bold/italics/decoration (underline, lineThrough)/sup/sub/background`.
Respeta los espacios del texto (`preserveLeadingSpaces`). Fuentes y márgenes actuales. El formato `plain` no cambia.
Revisa visualmente un PDF sintético con todos los nodos (como en T10) y descríbelo en el informe.

## 6. Evidencia (T10)
El hash documental de `rich-v1` se calcula sobre la serialización canónica UTF-8 de `generated_content`. Documenta
la regla en el informe y añade tests: mismo documento con claves en distinto orden → mismo hash; cambiar una marca o
un atributo → hash distinto. El formato `plain` mantiene exactamente su canonicalización actual.

## 7. Seed
Añade una plantilla de ejemplo `rich-v1` (títulos, lista, tabla, bloque de firmas `borderless`, variables) sin
modificar las existentes.

## Entrega
`npm run typecheck && npm run format:check && npm test && npm audit` en verde **ejecutando la suite completa al final**
(desde Git Bash), BD `simaud_test`. Código legible (CODE_STANDARDS). Sin dependencias nuevas salvo justificación.
No hagas git commit. No imprimas secretos. Termina con `docs/tasks/T13-documentos-con-formato.REPORT.md`: contrato
HTTP final, decisiones, límites y cómo probarlo.
