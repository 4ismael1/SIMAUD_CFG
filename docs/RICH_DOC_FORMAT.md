# Formato de documento con formato (`rich-v1`)

Contrato entre el front (editor TipTap, vista del documento) y la API (validación, variables, PDF, evidencia de T10).
Cualquier cambio aquí exige cambiar **los dos lados** y subir la versión (`rich-v2`).

## Principios
- **Nunca HTML.** El documento se guarda como JSON estructurado (subconjunto de ProseMirror/TipTap). El front lo pinta con
  componentes de React; la API lo convierte a pdfmake. Nada se interpreta como HTML en ningún punto.
- **Lista blanca estricta.** Todo nodo, marca o atributo que no aparezca abajo se rechaza con 400 (no se ignora en silencio).
- **Compatibilidad.** Plantillas, contratos y versiones existentes siguen en formato `plain` (texto con `{{variable}}` y
  `**negrita**`). Cada registro lleva su formato; no hay migración forzosa de datos.

## Dónde vive
- Columna nueva `content_format` (`'plain' | 'rich-v1'`, por defecto `'plain'`) en `contract_templates`, `contracts` y
  `contract_versions`.
- Con `rich-v1`, `content` guarda el JSON del documento **serializado de forma canónica** (claves en el orden de este documento,
  sin espacios) y `generated_content` guarda el documento ya resuelto (variables sustituidas), con el mismo formato.
- Un contrato hereda el formato de su plantilla; una versión hereda el del contrato en ese momento.

## Estructura

```
doc        { type: "doc", content: Block[] }               (1..2000 bloques)

Block:
paragraph  { type: "paragraph", attrs?: { textAlign? }, content?: Inline[] }
heading    { type: "heading", attrs: { level: 1|2|3, textAlign? }, content?: Inline[] }
bulletList { type: "bulletList", content: listItem[] }
orderedList{ type: "orderedList", attrs?: { start?: 1..9999 }, content: listItem[] }
listItem   { type: "listItem", content: (paragraph | bulletList | orderedList)[] }   (el primero, paragraph)
blockquote { type: "blockquote", content: (paragraph | heading | bulletList | orderedList)[] }
horizontalRule { type: "horizontalRule" }
pageBreak  { type: "pageBreak" }                           (salto de página en el PDF; en pantalla, una línea discontinua)
table      { type: "table", attrs?: { borderless?: true }, content: tableRow[] }   (1..200 filas, 1..12 columnas)
           borderless = columnas sin líneas (bloques de firma); en el PDF, layout "noBorders" y columnas iguales.
tableRow   { type: "tableRow", content: (tableCell | tableHeader)[] }
tableCell / tableHeader
           { type, attrs?: { colspan?: 1..12, rowspan?: 1..200, colwidth?: (int 20..2000)[] | null },
             content: (paragraph | bulletList | orderedList)[] }

Inline:
text       { type: "text", text: string (1..20000), marks?: Mark[] }
hardBreak  { type: "hardBreak" }
variable   { type: "variable", attrs: { name: /^[a-z][a-z0-9_]{1,49}$/ }, marks?: Mark[] }

Mark (sin repetir tipo en el mismo nodo):
bold | italic | underline | strike | superscript | subscript | highlight   → { type }

textAlign: "left" | "center" | "right" | "justify"   (ausente = left)
```

Límites globales: JSON serializado ≤ 500 KB; profundidad ≤ 12; ≤ 5000 variables por documento.
`attrs` con valor `null` o por defecto se omiten al canonicalizar (el editor puede enviarlos; la API los normaliza).

## Variables
- En `rich-v1` las variables **son nodos** `variable`, no texto `{{…}}`. Un `{{x}}` escrito dentro de un nodo `text` es texto
  literal y no se sustituye.
- Extraer variables = recorrer el árbol y reunir `attrs.name` (únicos, en orden de aparición).
- Resolver = reemplazar cada nodo `variable` por un nodo `text` con el valor ya formateado (mismas reglas que `renderTemplate`:
  fechas en es-DO, moneda RD$, opciones de lista válidas) **conservando sus marcas**. Si falta el valor, el nodo `variable` se
  queda tal cual y su nombre entra en `missing`.

## API
- `POST /templates`, `PATCH /templates/:id`: aceptan `contentFormat` (`plain` por defecto). Con `rich-v1`, `content` es el
  **objeto** documento (no un string) y se valida con el esquema anterior.
- `GET` de plantilla/contrato/versión: devuelven `contentFormat` y, con `rich-v1`, `content` y `generatedContent` como objetos.
- `POST /templates/preview`: acepta `{ contentFormat?, content, values }` y responde
  `{ contentFormat: 'plain', html, missing }` o `{ contentFormat: 'rich-v1', document, missing }`.
- PDF (`pdf.ts` y la constancia de T10): mapear cada nodo a pdfmake (párrafos con alineación, títulos 1–3, listas anidadas,
  tablas con colSpan/rowSpan, cita con sangría y borde, línea, salto de página, marcas → bold/italics/decoration/sup/sub/background).
- Evidencia de T10: el hash del documento se calcula sobre la serialización canónica de `generated_content`.
- Búsqueda de texto (si existe) usa el texto plano extraído del documento.
