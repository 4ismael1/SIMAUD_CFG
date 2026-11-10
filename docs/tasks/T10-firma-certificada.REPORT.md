# T10 — Firma electrónica, evidencia y verificación

Fecha: 10 de noviembre de 2026, America/New_York.

## Resultado

Implementado el alcance de T10 y de su ADENDA. Se reutiliza el cifrado de T11; **no se creó FILE_ENCRYPTION_KEY**. Se añadió evidencia encadenada, auditoría encadenada con backfill, PDF final inmutable con constancia y QR, sello separado verificable, verificación pública, preferencia de firma escrita, conservación de firmas y las correcciones de almacenamiento indicadas en la adenda.

**El sello entregado es la alternativa detached permitida por la tarea. No incorpora PAdES ni constituye una firma digital cualificada/acreditada.** La API verifica la firma criptográfica del sistema; los lectores PDF no mostrarán una firma incrustada de Acrobat.

No se hizo git commit ni se imprimieron secretos. Se usó exactamente **simaud_test**, mediante la configuración por defecto y las guardas existentes. No se aplicaron migraciones a las bases de desarrollo o producción ni se generaron claves para un despliegue real. Las claves de pruebas fueron temporales.

Se conservaron los cambios concurrentes. No se editaron `modules/reports/**`, `modules/dashboard/**`, `contracts/admin-routes.ts`, `contracts/admin-actions.ts`, los filtros/handler de listado de contratos ni `test/t12a-*`. Tampoco se modificó el frontend. En el archivo compartido `contracts/routes.ts`, los cambios propios se limitan al borrado individual y a retirar su importación que quedó sin uso.

## Verificación ejecutada

| Comprobación en `api/` | Resultado |
| --- | --- |
| `npm run typecheck` — comprobación final | Correcto |
| `npm run format:check` — comprobación final | Correcto, global |
| `npm run build` — comprobación final | Correcto |
| `npm audit` — comprobación final | **0 vulnerabilidades** |
| Regresión final: seis archivos `t10-*`, `t11-storage.test.ts` y `database.test.ts` | **34/34 aprobadas**, ocho archivos, salida 0 |
| Pruebas propias de T10 incluidas en esa regresión | **20/20 aprobadas** |
| Repetición del caso de T12a `valida límites del lote` | **1/1 aprobada**; los otros doce casos se excluyeron mediante el filtro `-t` |
| `git diff --check` antes de escribir este informe | Correcto |
| PDF sintético final | Dos páginas renderizadas e inspeccionadas; tabla, QR, hashes, máscaras y fechas locales legibles |

**La corrida global no se presenta como una ejecución completamente verde.** `npm test -- --reporter=verbose` terminó con **487 aprobadas, 2 fallidas y 1 omitida**, en 33 archivos, durante 1249,44 segundos. Arrancó mientras ambas tareas todavía terminaban ajustes y registró:

- El caso propio de conservación tras reiniciar un firmante histórico: esperaba 409 y recibió 200. El marcador permanente `ever_signed` se había incorporado después de iniciar ese proceso. La repetición en un proceso nuevo, con el código estabilizado, pasó este caso y las otras 33 regresiones seleccionadas.
- El caso de validación de lote de `t12a-admin.test.ts:241`: esperaba 400 y recibió 200. No se editó ese archivo ni su implementación. Después de finalizar T12a, el mismo caso pasó al repetirlo en un proceso nuevo.

Una ejecución global anterior, con el reportero por defecto, se interrumpió al no ofrecer progreso visible durante varios minutos; no se contabiliza como completada. La repetición detallada confirmó que numerosos casos de integración tardan entre 30 y 40 segundos. **No se repitió otra vez toda la suite después de estabilizar ambos trabajos**; sí se repitieron las regresiones de T10/almacenamiento/BD y ambos casos que habían fallado. Los registros de estas ejecuciones están en `api/tmp/t10-full-test.log` y `api/tmp/t10-final-tests.log`, ignorados por git.

Se formatearon listas explícitas de archivos propios; no se ejecutó un formateo que escribiera sobre los archivos reservados a T12a.

## Migración y modelo

`api/drizzle/0010_t10_certified_signatures.sql`, registrada después de `0009_t11_storage`, añade:

