# T15 — Plantillas premium y PDF

Fecha: 10 de noviembre de 2026.

## Resultado

Implementados `rich-v2`, la maqueta PDF compartida con el editor, las firmas colocadas,
las capacidades del catálogo y la vista previa PDF. La migración propia es
`0013_t15_premium_documents.sql`. No se editaron archivos de `src/`, no se hizo commit
y no se imprimieron secretos ni se leyó directamente `api/.env`. El árbol
compartido sí contiene cambios concurrentes en el front; T15 no los escribió
ni los revirtió.

Las comprobaciones se ejecutaron desde Git Bash con la configuración existente.
La conexión real se comprobó mediante `current_database()`: **simaud_test2**.
No se cambió `DATABASE_URL_TEST`. Las pruebas no tienen una base concreta codificada,
de modo que siguen funcionando en la base independiente del trabajo paralelo.

La entrega no se presenta como una suite global verde. La corrida completa terminó
con **563 aprobadas, 8 fallidas y 67 omitidas**; al final cayó el túnel PostgreSQL.
La repetición posterior aprueba las **39 pruebas propias de validación y PDF**,
pero no puede iniciar las cuatro HTTP por `ECONNRESET`. Esas cuatro habían pasado
dentro de la corrida completa.

## Formato, persistencia y hash

- Las tres columnas `content_format` admiten `plain`, `rich-v1` y `rich-v2`, con
  `plain` por defecto. La migración solo amplía sus restricciones; no reescribe
  documentos, versiones, evidencias ni PDF finales existentes.
- La validación conserva la lista blanca y los presupuestos de T13. Añade papel,
  márgenes, fuente, tamaño, interlineado, bandas, casillas, columnas y numeración.
  Se rechazan atributos desconocidos, valores fuera de rango y contenido nuevo
  declarado como `rich-v1`.
- La canonicalización fija el orden de los nuevos atributos y omite los valores
  predeterminados. Los documentos antiguos sin atributos conservan su serialización
  y su hash. Cambiar papel o márgenes cambia el hash canónico de `generated_content`.
- Catálogo, duplicación, contratos, versiones, preview, renovación y evidencia usan
  los adaptadores de contenido comunes. Se mantiene el bloqueo de conversión de
  documentos rich a texto plano, también para `rich-v2`.

Se releyeron `schema.ts` y `_journal.json` inmediatamente antes de cada escritura
propia. Se conservaron los campos y la entrada `0014` del trabajo T16. En
`contracts/routes.ts`, el cambio funcional propio es extender a `rich-v2` el bloqueo
de conversión a `plain`. No se tocaron las correcciones de permisos, bloqueos,
reportes, autenticación o almacenamiento reservadas a T16.

## Maqueta y paginación

Las rutas de PDF utilizan `documentPdf()`, tanto para preview como para contratos.
Los valores por defecto son Carta, 25 mm por lado, Source Serif 4, 11 pt e
interlineado 1,5; se admiten Legal y A4 y la alternativa Geist. No se anteponen
cabeceras institucionales, títulos o bloques de firmas ajenos al documento.

Se leyeron `pagination.ts`, `page.ts`, `sanitize.ts`, `types.ts` y los estilos del
front. La altura de cada bloque se mide con las fuentes embebidas y el propio motor
de pdfmake, en una pasada sin saltos. La pasada final aplica:

- `unbreakable` a los bloques que caben en una página; los más altos continúan.
- Títulos unidos al inicio siguiente, con reserva de 36 pt, equivalentes a los
  48 px del planificador del front. Si el bloque siguiente pasa entero a otra
  página, el título lo acompaña.
- El párrafo de cierre y el bloque de firmas permanecen juntos cuando caben en
  una hoja, como exige también el planificador del editor.
- Los saltos explícitos actúan sobre el bloque siguiente. La primera fila de
  encabezado de una tabla se repite cuando la tabla continúa.
- Numeración ordinal española hasta QUINCUAGÉSIMA, decimal después de cincuenta,
  con contadores independientes por nivel. El número no se persiste en el texto.

pdfmake multiplica el interlineado por las métricas de la fuente. Para reproducir
la altura CSS, el adaptador divide por 1,371 en Source Serif y 1,300 en Geist.
También adapta los tamaños relativos de los títulos, tablas y firmas. El título
de nivel tres conserva las mayúsculas y el espaciado del front.

Las bandas tienen tres posiciones, texto, logo institucional y números de página,
con `skipFirstPage`. Se centran verticalmente dentro del margen y usan Geist,
como la hoja del front. El logo predeterminado mide 14 mm. Los números consideran
el total real de páginas del PDF, incluida la constancia cuando existe.

