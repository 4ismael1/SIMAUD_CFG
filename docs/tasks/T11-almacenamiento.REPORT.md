# T11 — Almacenamiento configurable

Fecha de implementación y verificación, 9 de noviembre de 2026, America/New_York.

## Resultado

Implementados los drivers de disco y S3 compatible, configuración administrativa cifrada, prueba de conexión, papelera remota y migración verificada y reanudable. La suite completa final aprobó **438 pruebas en 24 archivos**, con **una comprobación Linux omitida en Windows**. Las pruebas propias aprobaron **14 casos**, con esa misma omisión.

Se leyeron primero `docs/PRINCIPIOS.md`, `docs/CODE_STANDARDS.md`, la tarea y el informe T09b. Se utilizó la configuración de pruebas por defecto y se confirmó mediante `current_database()` que la BD era **simaud_test**. Las credenciales del entorno permanecieron fuera de la salida de herramientas y del informe. El trabajo se entregó sin commits.

## Alcance y autoría

- `api/src/lib/storage.ts` y los nuevos `storage-types.ts`, `storage-disk.ts`, `storage-s3.ts`, `storage-config.ts` y `storage-encryption.ts` concentran interfaz, coordinación, drivers y cifrado.
- `api/src/modules/system/**` incorpora configuración, inventario de referencias, jobs y rutas administrativas.
- Los cambios en `contracts/pdf.ts`, `contracts/signatures.ts`, `contracts/routes.ts` y `me/avatar.ts` pasan las operaciones de archivos por la interfaz y mantienen una reserva de escritura durante la transacción y su limpieza. La reserva comienza después de recibir y validar las imágenes.
- `api/src/db/schema.ts`, `api/drizzle/0009_t11_storage.sql` y su entrada idx 9 en el journal definen el checkpoint de migración.
- `api/src/config/env.ts`, la sección nueva de almacenamiento en `docs/DEPLOY.md` y `deploy/.env.prod.example` documentan y validan la clave nueva.
- Las escrituras propias dentro de `api/test` se limitan a `t11-disk.test.ts` y `t11-storage.test.ts`. Las adaptaciones de los demás tests pertenecen al trabajo paralelo T09c.

Los archivos nuevos usan el prefijo `storage-`. La regla existente `storage` de `api/.gitignore` también excluye una carpeta `api/src/lib/storage`, por lo que esta organización mantiene visibles los archivos de implementación.

Se reutilizó `aws4fetch@1.0.20`, ya instalada. El formato se aplicó mediante listas explícitas de archivos propios con `npx.cmd prettier --write`. Las comprobaciones globales de formato se ejecutaron con `format:check`.

## Diseño

`StorageDriver` proporciona `put`, `get`, `delete`, `exists`, `list` y `purge`. La fachada `storage` resuelve el proveedor activo desde BD. Los módulos de negocio consumen claves lógicas y buffers. Las llamadas a `node:fs` para archivos de usuario quedan en el driver local.

Se conservan los prefijos históricos `signatures/`, `avatars/` y `contracts/` para los PDF finales. Las referencias `files.kind = export` se resuelven bajo `exports/`. Las exportaciones HTTP actuales generan buffers en memoria. Las filas históricas mantienen sus nombres y rutas relativas originales.

Las claves rechazan rutas absolutas, barras invertidas, segmentos vacíos, caracteres de escape y cualquier aparición de `..`. El driver local comprueba con `lstat` los ancestros, carpetas y archivo final, y utiliza `O_NOFOLLOW` donde está disponible. Las carpetas reciben 0700 y los archivos 0600 en Linux. Windows omite chmod.

### Publicación atómica local

La tarea proponía temporal y `rename`. Se eligió **temporal aleatorio, fsync y publicación mediante enlace duro exclusivo**, seguida de eliminación del temporal. Esta decisión conserva la garantía de `wx` bajo concurrencia y protege los PDF finales existentes frente a sobrescrituras. Se sincroniza también la carpeta en Linux. El filesystem debe admitir enlaces duros. El traslado a papelera utiliza `rename`.

