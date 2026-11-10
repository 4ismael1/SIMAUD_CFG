# Editor de plantillas «premium» — diseño propuesto

Objetivo del dueño: que redactar una plantilla sea fácil, que las firmas queden donde van, que el formato se adapte
solo y que los contratos de varias páginas salgan bien. Hoy el editor es un procesador de texto «suelto»: no sabe de
páginas, la pantalla usa una fuente y el PDF otra (Roboto 10 pt), y las firmas se dibujan a mano con tablas.

## Principio rector: una sola maqueta, de la pantalla al PDF
Todo lo que define cómo se ve el documento (papel, márgenes, fuente, tamaños, espaciado, numeración) vive en **un único
«estilo de documento»** que usan el editor, la vista previa y el PDF. Nada de ajustar a ojo: si el editor muestra
una hoja Carta con márgenes de 2,5 cm y Source Serif 11 pt, el PDF es exactamente eso.

## 1. Hoja real y paginación
- El editor muestra **la hoja** (Carta 8,5 × 11 o A4, elegible por plantilla) con sus márgenes reales, sobre fondo gris,
  como Word/Google Docs. En el móvil la hoja se escala para caber en el ancho.
- **Vista previa = el PDF real.** La pestaña «Vista previa» pide a la API el PDF de la plantilla (con los datos como
  etiquetas) y lo muestra página a página dentro de la app (pdf.js, también en móvil). Así la paginación que ve el
  usuario es *la misma* que se firmará; no hay dos motores que puedan discrepar.
- Reglas automáticas de paginación en el PDF: un título nunca queda solo al final de una página (va con su primer
  párrafo); el bloque de firmas nunca se parte; tablas con fila de encabezado repetida en cada página.
- Encabezado y pie configurables: logo y nombre de la institución, código del contrato, **«Página X de Y»**, primera
  página distinta.

## 2. Firmas que quedan donde van
- Nuevo elemento **«Firmas»** (no una tabla): se coloca donde el autor quiera (normalmente al final) y se configura en
  1, 2 o 3 columnas. Cada casilla está ligada a un **rol de firmante** (cliente, contratista, testigo, representante
  institucional…), no a texto escrito.
- Al crear el contrato las casillas se rellenan solas con nombre y cédula de los firmantes reales; al firmar, **la
  imagen de la firma se estampa en esa casilla** del PDF final (además de la constancia de T10).
- Si el contrato tiene más firmantes que casillas, se añaden filas automáticamente; nunca se descuadra ni se parte
  entre páginas.

## 3. Redactar sin pelear con el formato
- **Estilos, no formato suelto**: «Título del contrato», «Cláusula», «Texto», «Nota». Cambiar un estilo cambia todo el
  documento de una vez (y el PDF).
- **Cláusulas numeradas solas**: PRIMERA, SEGUNDA, TERCERA… (o 1., 2., 3.) se renumeran al mover o borrar una.
- Menú **«/»** para insertar cualquier bloque (cláusula, lista, tabla, firmas, salto de página, dato) y asa para
  **arrastrar bloques** y reordenar cláusulas.
- Barra flotante al seleccionar texto (negrita, cursiva, subrayado, enlace a dato).
- Panel de **datos** a la derecha: buscar, ver tipo y obligatoriedad, clic o arrastrar para insertar; avisos de datos
  sin usar o inexistentes.
- **Biblioteca de cláusulas** reutilizables (confidencialidad, jurisdicción, pagos…): insertar con un clic y mantener
  actualizadas desde un sitio.
- Configuración de página por plantilla: papel, márgenes, fuente (Source Serif / Times / Arial), tamaño base,
  interlineado.

## 4. Fases
| Fase | Qué | Quién |
|---|---|---|
| A | Estilo de documento único (fuente Source Serif embebida en el PDF, Carta/A4, márgenes, tamaños) + vista previa con el PDF real de la API | Codex (API/PDF) + Claude (visor) |
| B | Hoja real en el editor, encabezado/pie con «Página X de Y», reglas de paginación | Claude + Codex |
| C | Elemento «Firmas» ligado a roles, estampado de firmas en su casilla | Codex (modelo, PDF) + Claude (editor) |
| D | Estilos, cláusulas numeradas, menú «/», arrastrar bloques, barra flotante, panel de datos | Claude |
| E | Biblioteca de cláusulas | Codex (API) + Claude |

Formato: estos elementos amplían `rich-v1` a **`rich-v2`** (ajustes de página en el documento, nodos `signatures`
y `clause`). T13 (en curso) deja la base `rich-v1` lista; la fase A–C va en una tarea siguiente (T15) para no
interrumpirla.

## Decisiones del dueño (10 nov 2026)
1. **Papel**: Carta por defecto, con opciones (Carta, Oficio/Legal, A4) elegibles por plantilla.
2. **Encabezado/pie**: vacíos por defecto. Opción de añadir logo y/o texto, con tamaño y posición editables
   (izquierda/centro/derecha) y «Página X de Y» opcional.
3. **Firmantes**: un único rol «firmante». La etiqueta (EL CLIENTE, EL CONTRATISTA, TESTIGO…) se escribe en cada
   casilla del elemento «Firmas» del propio documento. Casilla n ↔ firmante con orden de firma n.