El adaptador bajo nivel `richDocPdf()` conserva su modalidad anterior si se invoca
sin `matchEditor`. Las rutas HTTP pasan siempre por `documentPdf()`, que activa
la maqueta del editor para todos los formatos, incluidos plain y rich-v1.
El generador genérico `makePdf()` mantiene sus valores anteriores para las
exportaciones de reportes de T16. La configuración premium se pasa explícitamente
desde el motor documental, evitando alterar esas exportaciones indirectamente.

## Fuentes

Se incluyen ocho TTF estáticos: regular, itálica, negrita y negrita-itálica de
Source Serif 4 y Geist, junto con las dos licencias OFL. Proceden de los mismos
paquetes Fontsource ya instalados y fijados en el lockfile del front. No se
añadieron dependencias de ejecución ni se descargan recursos al generar PDF.

`api/assets/fonts/PREMIUM-FONTS.md` documenta el origen y las métricas.
`build-premium-fonts.py` reproduce la conversión desde los WOFF2 locales.
La distribución incluida es el subconjunto latino, con los caracteres españoles;
no amplía la cobertura a alfabetos ausentes de ese subconjunto.

## Firmas y constancia

Las casillas se recorren en orden documental y los firmantes se ordenan por
`signingOrder`. Se respetan etiquetas, `showName` y `showId`. Sobran casillas:
se conservan sus placeholders; faltan casillas: se añaden al último bloque. Si no
hay bloque, se añade uno de dos columnas al final, sin modificar el JSON persistido.

Plantillas y preview muestran `[Firmante n]` y `C.I. [cédula]`. Los contratos
utilizan los datos reales. Cada imagen se obtiene mediante `storage.get()`, que
descifra en memoria, y se coloca en el área reservada sobre su línea. El área
de la imagen conserva su altura aunque cambie la proporción del PNG. Las fechas
usan `America/Santo_Domingo`.

El guardado final, la ruta de almacenamiento, el hash de los bytes y el sello
detached de T10 mantienen sus garantías. Repetir el guardado conserva los mismos
bytes. La constancia mantiene su contenido, QR, máscaras y tipografía Roboto,
en el papel del documento.

## Contrato HTTP

Todas las rutas llevan el prefijo `/api/v1`.

| Operación | Contrato |
| --- | --- |
| `GET /templates/capabilities` | Solo admin, supervisor y gestor. Devuelve `formats: ["plain","rich-v1","rich-v2"]`, `paperSizes: ["letter","legal","a4"]`, `fonts: ["serif","sans"]`, `previewPdf: true`. |
| `POST /templates/preview-pdf` | Mismos roles que el preview existente. Acepta `{ contentFormat?, content, title }`; formato omitido = plain. Devuelve `application/pdf` y `Cache-Control: no-store`. |
| Variables del preview PDF | Se sustituyen por `[Etiqueta]` sin pasar esas etiquetas por los formateadores de fecha/moneda. Variables desconocidas: 400. El gestor solo usa variables disponibles en plantillas activas. |
| Límites del preview PDF | Cuerpo máximo de 600 KiB; presupuesto rich de 500 KiB y límites estructurales de T13; 20 peticiones/minuto por usuario autenticado. |
| Catálogo y contratos | Aceptan y devuelven `rich-v2` como objeto, conservando la forma HTTP de T13. |
| `GET /contracts/:id/pdf` | Conserva permisos y descarga del PDF final persistido. Antes del final, genera con la nueva maqueta. |

La ruta nueva valida HTTP y delega al servicio. La resolución compartida de
variables se extrajo a `catalog-variables.ts`, conservando la exportación anterior.

## Revisión visual

Se generaron y renderizaron con PyMuPDF los siguientes documentos sintéticos:

- `api/tmp/t15-letter-serif.pdf`: tres páginas Carta con Source Serif 4.
- `api/tmp/t15-a4-sans.pdf`: tres páginas A4 con Geist.

Ambos contienen las cuatro variantes tipográficas, cláusulas numeradas por nivel,
encabezado con logo y texto en tres posiciones, primera cabecera omitida, pie con
«Página X de 3», una tabla larga con encabezado repetido, salto explícito y seis
firmas repartidas en bloques de una, dos y tres columnas. Se usaron imágenes
artificiales de trazos, sin datos ni firmas reales.

Se inspeccionaron las seis páginas renderizadas: tildes y ñ legibles, columnas
alineadas, continuación de tabla visible, ninguna casilla dividida ni contenido
solapado. Los PNG están junto a cada PDF, con sufijos `-1`, `-2` y `-3`.
Estos artefactos son temporales e ignorados por git.

Reproducción desde Git Bash:

```sh
cd api
T15_PDF_REVIEW=true npm test -- --reporter=verbose t15-pdf
```

## Decisiones y límites

- Un bloque de firmas más alto que una hoja devuelve 400 con instrucciones para
  aumentar columnas o distribuir casillas. Una banda más alta que su margen
  devuelve 400 para ampliar el margen o reducir contenido. Se evita el recorte
  silencioso que pdfmake produciría en contenedores indivisibles demasiado altos.
  Esto también puede afectar a las casillas añadidas automáticamente si hay
  demasiados firmantes para la página configurada.
