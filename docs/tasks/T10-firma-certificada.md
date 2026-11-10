# T10 — Firma electrónica certificada, evidencia y verificación pública

**Asignado a:** Codex · **Revisa:** Claude · **Depende de:** T09a y T09b terminados (comparte contratos/PDF, `schema.ts`, `env.ts` y migraciones).
Alcance: `api/src/modules/contracts/**` (firmas, PDF, auditoría), `api/src/modules/verify/**` (nuevo), `api/src/lib/crypto/**` (nuevo), `api/src/lib/pdf*`, `api/src/db/schema.ts` + migración nueva, `api/src/config/env.ts`, `api/src/app.ts` (registrar rutas), `api/src/db/` (script de certificado), `api/test/**`, `deploy/**` y `docs/DEPLOY.md` (gestión de la clave), `docs/tasks/T10*`.
**No toques** `src/**` (el front lo hace Claude). Lee `docs/PRINCIPIOS.md` (obligatorio), `docs/CODE_STANDARDS.md`, `docs/tasks/T07-auditoria-seguridad.REPORT.md` y los informes T09a/T09b.
Marco legal de referencia: Ley 126-02 (RD) — firma electrónica con evidencia de identidad, integridad e intención. No afirmes en textos que es «firma digital cualificada» salvo que se use un certificado de una entidad acreditada (INDOTEL); usa «firma electrónica con sellado del sistema».

## 1. Evidencia por firma (no repudio)
En la transacción de firmar (ya existe), guardar en `contract_signatories` / tabla `signature_evidence`:
- `documentSha256`: SHA-256 del texto canónico de la versión exacta que se leyó (define la canonicalización: UTF-8, saltos `\n`, sin espacios finales) + `contractVersion`.
- `signatureImageSha256` de la imagen recodificada (tras T09b).
- `signedAt` del servidor (no del cliente), IP real (TRUST_PROXY), user agent, `viewedAt`, `acceptedDeclarationAt`, texto exacto de la declaración aceptada (o su hash + versión del texto), id de sesión (`sid`), método de autenticación.
- `evidenceHash` = SHA-256 de un JSON canónico (claves ordenadas) con todo lo anterior + `previousEvidenceHash` del firmante anterior del mismo contrato → **cadena de hashes** por contrato.
- Si el contrato cambia de versión después de alguna firma, las firmas previas quedan ligadas a su versión (ya es la regla; añade test).

## 2. Auditoría a prueba de manipulación
`contract_audit_logs` gana `entryHash` y `previousHash` (cadena por contrato, calculada en la misma transacción con bloqueo del contrato). Función `verifyAuditChain(contractId)` que recalcula y detecta huecos o alteraciones. Migración que calcule la cadena para los registros existentes. Permisos: las filas siguen sin poder editarse desde la API.

