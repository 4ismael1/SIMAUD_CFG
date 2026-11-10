# T13 — Documentos con formato

Fecha de cierre, 10 de noviembre de 2026.

## Resultado

Implementado `rich-v1` en catálogo, preview, contratos, versiones, renovaciones, PDF, constancia, evidencia y verificación pública. La migración propia es `0011_t13_rich_documents.sql`. Las 61 pruebas de T13 pasan dentro de la última suite completa.

La entrega tiene dos expectativas heredadas pendientes de actualización y un bloqueo TLS en la última auditoría online de npm. Estos puntos impiden presentar todas las comprobaciones como verdes.

La configuración de conexión se tomó del entorno existente. Todas las pruebas se ejecutaron desde `sh` de Git Bash contra **simaud_test2**, comprobada tanto por el nombre configurado como mediante conexión real. El trabajo queda en el árbol de trabajo, sin commit.

## Verificación final

| Comprobación en `api/` | Resultado |
| --- | --- |
| `npm run typecheck` | Correcto |
| `npm run format:check` | Correcto, todo `src` y `test` |
| `npm run build` | Correcto |
| Suite completa final, `npm test -- --reporter=verbose` | **571 aprobadas, 2 fallidas y 1 omitida**, 574 casos, 43 archivos, salida 1 |
| Archivos de T13 incluidos en esa suite | **61/61 aprobadas**, cuatro archivos |
| `git diff --check` | Correcto |
| Último `npm audit` | Bloqueado por `unable to verify the first certificate` al conectar con el registro de npm |
| Auditoría online anterior durante esta tarea | **0 vulnerabilidades** |

La suite final empezó a las 11:14:47, hora local, y duró 1902,95 segundos. El registro completo está en `api/tmp/t13-final-suite.log`, ignorado por git. Los casos propios se distribuyen en 52 de validación/renderizado/hash, 2 de PDF, 6 de HTTP/ciclo contractual y 1 de seed.

### Dos expectativas heredadas pendientes

- `api/test/contracts.test.ts:434` compara exactamente el preview antiguo con `{ html, missing }`. T13 exige añadir `contentFormat: 'plain'`, que es la única diferencia registrada en la comparación.
- `api/test/database.test.ts:21` espera 22 tablas. La migración concurrente `0012` de T12b incorpora `admin_audit_head` y `admin_audit_logs`, elevando el inventario a 24.

Ambos archivos están fuera del alcance autorizado de pruebas de T13, limitado a `api/test/t13-*.test.ts`. Se solicitó ampliar el alcance para ajustar únicamente esas expectativas. La autorización sigue pendiente al cerrar este informe.

La repetición de audit con certificados del sistema también falló. La última comprobación usó además `--fetch-retries=0 --fetch-timeout=30000` para acotar la espera. Queda pendiente resolver la confianza del certificado del registro y repetir la auditoría online.

### Incidencias de ejecución

Hubo corridas preliminares mientras el árbol compartido todavía cambiaba. Un proceso conservó una validación anterior en caché. Posteriormente, una suspensión/reanudación produjo un salto de unas nueve horas en el reloj y fallos de conexión y hooks.

El diagnóstico encontró una transacción ociosa de más de diez minutos que bloqueaba los `TRUNCATE` de nuevas corridas. Se terminaron cinco conexiones obsoletas exclusivamente en `simaud_test2`, restringidas al mismo usuario y a conexiones anteriores a la corrida afectada. Después se comprobó la adquisición de un bloqueo exclusivo de prueba y la ausencia de otras sesiones antes de reiniciar. Los resultados de la tabla corresponden a la ejecución completa posterior, sobre el código estabilizado.

## Modelo y archivos compartidos

La migración `0011` añade `content_format text not null default 'plain'` y su check de valores permitidos a `contract_templates`, `contracts` y `contract_versions`. PostgreSQL asigna `plain` a los registros existentes. Las columnas de contenido siguen siendo texto y almacenan la serialización canónica para `rich-v1`.

