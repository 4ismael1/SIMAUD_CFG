# `rich-v2` (amplía `rich-v1`; ver docs/PLANTILLAS_PREMIUM.md)

Todo lo de `rich-v1` sigue valiendo. `rich-v2` añade **ajustes de página** en el documento, **firmas colocadas** y
**cláusulas numeradas**. Un documento `rich-v1` se lee como `rich-v2` con los valores por defecto.

```
doc        { type: "doc", attrs?: { page?: Page, header?: Band, footer?: Band }, content: Block[] }

Page       { size?: "letter" | "legal" | "a4",                       (defecto "letter" = Carta 215,9 × 279,4 mm;
                                                                      legal = Oficio 215,9 × 355,6; a4 = 210 × 297)
             margins?: { top, right, bottom, left },                  (mm, enteros 10..50; defecto 25 cada uno)
             font?: "serif" | "sans",                                 (serif = Source Serif 4; sans = Geist; defecto serif)
             fontSize?: 10 | 10.5 | 11 | 11.5 | 12 | 13 | 14,         (pt; defecto 11)
             lineHeight?: 1 | 1.15 | 1.5 | 2 }                        (defecto 1.5)

Band       { left?: Slot, center?: Slot, right?: Slot, skipFirstPage?: boolean }   (encabezado/pie; ausente = vacío)
Slot       { kind: "text", text: string (1..120), size?: 7..14 }
         | { kind: "logo", height?: 8..40 }                           (mm; usa el logo de la institución de Configuración)
         | { kind: "pageNumber", format?: "page" | "pageOfTotal" }    ("3" o "Página 3 de 7"; defecto pageOfTotal)

Block += signatures
signatures { type: "signatures", attrs?: { columns?: 1 | 2 | 3 }, content: signatureSlot[] }   (1..12 casillas; defecto 2 columnas)
signatureSlot { type: "signatureSlot", attrs: { label: string (0..60), showName?: boolean, showId?: boolean } }
           (defectos showName = true, showId = true)

heading.attrs += { numbered?: "ordinal" | "decimal" }
           Títulos numerados: el número se calcula al pintar, contando los títulos numerados del MISMO nivel en orden:
           ordinal → "PRIMERA.", "SEGUNDA.", … (hasta "QUINCUAGÉSIMA"); decimal → "1.", "2.", …
           El texto del título no incluye el número (al mover o borrar una cláusula, se renumera sola).
```

## Firmas
- La casilla n (en orden de documento, contando todos los elementos `signatures`) corresponde al **firmante con orden de
  firma n**. Un único rol «firmante»; la etiqueta (EL CLIENTE…) la escribe el autor en la casilla.
- Cada casilla se pinta: espacio para la firma, línea, nombre (si `showName`), cédula (si `showId`) y etiqueta.
  En plantillas y borradores: «[Firmante n]». En el PDF final, **la imagen de la firma se estampa sobre la línea** y debajo
  la fecha de firma.
- Si hay más firmantes que casillas, se añaden casillas al final del último elemento `signatures` (etiqueta vacía); si no
  hay ningún elemento `signatures`, se añade uno de 2 columnas al final del documento.
- Un elemento `signatures` nunca se parte entre páginas.

## Paginación (PDF)
- Tamaño, márgenes, fuente, tamaño de letra e interlineado salen de `page` (la pantalla usa los mismos valores).
- Un título nunca queda como última línea de una página: va con el bloque siguiente.
- Tablas: la primera fila se repite en cada página si es encabezado.