## 3. Sello del sistema y PDF firmado
- **Clave de firma del sistema**: par de claves (Ed25519 o ECDSA P-256) + certificado X.509 autofirmado de la institución para staging, generado con un script `src/db/generate-signing-key.ts` (o `openssl` documentado). Rutas por env: `SIGNING_KEY_PATH`, `SIGNING_CERT_PATH` (+ passphrase opcional `SIGNING_KEY_PASSPHRASE`). Nunca en la BD ni en git; montado como secreto en Docker. Preparado para sustituirlo por un certificado de una CA acreditada sin cambiar código.
- Al activarse el contrato (última firma) se genera el **PDF final** que incluye una **página de constancia**: datos del contrato, versión y `documentSha256`, tabla de firmantes (nombre, cédula enmascarada `***-***1234-5`, rol, fecha/hora con zona America/Santo_Domingo, IP enmascarada parcialmente, `evidenceHash` abreviado), **código de verificación** corto legible (p. ej. `SIM-7K4Q-9XW2`, aleatorio, único, guardado) y **código QR** a `APP_URL/verificar/<código>` (genera el QR sin dependencias nuevas si es posible; si hace falta una, elige una pequeña sin dependencias nativas, justifícala y avisa — Claude la instala, no tienes red).
- **Firma PDF incrustada (PAdES-B básica)**: firma del PDF final con la clave del sistema (si `pdfkit`/`pdfmake` no lo permiten, implementa la firma detached CMS/PKCS#7 sobre el `ByteRange` o usa una librería pura JS; evalúa `@signpdf/signpdf` + `node-forge` — indica cuál y por qué; Claude la instala). Si la incrustación resulta inviable sin dependencias nativas, como mínimo: guardar `finalPdfSha256` y una firma Ed25519 detached de ese hash (`systemSignature`), verificable por la API, y documentar la limitación.
- `finalPdfSha256` guardado; el PDF final es inmutable (si se regenera por error debe dar el mismo hash o fallar).

## 4. Verificación pública
- `GET /api/v1/verify/:code` (público, con rate limit estricto por IP): devuelve solo datos mínimos: estado (válido / revocado / no encontrado), título del contrato, código, fecha de activación, número de firmantes con nombre parcialmente oculto y fecha de cada firma, `documentSha256`, `finalPdfSha256`, resultado de `verifyAuditChain` y de la cadena de evidencias. Nunca el contenido del contrato, cédulas completas, correos ni IPs.
- `POST /api/v1/verify/file` (público, rate limit, límite de tamaño = PDF máx. 15 MB, solo `application/pdf` comprobado por magic bytes): calcula SHA-256 del PDF subido y responde si coincide con algún `finalPdfSha256` (y de qué código) y si la firma del sistema es válida. No guarda el archivo.
- Si un contrato se cancela/anula después de activo, la verificación muestra «revocado» con fecha (sin motivo detallado).

## 5. Firma escrita (tipográfica) y método de firma
El front ya ofrece tres formas de firmar: **escribir** el nombre con una fuente manuscrita (8 estilos autoalojados), **dibujar** o **subir** imagen. En los tres casos envía un PNG al mismo endpoint de firma.
- **Preferencia guardada (solo para la firma escrita; nunca se guardan imágenes dibujadas ni subidas)**: `GET /me/signature-style` → `{ text, fontId }` o 404 si no hay; `PUT /me/signature-style` `{ text, fontId }` → la guarda; `DELETE /me/signature-style`. Solo el propio usuario (autenticado). Validación: `text` recortado 1–60 caracteres, letras (con tildes/ñ), espacios, punto, guion y apóstrofo; `fontId` ∈ lista cerrada: `herr-von-muellerhoff`, `great-vibes`, `mr-dafoe`, `alex-brush`, `allura`, `la-belle-aurore`, `sacramento`, `homemade-apple`. Columna `signature_style jsonb` en users o tabla propia (migración).
- **Método en la evidencia**: el endpoint de firma acepta campos opcionales `method` (`typed` | `drawn` | `uploaded`) y `fontId` (solo con `typed`, misma lista). Se guardan en la evidencia de la firma (sección 1) y entran en `evidenceHash`; la página de constancia del PDF muestra el método («Firma escrita», «Firma manuscrita digital», «Imagen aportada»). Si no se envían, `method` = `unknown` (compatibilidad). **Ojo**: hoy el parser multipart limita `fields: 2, parts: 3`; amplíalo (4 campos, 5 partes) o el front no podrá enviar los campos nuevos.
- Tests: validación, aislamiento entre usuarios, 404 sin preferencia, método registrado en la evidencia.

## 6. Conservación: lo firmado no se borra (docs/PRINCIPIOS.md §1 y §6)
Hoy un administrador puede borrar físicamente cualquier contrato, incluso activo y firmado (`permissions().delete` y `DELETE /contracts/:id`). Corrígelo:
- `delete` solo permitido si el contrato está en `draft` o `rejected` **y** no tiene ninguna firma registrada **y** nunca tuvo PDF final. Admin incluido. En cualquier otro estado → 409 con mensaje «Un contrato firmado o en proceso no se puede eliminar: cancélalo o archívalo.». Mantén la confirmación por código para el admin.
- Los archivos de firma de contratos firmados nunca pasan a la papelera ni se purgan; la papelera de 8 días solo aplica a borradores/devueltos y avatares.
- El borrado de un borrador deja una entrada de auditoría que sobrevive (ya ocurre con `set null`; añade test).
- Tests: admin no puede borrar contrato `active`/`pending_signatures`/`cancelled` con firmas; sí un `draft` sin firmas.

## 7. Cifrado de firmas en reposo (docs/PRINCIPIOS.md §5)
- Las imágenes de firma se guardan cifradas con AES-256-GCM (nonce aleatorio por archivo, tag de 16 bytes, formato con versión) usando una clave `FILE_ENCRYPTION_KEY` (32 bytes hex, env, obligatoria fuera de test; documenta su generación y que debe guardarse fuera de la BD y de las copias). Se descifran solo al servir `GET /files/signatures/:id` (con permiso) y al generar el PDF.
- El hash de evidencia (`signatureImageSha256`) se calcula sobre el PNG en claro saneado.
- Migración/script idempotente que cifre las firmas ya existentes en disco (detecta si ya están cifradas por la cabecera). Documenta rotación de clave (re-cifrado con clave nueva).
- Tests: el archivo en disco no empieza por la firma PNG; con clave incorrecta falla de forma controlada; el endpoint devuelve el PNG original.

## 8. Tests
Cadena de evidencias y de auditoría (alterar una fila → `verifyAuditChain` falla), hash del documento estable ante saltos de línea Windows, verificación por código (válido, no encontrado, revocado), por archivo (PDF original coincide; PDF con un byte cambiado no), firma del sistema válida/ inválida, rate limit, ausencia de datos sensibles en respuestas públicas, sin clave configurada → error claro al arrancar en producción.
Verificación: `npm run format && npm run format:check && npm run typecheck && npm test && npm audit`.

## Informe
`docs/tasks/T10-firma-certificada.REPORT.md`: diseño criptográfico (qué se firma, con qué, cómo se verifica), canonicalización, dependencias propuestas, variables nuevas, cómo rotar la clave, contrato de API para la página `/verificar` del front, limitaciones legales/técnicas. No hagas git commit. No imprimas secretos.