El contrato hereda el formato de su plantilla al crearse. Cada versión guarda el formato vigente y sus definiciones históricas de variables. La renovación usa el contenido, formato y definiciones del original, incluso cuando cambia el catálogo.

En `schema.ts` se incorporaron los tres campos y sus checks. En `_journal.json` se añadió la entrada 11 entre las entradas 10 y 12. Ambos archivos se releyeron inmediatamente antes de las escrituras propias. Las entradas concurrentes de T12b y su migración `0012` se conservaron. También se integraron los cambios concurrentes de auditoría del catálogo.

La migración sigue el patrón SQL manuscrito de T10. La generación automática de snapshots continúa sujeta a la reconciliación histórica indicada en ese informe.

## Contrato HTTP entregado

Todas las rutas siguientes llevan el prefijo `/api/v1`. Se mantienen los permisos del catálogo y de los recursos contractuales.

| Operación | Entrada y respuesta |
| --- | --- |
| `POST /templates` | `contentFormat` opcional, por defecto `plain`. `content` es string para `plain` y objeto documento para `rich-v1`. Devuelve el formato y el contenido con su representación HTTP correspondiente. |
| `PATCH /templates/:id` | Los campos omitidos conservan su valor. La conversión de `plain` a `rich-v1` requiere enviar el documento. La conversión inversa devuelve 400. |
| `GET /templates` y `GET /templates/:id` | Incluyen siempre `contentFormat`. El contenido rich se devuelve como objeto. Se conservan variables resueltas y contador de uso donde corresponden. |
| Duplicación y cambio de estado de plantilla | Conservan formato y representación del contenido. |
| `POST /templates/preview` con `plain` | `{ contentFormat: 'plain', html, missing }`. Se conserva también el preview de string vacío. |
| `POST /templates/preview` con `rich-v1` | `{ contentFormat: 'rich-v1', document, missing }`. Se aplican las comprobaciones actuales de variables y acceso del gestor. |
| Creación y edición de contrato | El contenido procede de la plantilla o del `content` propio opcional, validado según el formato aplicable. Las variables desconocidas y requeridas siguen sus comprobaciones actuales. |
| Detalle de contrato | Incluye `contentFormat`. Con rich, `content` y `generatedContent` son objetos, conservando `null` cuando corresponde. |
| Lista y detalle de versiones | Incluyen formato propio y contenido rich como objetos. La versión incluida en aprobaciones usa la misma representación. |
| PDF y verificación | Conservan sus rutas actuales y usan el renderizador y hash correspondientes al formato persistido. |

La edición que cambia de plantilla adopta su formato. Como decisión conservadora, el bloqueo de conversión `rich-v1` a `plain` también se aplica al cambiar la plantilla de un contrato rich. Cada edición permitida sigue creando otra versión.

Los rechazos estructurales usan 400 `VALIDATION_ERROR`, con la ruta del nodo en `error.details[].field`.

## Validación y serialización

El módulo nuevo `api/src/lib/rich-doc/` separa tipos, esquema, cuadrícula de tablas, renderizado, adaptación de contenido y PDF.

- Zod valida objetos estrictos, tipos de nodo, padres e hijos permitidos, marcas y atributos. Se rechazan atributos desconocidos, enlaces, HTML estructural y tipos inventados. El texto que contiene caracteres como `<` o `&` sigue siendo texto literal.
- Se admiten entre 1 y 2000 bloques directamente bajo `doc`, conforme a `RICH_DOC_FORMAT.md`. Se comprueban 500 KB serializados en UTF-8, profundidad de nodos máxima de 12 contando `doc` como nivel 1, 5000 variables y 20000 caracteres por nodo de texto.
- Las tablas validan 1–200 filas, 1–12 columnas, rangos enteros, cobertura completa, solapamientos y límites de spans. `colwidth` debe tener una entrada por columna cubierta por la celda. Las filas totalmente cubiertas por `rowspan` conservan su array vacío y sobreviven a sucesivas canonicalizaciones.
- Se validan todos los valores predeterminados y nulos admitidos antes de normalizarlos. `borderless: false` se acepta como valor predeterminado del editor y se omite al canonicalizar.
- La serialización fija el orden de claves descrito por el formato, elimina atributos predeterminados/nulos y espacios de serialización, y conserva el texto y el orden de arrays. Los arrays obligatorios vacíos se conservan.