La papelera local conserva `.trash/AAAA-MM-DD/<clave>`. S3 copia a `trash/AAAA-MM-DD/<clave>` bajo el prefijo configurado, compara el contenido recuperado y después elimina el objeto activo. Los reintentos de borrado toleran objetos ya movidos. La purga mantiene la retención de más de ocho días y conserva nombres de fecha inválidos. El lock PostgreSQL **10409** sigue excluyendo movimientos, purga, publicación y backup.

### Transporte y cifrado

S3 usa SigV4 y `fetch`, con timeout de diez segundos por intento y hasta tres intentos por solicitud, con backoff de 100 y 200 ms ante 429, 5xx o fallos de transporte. Los redirects se rechazan. Un PUT ambiguo se concilia mediante un identificador aleatorio en metadata, HEAD y comparación de bytes, conservando la inmutabilidad de objetos de otras operaciones. Los mensajes de error se construyen localmente y descartan cuerpos y excepciones del proveedor.

Las peticiones usan credenciales en cabeceras y operaciones privadas. El bucket y el prefijo deben configurarse con acceso privado en el proveedor. El endpoint requiere HTTPS, con excepción de HTTP en localhost durante desarrollo y pruebas.

La fila `settings.storage` contiene un sobre AES-256-GCM versionado, con IV aleatorio y AAD ligado a esa configuración. Se cifra el estado completo, incluidas ambas claves, proveedor activo, destino pendiente y proveedores anteriores necesarios para limpiar su papelera. Las respuestas administrativas presentan únicamente `hasSecret` y `accessKeyLast4` como información de credenciales. `GET /system/settings` selecciona explícitamente sus ajustes públicos habituales.

Para cumplir los principios del proyecto, las firmas nuevas se cifran también en ambos drivers con AES-256-GCM y una subclave HKDF derivada de la clave de settings. La clave lógica participa como AAD. `get` devuelve los bytes originales y detecta alteraciones del sobre cifrado. Las evidencias históricas sin sobre siguen siendo legibles. La migración preserva los bytes lógicos de la firma y cifra su copia nueva.

## Variable nueva

| Variable                  | Requisito y generación                                                                                                                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SETTINGS_ENCRYPTION_KEY` | 32 bytes expresados mediante 64 caracteres hexadecimales. Obligatoria en desarrollo y producción. Generar con `openssl rand -hex 32` y conservarla en el gestor de secretos y en la recuperación protegida. |

En test se admite una clave fija de pruebas cuando falta la variable. El despliegue debe conservar la misma clave para recuperar settings y firmas nuevas. La rotación requiere recifrado y queda fuera de esta entrega.

## Contrato para la pantalla de Configuración

Todas las rutas siguientes llevan el prefijo `/api/v1` y autenticación de administrador.

### Lectura y guardado

`GET /system/storage` y `PUT /system/storage` devuelven esta estructura.

```ts
type PublicStorageConfig =
  | { driver: "disk" }
  | {
      driver: "s3";
      endpoint: string;
      region: string;
      bucket: string;
      prefix: string;
      forcePathStyle: boolean;
      hasSecret: boolean;
      accessKeyLast4: string;
    };

type StorageView = PublicStorageConfig & {
  pending: PublicStorageConfig | null;
  migrating: boolean;
};
```

El campo `driver` de nivel superior describe el activo. `pending` describe el destino que requiere migración. El cuerpo de PUT es uno de los siguientes.

```ts
type StorageInput =
  | { driver: "disk" }
  | {
      driver: "s3";
      endpoint: string;
      region: string;
      bucket: string;
      accessKeyId: string;
      secretAccessKey?: string;
      prefix?: string;
      forcePathStyle?: boolean;
    };