- `users.signature_style`.
- `signature_evidence`, con secuencia y unicidad por firmante/versión.
- Cabeceras y contadores de evidencia y auditoría en contratos.
- Código público único, hash documental, fecha de activación, fecha de revocación y sobre del sello. El hash del PDF reutiliza la columna existente `signed_pdf_sha256`; la API pública lo denomina `finalPdfSha256`.
- `ever_signed`, rellenado desde firmantes históricos y archivos de firma. Un trigger lo mantiene en verdadero después de registrar una firma, aunque una versión posterior reinicie o retire al firmante.
- Campos de cadena en auditoría, su backfill y los triggers de encadenamiento y revocación.
- `storage_migration_failures`, que conserva por objeto la clave lógica y un motivo saneado. El inventario de pruebas pasa a 22 tablas.

La migración es SQL manuscrito, como las migraciones recientes del proyecto. No se generaron snapshots de Drizzle; sigue pendiente la reconciliación general de los snapshots anteriores a T09/T11 antes de usar generación automática indiscriminadamente. Se conservó el registro de migraciones existente.

Durante la iteración se sincronizaron los objetos de esta migración ya aplicada **solo en simaud_test**, sin borrar datos de otras bases. La aplicación desde cero y el backfill de auditoría se probaron en un esquema sintético dentro de una transacción que termina con rollback.

## Evidencia y canonicalización

Cada firma nueva guarda un payload `simaud-evidence-v1` con contrato y versión, firmante y usuario, nombre y rol, hash documental, hash y referencia del PNG saneado, fecha del servidor, IP, user-agent, visualización declarada, aceptación del servidor, declaración íntegra y versión, sesión, autenticación `password-session`, método y fuente.

El documento canónico decodifica las entidades del renderizador, convierte CRLF/CR en LF y elimina espacios y tabulaciones al final de cada línea. Se codifica en UTF-8. Conserva espacios iniciales, marcadores de formato y el salto final; no aplica normalización Unicode adicional. El hash corresponde a la versión persistida que se visualizó.

El JSON de evidencia ordena recursivamente las claves de objetos, conserva el orden de arrays y usa fechas ISO como strings. SHA-256 cubre todo el payload, incluido `previousEvidenceHash`. La secuencia, cabecera y contador se actualizan bajo el bloqueo del contrato y en la transacción de firma. El PNG se hashea **después** de la recodificación de T09b y **antes** de cifrarlo.

`verifyEvidenceChain` comprueba hashes, orden, enlaces, contador/cabecera, versión documental y bytes de las imágenes. Para la versión actual contrasta también los datos del firmante persistido. La evidencia histórica conserva identidad y ruta originales aunque se retire la fila del firmante al crear otra versión; por eso su identificador no tiene una FK destructiva hacia la lista actual. El contrato sí conserva una referencia restrictiva.

Editar un contrato devuelto crea otra versión y conserva las evidencias, imágenes y hashes de la anterior. Las referencias históricas también participan en la migración de almacenamiento. Registrar una firma intermedia conserva la fecha de frescura del documento, evitando exigir otra lectura de la misma versión al siguiente firmante.

La declaración exacta se publica en `GET /api/v1/signature-declaration`, con `{ version: 1, text }`, para que el frontend muestre el mismo texto que queda registrado. `viewedAt` sigue siendo una declaración del cliente sometida a las comprobaciones de frescura existentes; no es una medición independiente del tiempo de lectura.

## Cadena de auditoría

Un trigger encadena cada inserción de auditoría en PostgreSQL, toma el bloqueo del contrato y mantiene secuencia, cabecera y contador. Así también cubre las acciones del trabajo paralelo que usan la auditoría común.

`t10_audit_hash` usa la serialización estable de JSONB, normaliza la fecha a época y cubre acción, identidad, valores, origen, secuencia y enlace anterior. `chain_contract_id` conserva el vínculo original. La FK mutable `contract_id` se excluye del hash para permitir su `SET NULL` al eliminar un borrador; mientras el contrato existe, el verificador exige que ambas referencias coincidan.

`verifyAuditChain` detecta cambios, huecos, enlaces incorrectos y eliminación de la cola mediante el contador/cabecera. La firma del sistema ancla además el hash de auditoría presente al sellar. Los registros globales sin contrato tienen hash individual. La migración establece una línea base para registros antiguos; no demuestra retrospectivamente que esos registros nunca fueron alterados antes de T10.

## Sello y PDF final