- No se compararon píxel a píxel capturas del navegador con PDF. La verificación
  cubre los valores compartidos, las reglas del planificador, las medidas reales
  de pdfmake, pruebas de layout y revisión visual de los PDF.
- No se incorporan PAdES, certificados nuevos ni cambios al modelo de firma de
  T10. No se corrige H17 del catálogo ni otros hallazgos de auditoría ajenos a T15.
- `npm audit` no pudo consultar el registro por `unable to verify the first
  certificate`, también con `NODE_OPTIONS=--use-system-ca`. No se desactivó TLS
  para la auditoría y no se afirma ausencia de vulnerabilidades.

## Verificación final

| Comprobación en `api/`, desde Git Bash | Resultado |
| --- | --- |
| `npm run typecheck` | Correcto. |
| `npm run format:check` | Correcto, global. |
| `npm run build` | Correcto. |
| `npm test -- --reporter=verbose` | 563 aprobadas, 8 fallidas, 67 omitidas; 51 archivos, 23 fallidos y 28 correctos; salida 1. |
| Última repetición `npm test -- --reporter=verbose t15` | 39 aprobadas; cuatro HTTP omitidas por fallo de conexión en `beforeAll`; salida 1. |
| HTTP de T15 dentro de la corrida completa | 4/4 aprobadas, con login HTTP real, permisos, límites, persistencia, firma y sello. |
| HTTP de T13 dentro de la corrida completa | 6/6 aprobadas, incluyendo evidencia, renovación y compatibilidad. |
| Última repetición de PDF/validación junto con PDF de T13 | 41/41 aprobadas; incluye las 39 propias y dos de compatibilidad. |
| `npm audit` | Bloqueado por el certificado TLS del registro; salida 1, también con certificados del sistema. |
| `git diff --check` en los archivos propios y compartidos pertinentes | Correcto. |
| Revisión visual | Dos PDF de tres páginas, seis páginas inspeccionadas. |

La corrida completa empezó a las 12:57:45 y duró 1625,76 segundos. Su registro
está en `api/tmp/t15-full-suite.log`. La repetición propia está en
`api/tmp/t15-final-own.log`; los registros de typecheck, formato, build y audit
también están en `api/tmp/t15-*.log`, ignorados por git.

### Fallos de la corrida global

Cinco expectativas fuera de T15 quedaron pendientes:

- `contracts.test.ts`, «supervisor nunca aprueba su propio contrato, ni con
  override»: esperaba 403 y obtuvo 200.
- `lifecycle.test.ts`, «dashboard tiene forma por rol, tendencias y aislamiento
  del gestor»: `Target cannot be null or undefined`.
- `lifecycle.test.ts`, exportaciones: esperaba el número `1250.25` y recibió el
  decimal exacto como string `"1250.25"`.
- `core.test.ts`, registro con rol adicional: esperaba 202 y obtuvo 400.
- `core.test.ts`, reenvío de confirmación: esperaba invalidar el enlace anterior
  con 400 y obtuvo 200.

Además, el caso de T16 «la bandeja vincula invitados históricos sin invertir
bloqueos frente a una acción» agotó sus 60 segundos. No se modificó esa prueba
ni su implementación.

Los otros dos fallos fueron casos nuevos de T15 añadidos mientras el proceso
global ya tenía cargada la implementación anterior: exigencia de `rich-v2` para
funciones nuevas y detección de bandas demasiado altas. Ambos pasan en la
repetición final en un proceso nuevo, junto con las otras 37 pruebas unitarias
propias. No se ocultaron ni se retiraron esas pruebas.

### Caída del túnel de pruebas

Diecisiete suites fallaron al preparar la BD, con `ECONNRESET` o `ECONNREFUSED`
hacia el túnel local `127.0.0.1:55432`. La repetición propia posterior encuentra
el mismo error al ejecutar `CREATE SCHEMA IF NOT EXISTS "drizzle"`; las pruebas
HTTP no llegan a ejecutarse. No se cambió de base ni se alteró la conexión para
sortear el problema.

En la comprobación final, el puerto local acepta TCP, pero la sesión PostgreSQL
sigue terminando con `ECONNRESET`. Existe un proceso SSH; su inspección fue
denegada por el entorno y no se dispuso de un comando conocido para reconstruir
el túnel. Se solicitó al dueño que restableciera la conexión. No se cerraron
sesiones ajenas ni se reinició PostgreSQL.

Queda por repetir la integración y la suite completa con el túnel operativo,
el árbol compartido estabilizado y las expectativas ajenas revisadas por su
responsable. También queda repetir la auditoría npm cuando se resuelva la
confianza del certificado del registro.