```

Los campos adicionales se rechazan. `prefix` tiene valor predeterminado vacío y `forcePathStyle` tiene valor predeterminado falso. El endpoint se normaliza a su origen. La pantalla debe solicitar la access key completa para editar S3 y omitir `secretAccessKey` para reutilizarla. La reutilización toma primero el secreto del destino S3 pendiente y, en su ausencia, el del activo. Un secreto enviado vacío se rechaza.

PUT prueba el destino antes de guardar. Un fallo del proveedor responde 503 con mensaje saneado. Con referencias existentes, un cambio de ubicación guarda `pending`. Cambiar credenciales sobre la misma ubicación puede activarse tras la prueba. PUT y test tienen límite de diez solicitudes por minuto por administrador. Los cambios dejan auditoría con actor, fecha, IP, user agent y drivers involucrados.

### Prueba de conexión

`POST /system/storage/test` recibe `StorageInput`. Devuelve HTTP 200 con el resultado de la prueba, incluyendo fallos del proveedor.

```json
{
  "ok": true,
  "latencyMs": 120,
  "steps": [
    { "name": "put", "ok": true, "message": "Objeto temporal escrito." },
    { "name": "get", "ok": true, "message": "Objeto temporal leído." },
    { "name": "compare", "ok": true, "message": "Contenido verificado." },
    {
      "name": "delete",
      "ok": true,
      "message": "Objeto temporal movido a papelera."
    }
  ]
}
```

Los pasos ejecutados aparecen en orden. Si falla la lectura o comparación, se intenta igualmente retirar el objeto escrito. Los mensajes distinguen credenciales rechazadas o permisos insuficientes, bucket u objeto ausente, endpoint inaccesible y diferencias de contenido. Los errores de entrada responden 400, las solicitudes concurrentes incompatibles responden 503 y el límite responde 429. La prueba utiliza bytes aleatorios y conserva la configuración guardada.

### Migración y progreso

`POST /system/storage/migrate` utiliza el destino pendiente y devuelve HTTP 202 con `{ "jobId": "<uuid>" }`. `GET /system/jobs` incluye siempre la entrada `storage-migrate`, con `lastRun` nulo si todavía falta una ejecución. Su summary contiene `total`, `copied`, `verified` y `failed`. `lastRun.ok` es null durante una ejecución, true al completar y false al fallar. `error` contiene un mensaje saneado.

La pantalla puede consultar periódicamente jobs y storage para mostrar progreso y el nuevo proveedor activo. Una llamada concurrente incompatible responde 503. Iniciar sin destino pendiente responde 409. Repetir migrate después de una interrupción reanuda el mismo job.

## Presets

Son valores iniciales para completar con el bucket y el par de credenciales institucional. `prefix` puede quedar vacío en un bucket dedicado.

| Proveedor           | Endpoint                                                                        | Región                                                                 | forcePathStyle | Referencia                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------- |
| Cloudflare R2       | `https://<accountid>.r2.cloudflarestorage.com`                                  | `auto`                                                                 | `true`         | [API S3 de R2](https://developers.cloudflare.com/r2/api/s3/api/)                                                  |
| AWS S3              | `https://s3.us-east-1.amazonaws.com`                                            | `us-east-1`, o la del bucket con su endpoint correspondiente           | `false`        | [Endpoints de S3](https://docs.aws.amazon.com/general/latest/gr/s3.html)                                          |
| Backblaze B2 S3     | `https://s3.us-west-004.backblazeb2.com`                                        | `us-west-004`, o la región real del bucket                             | `true`         | [Endpoints y estilos admitidos de B2](https://www.backblaze.com/docs/en/cloud-storage-call-the-s3-compatible-api) |
| DigitalOcean Spaces | `https://nyc3.digitaloceanspaces.com`                                           | `us-east-1` como valor inicial de firma del ejemplo JavaScript oficial | `false`        | [Configuración de clientes S3 para Spaces](https://docs.digitalocean.com/products/spaces/reference/aws-sdks/)     |
| MinIO               | `http://localhost:9000` en desarrollo, origen HTTPS institucional en producción | La configurada en MinIO, por ejemplo `us-east-1`                       | `true`         | [Endpoint S3 y puerto API de MinIO](https://docs.min.io/aistor/reference/aistor-server/http-endpoints/)           |

En Spaces el datacenter se determina mediante el endpoint. Los presets son configuraciones de partida verificadas contra documentación oficial. La compatibilidad operativa se comprobó con un servidor simulado.

## Migración, recuperación y concurrencia

El inventario une `files`, `users.avatar_path`, `contract_signatories.signature_path` y `contracts.signed_pdf_path`. Incluye referencias históricas que carecen de fila en `files`, deduplica claves y conserva tamaños y huellas conocidas. La migración comprueba tamaño y SHA-256 de origen y destino, y contrasta además los valores registrados en BD cuando existen.

Se eligió **bloquear escrituras con 503 durante la migración**. El lock 10411 protege la operación completa de archivos y su transacción frente al cambio de proveedor. Una cola local reserva capacidad del pool para la transacción y el lock de backup. El job mantiene 10411 exclusivo y 10409 durante su ejecución. Las lecturas continúan usando el origen.

La tabla `storage_migration_objects` guarda checkpoints por `(job_id, key)`, tamaño lógico, SHA-256 y copia registrada. Las copias existentes se releen y verifican al reanudar. El proveedor se activa junto con la auditoría y el resultado exitoso del job en una transacción, después de verificar todos los objetos. Los objetos originales quedan conservados. El cierre normal de la API espera a las migraciones activas.

Tras una caída o un job fallido, la bandera persistida mantiene el bloqueo de escrituras. El administrador puede reanudar con migrate o guardar otra configuración válida para descartar el intento pendiente. Los proveedores anteriores permanecen cifrados para que cleanup pueda purgar su papelera. Los objetos activos de esos proveedores quedan bajo decisión administrativa posterior.

## Verificación

| Comprobación final desde `api/`                                     | Resultado                                                             |
| ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `npm.cmd run format:check`                                          | OK                                                                    |
| `npm.cmd run typecheck`                                             | OK                                                                    |
| `npm.cmd run build`                                                 | OK                                                                    |
| `npm.cmd audit`                                                     | OK, cero vulnerabilidades                                             |
| `npx.cmd vitest run test/t11-disk.test.ts test/t11-storage.test.ts` | 14 aprobadas y una omitida, 55,26 s                                   |
| `npm.cmd test`, ejecución nueva con código estable                  | 24 archivos aprobados, 438 pruebas aprobadas y una omitida, 1064,76 s |
| `git diff --check` sobre archivos propios                           | OK                                                                    |

Las pruebas cubren publicación completa e inmutabilidad bajo concurrencia, traversal, symlinks, cifrado y alteración de firmas, lectura histórica, papelera, fechas inválidas, SigV4 y SHA de cuerpos, estilos de endpoint, errores 403/404/5xx/429, PUT aceptado con respuesta perdida, secretos en BD/respuestas/logs, conservación del secreto omitido, permisos administrativos, límite de intentos y migración de ida y vuelta con tamaño/SHA incorrectos y reanudación.

La primera suite se ejecutó durante ajustes concurrentes y terminó con 435 aprobadas, tres fallidas y una omitida. Había cargado la expectativa anterior de cuatro jobs de `lifecycle.test.ts`, el driver previo a la conciliación de PUT y la purga previa al filtro de fechas inválidas. La repetición limpia de T11 y la suite completa nueva resolvieron los tres casos. El test de lifecycle fue adaptado por T09c.

## Límites operativos y decisiones para revisión

- La comprobación de permisos 0700/0600 queda pendiente de ejecución en Linux. En Windows sí se comprobaron escrituras, inmutabilidad y rechazo de junctions. El caso de symlink de archivo requiere privilegios de Windows y se ejecuta en Linux.
- La validación S3 utiliza fetch simulado, con formato SigV4, cabeceras y huella de cuerpos comprobados. La aceptación con credenciales y políticas reales de cada proveedor requiere su prueba administrativa en el entorno de despliegue.
- Los scripts actuales de backup y restore capturan el volumen local. La sección de almacenamiento de DEPLOY describe la integración operativa necesaria para copiar y restaurar S3, sus prefijos anteriores y su papelera bajo el mismo lock 10409, con copia cifrada externa y prueba de recuperación. Esa integración y un ensayo real de restauración remota quedan pendientes para producción.
- La publicación mediante enlace duro exclusivo es la diferencia deliberada respecto al mecanismo temporal más rename propuesto en la tarea.
- El job corre dentro del proceso API y conserva su estado en BD. Un reinicio abrupto requiere repetir migrate. Las migraciones grandes ocupan los locks durante toda la copia y procesan cada archivo como Buffer.
- `copied` contabiliza escrituras nuevas registradas y `verified` incluye objetos que ya estaban en el destino. Un corte entre PUT y checkpoint puede dejar una copia que se verifique al reanudar sin incrementar el contador de escrituras registradas. La activación depende de la verificación íntegra.
- La recuperación requiere conservar la clave de cifrado. Los permisos de los proveedores anteriores deben permitir la limpieza de su papelera mientras sigan registrados.