Se usan las primitivas de [crypto de Node](https://nodejs.org/api/crypto.html), sin dependencias nuevas. El generador crea Ed25519 y X.509 autofirmado de staging con OpenSSL 3. La carga admite también ECDSA P-256 y comprueba correspondencia clave/certificado, algoritmo y vigencia al arrancar. Fuera de test, la API requiere material configurado; únicamente los tests pueden usar una clave efímera.

La firma cubre el JSON canónico UTF-8 `simaud-detached-v1`, que contiene el SHA-256 de los **bytes finales del PDF**, el hash documental, contrato/versión, código público, fecha de activación y cabeceras de evidencia/auditoría. Guarda firma, certificado público y su huella; nunca la clave privada. La verificación acepta solo el certificado configurado o certificados públicos archivados explícitamente en `SIGNING_TRUST_PATH`, no cualquier certificado que aparezca en BD.

La última firma genera una sola vez el PDF y el código aleatorio de 80 bits `SIM-XXXX-XXXX-XXXX-XXXX-XXXX`. El almacenamiento impide sobrescrituras. Repetir el guardado conserva los mismos bytes o falla si la integridad/versión no corresponde. La descarga usa el PDF persistido cuando ya existe uno final, incluso sin `final=true`.

La constancia incluye versión, hash, tabla de firmantes, cédulas e IP parcialmente ocultas, fecha/hora de Santo Domingo, método, evidencia abreviada, código y QR. El QR utiliza el [soporte incluido de pdfmake](https://pdfmake.github.io/docs/0.3/document-definition-object/qr/), sin recursos remotos. También se localizaron las fechas del bloque de firmas del documento.

Se evaluó la vía `@signpdf/signpdf`/`node-forge`; no están instaladas y no se añadió un CMS/ASN.1 artesanal sin soporte de interoperabilidad. Se eligió el mínimo detached expresamente permitido en T10. **PAdES incrustado queda como limitación técnica de esta entrega**, al igual que TSA, OCSP/CRL y acreditación INDOTEL. Cambiar a un certificado de una CA con Ed25519/P-256 no requiere cambiar el código de este sello separado.

Cancelar un contrato que tiene PDF final fija `revoked_at`. La revocación permanece aunque se restaure posteriormente su estado administrativo; no se vuelve a declarar válido un sello revocado de forma implícita.

## Contrato público de API

Todas las rutas siguientes llevan `/api/v1`. Los dos verificadores tienen límite de **10 peticiones/minuto por IP y ruta**, respuestas `no-store` y presupuestos en memoria por proceso.

| Ruta | Entrada / respuesta |
| --- | --- |
| `GET /verify/:code` | Código en mayúsculas. Desconocido o mal formado: `{ status: 'not_found' }` con HTTP 200. |
| Código encontrado | `status: 'valid' \| 'revoked' \| 'invalid'`, `title`, `code`, `activatedAt`, `revokedAt`, `signatoryCount`, `signatories: [{ name, signedAt }]`, `documentSha256`, `finalPdfSha256`, `auditChainValid`, `evidenceChainValid`, `systemSignatureValid`, `pdfIntegrityValid`. Los nombres se devuelven como iniciales enmascaradas. |
| `POST /verify/file` | Multipart con un único campo archivo `file`; MIME `application/pdf`, cabecera `%PDF-`, máximo 15 MiB. No persiste la carga. |
| Archivo sin coincidencia | `{ matches: false, status: 'not_found', systemSignatureValid: false }`. |
| Archivo coincidente | `{ matches: true, code, status, systemSignatureValid }`. `matches` indica igualdad de bytes; la UI debe considerar también el estado, en especial revocación o integridad inválida. |

El frontend debe tratar `invalid` como una comprobación de integridad fallida. Ninguna respuesta pública incluye documento, imagen, cédula, correo, IP, sesión, user-agent ni motivo detallado de cancelación.

## Firma escrita y borrado

`GET /me/signature-style` devuelve `{ text, fontId }` o 404. `PUT` valida y guarda únicamente la preferencia propia; `DELETE` la olvida de forma idempotente. El texto se recorta, exige 1–60 caracteres y letras, y admite marcas Unicode, espacios, punto, guion y apóstrofo. Las ocho fuentes están en una lista cerrada. Los cambios de preferencia quedan auditados sin copiar su texto a la auditoría.

La firma admite `method=typed|drawn|uploaded`; si falta, registra `unknown`. `typed` requiere una fuente válida; los otros métodos no admiten `fontId`. El multipart acepta cuatro campos y un PNG, cinco partes, conservando el límite de 500 KiB para la imagen. No se guardan imágenes como preferencias reutilizables.

La regla única de borrado es: admin o gestor propietario, estado `draft`/`rejected`, ninguna firma actual o histórica y ningún PDF/sello final. **No se exige `confirm`**, tampoco al administrador. `can.delete` aplica la misma regla. Un estado o evidencia que impida borrar produce 409 con el mensaje solicitado; un recurso fuera del alcance del actor sigue sin revelarse. El marcador histórico evita que reiniciar firmantes o cambiar de versión habilite después el borrado. La auditoría del borrador eliminado sobrevive con su hash y vínculo histórico.

## Almacenamiento y operación

- `db:encrypt-signatures` reutiliza AES-256-GCM, HKDF y `SIMAUDSIG1` de T11 sobre el driver activo. Verifica el hash en claro antes de sustituir, contrasta la evidencia cuando existe y autentica los objetos ya cifrados. En disco publica atómicamente; S3 exige ETag/`If-Match` y verifica lo publicado. Es idempotente y no recodifica imágenes históricas.
- La lectura de firmas en claro se rechaza fuera de test, salvo la ventana explícita `SIGNATURE_BACKFILL_PENDING=true`. El valor por defecto es `false`. La primera prueba del script sobre el storage de pruebas encontró un objeto cifrado no autenticable; la prueba quedó aislada con un driver temporal para no depender de artefactos previos. No se afirma haber limpiado todo el storage histórico.
- Cambiar endpoint, bucket o access key ID exige proporcionar el secreto; `PUT /system/storage` y `POST /system/storage/test` no reutilizan el anterior contra otra identidad/destino.
- Todos los fallos de objetos se guardan con motivos genéricos; el resumen expone los primeros veinte. Un trabajo fallido conserva `pending`, fija `migrating=false` y libera las escrituras del origen intacto. La reanudación vuelve a inventariar las referencias y limpia fallos resueltos.
- La prueba del proveedor incluye `immutability`: un segundo PUT debe producir conflicto. Un proveedor que sobrescribe silenciosamente no supera la prueba.
- Producción rechaza IP literales y DNS privados/loopback/link-local, incluidos IPv6 y direcciones mapeadas. Se valida antes de enviar peticiones firmadas. Se documentó el control de salida adicional necesario contra DNS rebinding entre resolución y conexión.
- El advisory lock de backup tiene `lock_timeout` de cinco segundos, devuelve 503 controlado y restaura el ajuste al devolver la conexión al pool.

Variables nuevas: `SIGNING_KEY_PATH`, `SIGNING_CERT_PATH`, `SIGNING_KEY_PASSPHRASE` opcional, `SIGNING_TRUST_PATH` opcional y `SIGNATURE_BACKFILL_PENDING`. Se añadieron los comandos `db:generate-signing-key` y `db:encrypt-signatures`, el override `deploy/signing.compose.yml`, configuración de ejemplo y exclusión de secretos locales de firma.

`docs/DEPLOY.md` describe el orden migración/backfill/arranque, el montaje de secretos, ACL/permisos, rotación del sello conservando certificados públicos y recifrado de firmas/configuración al rotar `SETTINGS_ENCRYPTION_KEY`. El backfill no es un rotador de claves. **Con S3 activo, la copia actual de BD y volumen local no incluye los PDF ni firmas del bucket**; se exige preparar versionado/replicación, copia independiente y restauración conjunta antes de producción.

## Límites pendientes de despliegue

No se inventaron sesiones, aceptaciones ni sellos para firmas históricas que nunca conservaron esa evidencia. Los PDF antiguos sin código público no se convierten automáticamente en documentos certificados. La cadena de hashes hace detectable la manipulación respecto de su línea base y del sello; no sustituye la custodia de claves, los respaldos ni la comprobación de identidad institucional.

No se probó un proveedor S3 real ni una restauración completa en Docker: las pruebas de S3 usan el protocolo firmado con un proveedor simulado, y la revisión PDF usó datos sintéticos. No se desplegó el sistema ni se modificó la interfaz. Antes de activar esta función fuera de test hay que provisionar clave/certificado y completar el mantenimiento descrito en DEPLOY. No quedan fallos reproducidos en las regresiones finales seleccionadas; queda documentada la ausencia de una última corrida global completa sobre el árbol ya estabilizado.