Las pruebas incluyen los límites de tabla de 200 filas por 12 columnas, round-trip de canonicalización, documentos gigantes y ataques mediante `href`, `style`, `class`, `onclick`, `src` y nodos o marcas ajenos a la lista blanca.

## Variables y evidencia

`formatVariable` concentra las reglas existentes de formato de fechas, importes, números y opciones. Los renderizadores plain y rich utilizan esa misma función. La extracción rich recorre nodos y conserva el orden de primera aparición. `{{variable}}` dentro de texto es literal.

Resolver un nodo variable produce texto con sus marcas originales. Los valores ausentes conservan el nodo y aparecen una sola vez en `missing`. `richDocText` extrae texto plano con separadores entre bloques, filas y celdas. La búsqueda contractual actual consulta metadatos y participantes.

El hash documental rich es SHA-256 sobre los bytes UTF-8 de la **serialización canónica de `generated_content`**, usando el contenido original como fallback cuando falta el generado. El orden original de las claves del JSON resulta irrelevante. Cambiar una marca o atributo significativo cambia el hash. El texto rich conserva espacios, saltos y caracteres Unicode.

El formato plain conserva la canonicalización de T10, incluidas la decodificación de entidades, normalización de saltos y retirada de espacios finales de línea. Se verifican ambos comportamientos mediante pruebas. Evidencia actual, evidencia histórica, constancia, sello y verificación pública eligen la regla por el formato de su registro. Un documento rich persistido malformado falla la verificación de integridad.

## PDF y revisión visual

El adaptador usa las fuentes y márgenes actuales de `makePdf`. Mapea alineaciones, títulos de 18/14/12 puntos, listas anidadas con inicio numerado, citas con sangría y borde izquierdo, línea horizontal, salto real de página y todas las marcas. Los encabezados de tabla heredan negrita y fondo gris. Las tablas generan placeholders para spans, columnas `'*'` iguales y `noBorders` cuando corresponde. Los anchos `colwidth` se validan y conservan en el documento. El PDF aplica las columnas iguales exigidas por el contrato.

Se revisaron visualmente las dos páginas de `api/tmp/t13-synthetic.pdf`, renderizadas con PyMuPDF al faltar Poppler en el entorno. La primera contiene los tres títulos, las siete marcas, espacios iniciales, salto de línea, variable pendiente, alineaciones, tres niveles de listas, cita, línea y una tabla con `colSpan` y `rowSpan`. La segunda empieza después del salto explícito y contiene las dos columnas del bloque de firmas sin bordes.

Se corrigió durante la revisión la herencia de negrita en títulos y encabezados. Las imágenes finales muestran texto legible, encabezados correctos, celdas alineadas y numeración de páginas. Los PNG de revisión están en `api/tmp/t13-synthetic-1.png` y `api/tmp/t13-synthetic-2.png`.

## Seed y reproducción

El seed incorpora idempotentemente la plantilla `00000000-0000-4000-8000-000000000013`, con título, lista, tabla, bloque de firmas y variables `cliente_nombre` y `valor_contrato`. La prueba conserva la plantilla anterior y las ocho versiones plain de ejemplo.

Desde Git Bash, con el entorno de pruebas existente, se pueden ejecutar las comprobaciones siguientes.

```sh
cd api
npm run typecheck
npm run format:check
npm run build
npm test -- --reporter=verbose t13
npm test -- --reporter=verbose
npm audit --logs-max=0
```

El PDF sintético se reproduce con el comando siguiente.

```sh
T13_PDF_REVIEW=true npx vitest run test/t13-pdf.test.ts
```

La entrega usa las dependencias existentes. Los pendientes de verificación son las dos expectativas heredadas fuera de alcance y la confianza TLS del registro de npm.
