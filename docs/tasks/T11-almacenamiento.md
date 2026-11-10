# T11 — Almacenamiento configurable: disco local o proveedor S3 (Cloudflare R2, AWS S3, Backblaze, DigitalOcean, MinIO…)

**Asignado a:** Codex · **Revisa:** Claude. Lee `docs/PRINCIPIOS.md` (obligatorio), `docs/CODE_STANDARDS.md`, `docs/tasks/T09b-seguridad-contratos.REPORT.md` (papelera, lock 10409, copias).
Alcance: `api/src/lib/storage*` (y una carpeta `api/src/lib/storage/` si la reorganizas), `api/src/modules/system/**`, los puntos que leen/escriben archivos (firmas, PDF final, avatares, exportaciones) **solo para pasar por la nueva interfaz**, `api/src/db/schema.ts` + migración nueva, `api/src/config/env.ts`, `api/test/t11-*.test.ts` (archivos propios), `docs/DEPLOY.md` (sección almacenamiento), `deploy/.env.prod.example`, `docs/tasks/T11*`.
**No toques** otros tests existentes (T09c los adapta en paralelo). Dependencia ya instalada por Claude: **`aws4fetch@1.0.20`** (firma SigV4 con `fetch`, sin SDK). No añadas otras.
Base de pruebas: la por defecto (`simaud_test`).

## 1. Interfaz única de almacenamiento
`StorageDriver { put(key, bytes, { contentType }), get(key) → Buffer, delete(key) → mueve a papelera, exists(key), list?(prefix) }`.
Claves lógicas (`signatures/<uuid>.png`, `avatars/…`, `pdf/…`) — nunca rutas del cliente; valida que no contengan `..` ni rutas absolutas.
Todo el código de negocio usa esta interfaz; ningún módulo llama a `fs` directamente para archivos de usuario.

## 2. Driver disco (por defecto) «bien asegurado»
- Directorio fuera de cualquier ruta servida, permisos `0700` para carpetas y `0600` para archivos (en Windows de desarrollo, ignora `chmod` sin fallar).
- Escritura atómica (archivo temporal + `rename`), `fsync` del archivo, nombres aleatorios, protección contra path traversal y symlinks (`lstat`, rechazar enlaces).
- Papelera y lock 10409 de T09b se conservan tal cual.

## 3. Driver S3 compatible
- Config: `endpoint` (https obligatorio salvo `localhost` en dev), `region` (R2 usa `auto`), `bucket`, `accessKeyId`, `secretAccessKey`, `prefix` opcional, `forcePathStyle` (MinIO). Presets en el informe: Cloudflare R2 (`https://<accountid>.r2.cloudflarestorage.com`, region `auto`), AWS S3, Backblaze B2 S3, DigitalOcean Spaces, MinIO.
- Operaciones con `aws4fetch` (`PUT`, `GET`, `HEAD`, `DELETE`/copia a prefijo `trash/AAAA-MM-DD/`). Objetos **privados** (nunca ACL pública; no URLs públicas). Timeouts y reintentos con backoff en 5xx/429; errores tipados y mensajes claros sin filtrar credenciales.
- La papelera en S3 es un prefijo; el job `cleanup` purga > 8 días también ahí.

## 4. Configuración desde la administración
- `GET /system/storage` (admin): driver activo y configuración **sin secretos** (`secretAccessKey` nunca se devuelve; solo `hasSecret: true` y los 4 últimos caracteres de la access key).
- `PUT /system/storage` (admin): `{ driver: 'disk' }` o `{ driver: 's3', endpoint, region, bucket, accessKeyId, secretAccessKey?, prefix?, forcePathStyle? }` (si `secretAccessKey` se omite, se conserva el guardado). **Antes de guardar ejecuta la prueba de conexión**; si falla, no cambia nada.
- `POST /system/storage/test` (admin): prueba sin guardar: escribe un objeto temporal, lo lee, compara bytes, lo borra; devuelve `{ ok, latencyMs, steps: [{ name, ok, message }] }` con mensajes útiles («Credenciales rechazadas», «Bucket no existe», «Sin permiso de escritura», «Endpoint inaccesible»).
- Las credenciales se guardan en la tabla `settings` **cifradas** con AES-256-GCM usando `SETTINGS_ENCRYPTION_KEY` (32 bytes hex, env, obligatoria fuera de test; documenta su generación). Nunca en logs ni en respuestas. Cada cambio queda auditado (quién, cuándo, de qué driver a cuál, sin secretos).
- Rate limit estricto en `test` (p. ej. 10/min por admin).

## 5. Cambio de proveedor sin perder archivos
- Al cambiar de driver, los archivos existentes siguen en el anterior. Implementa `POST /system/storage/migrate` (admin) como **job** con el advisory lock existente: copia todos los objetos referenciados en BD al driver nuevo, verifica tamaño/SHA-256 de cada uno, y solo entonces marca el driver nuevo como activo; informe de progreso en `GET /system/jobs` (copiados, verificados, fallidos). Idempotente y reanudable. No borra el origen (el admin decide después).
- Mientras migra, las lecturas usan el origen; las escrituras nuevas van a ambos o se bloquean con 503 claro (elige y justifica).

## 6. Tests (`t11-*.test.ts`)
Driver disco (atómico, traversal, symlink rechazado, permisos en Linux), driver S3 contra un servidor S3 **simulado** (fetch mockeado que valide firma/cabeceras básicas): put/get/delete/test con errores 403/404/5xx, secretos nunca devueltos ni registrados, configuración cifrada en BD, migración verificada y reanudable.
Verificación: `npm run format:check && npm run typecheck && npm test && npm audit` (los fallos antiguos que esté arreglando T09c pueden persistir: lístalos, no los toques).

## Informe
`docs/tasks/T11-almacenamiento.REPORT.md`: diseño, variables nuevas, contrato de API para la pantalla de Configuración que hará Claude (campos, presets, respuestas de `test`), migración, limitaciones. No hagas git commit. No imprimas secretos.
