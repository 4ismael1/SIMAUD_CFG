# T09b — Seguridad de contratos, firmas, archivos y copias

Fecha: 9 de noviembre de 2026, America/New_York.

## Resultado y alcance

Implementadas las correcciones H01, H03, H08, H09 y H12 en los archivos autorizados. **19 pruebas propias aprobadas.** `format:check`, `typecheck`, `build` y `npm audit` pasan; **la suite general todavía no está verde**: la ejecución completa terminó con 385 pruebas aprobadas y 35 fallidas, detalladas abajo.

Se leyeron primero `docs/CODE_STANDARDS.md`, la auditoría T07 y la tarea T09b. Se usó la configuración de pruebas por defecto, **simaud_test**, con las guardas existentes; no se cambió su URL. No se imprimió `api/.env`, no se enviaron correos reales y no se hizo ningún commit.

No se editaron auth, sesiones, SSE, notificaciones, correo, `config/env.ts`, `jobs/email-dispatch.ts`, `me/service.ts` ni los archivos de pruebas de T09a o anteriores. Los cambios concurrentes de otros trabajos se conservaron. La única actualización del registro de migraciones fue añadir la entrada de T09b después de la entrada existente de T09a. No se añadieron dependencias ni variables de entorno.

## H01 — Identidad de firmantes

- `contracts/identities.ts` concentra normalización y vinculación. La vinculación de invitados relee la cuenta de BD, exige correo confirmado, cuenta activa y no eliminada, y compara únicamente correo normalizado mediante `trim().toLowerCase()`. La cédula no participa en la concesión de acceso.
- Se bloquea la cuenta durante la vinculación para serializar accesos simultáneos. Un vínculo ocupado no se toma y no se asigna un segundo firmante del mismo contrato a la misma cuenta.
- `reconcileSignatories` autocompleta `userId` exclusivamente si correo **y** cédula coinciden con una cuenta confirmada y activa. Una coincidencia solo por cédula deja un invitado. Correo y cédula pertenecientes a dos cuentas distintas producen 400.
- La edición identifica el firmante anterior por correo normalizado, nunca por cédula; recalcula su vínculo y rechaza correos duplicados normalizados. Los vínculos se actualizan dentro de la transacción y bajo el índice único nuevo.
- No fue necesario cambiar el perfil: editar la cédula ya no puede producir un vínculo en ningún consumidor de `linkSignatories`.

### Revisión de vínculos existentes

La migración crea **`contract_signatory_binding_review`**, un informe persistente en BD con `signatory_id`, `contract_id`, `original_user_id`, `reason`, `original_signatory`, `detected_at` y `resolved_at`. No tiene cascadas que destruyan la evidencia al eliminar contratos.

Registra vínculos con correo distinto/no confirmado y todos los miembros de grupos duplicados `(contract_id, user_id)`. Conserva la fila íntegra original, incluidas las evidencias de firma, y pone su `user_id` actual en NULL para suspender el acceso inseguro. **No elimina firmantes, imágenes ni evidencias.** No elige arbitrariamente un ganador de un grupo duplicado.

Los firmantes con revisión pendiente quedan excluidos de la vinculación perezosa. La revisión administrativa debe comprobar la identidad y las evidencias antes de resolver o reconstruir el vínculo; cambiar solamente `resolved_at` habilita de nuevo el mecanismo de invitación por correo confirmado, no asigna una cuenta por sí mismo. El informe contiene datos personales y debe consultarse con acceso administrativo a BD.

Consulta de inventario sin extraer evidencias personales:

```sql
SELECT reason, count(*)
FROM contract_signatory_binding_review
WHERE resolved_at IS NULL
GROUP BY reason;
```

No se ejecutó esta revisión sobre una BD de producción. El comportamiento de migración se verificó con datos sintéticos en un esquema aislado de la BD de pruebas.

## H03 — Imágenes decodificadas antes de persistir

`lib/storage-png.ts` implementa validación de chunks y CRC, descompresión acotada con `zlib`, reconstrucción de filtros PNG y recodificación a PNG RGBA. Descarta metadatos y no conserva el archivo original como imagen de firma. No utiliza callbacks de decodificación que puedan lanzar errores fuera de la petición.

- Máximo 2000 × 1000 y dos millones de píxeles; la salida descomprimida tiene un límite calculado antes de inflar. Exige longitud exacta y filtros válidos.
- Admite PNG de **8 bits, sin entrelazado**, gris, RGB, indexado, gris con alfa y RGBA. Conserva transparencia, incluida `tRNS`. Otros formatos PNG se rechazan con 400, igual que CRC inválido, truncado, dimensiones excesivas o descompresión incompatible.
- Firma: validación y recodificación antes de abrir la transacción o escribir un archivo. Se conservan los límites multipart de 500 KiB.
- Avatar: mismo decodificador antes de escribir y límite multipart de 2 MiB. **Cambio de compatibilidad:** las nuevas cargas admiten solo PNG; JPEG/WebP se rechazan con 400, en vez de aceptar formatos sin un decodificador completo disponible. Los avatares históricos JPG/WebP siguen siendo servidos y pueden reemplazarse o eliminarse. No se añadieron dependencias ni se modificaron manifiestos fuera del alcance.
- Logo institucional: un hook de validación de archivos, registrado en el scope compartido de rutas desde `contracts/routes.ts`, valida y recodifica únicamente el logo de `PATCH /system/settings` antes de su persistencia. Esto mantiene intactos los archivos del módulo de sistema. También se valida al incorporar un logo histórico al PDF.
- Los nuevos PDF finales se escriben con `wx`; nunca sobrescriben un objeto existente. El rollback solo manda a papelera un PDF que esa operación realmente escribió.

Las pruebas verifican truncado, enorme, CRC inválido, filtro inválido, descompresión excesiva, transparencia y PNG válido; los rechazos no dejan filas, archivos ni firmas parciales. Dos firmas válidas generan un PDF final descargable. No se reescribieron imágenes históricas para preservar evidencias.

## H08 — Definiciones históricas de variables

- Cada versión guarda `snapshot.variableDefinitions`: array de `{ name, type, required, options }`.
- La creación y edición capturan definiciones bajo el mismo advisory lock 10404 que usa el catálogo; mantienen un orden de bloqueo consistente antes de leer/bloquear plantillas.
- La renovación obtiene las definiciones de la versión actual del original, valida/renderiza con ellas y las copia a la versión inicial del hijo. No vuelve a resolverlas contra el catálogo actual. La reapertura administrativa también conserva las definiciones del documento anterior.
- Si falta una definición histórica necesaria, se responde 409 con una petición explícita de revisión; no se inventa su tipo ni se sustituye silenciosamente por la definición actual.
- `variable-usage.ts` impide borrar variables referenciadas en las versiones de contratos no cancelados ni archivados, incluso después de retirarlas de las plantillas actuales. Devuelve 409 con explicación. Se conserva la protección previa de uso en plantillas.
- La migración rellena las versiones existentes desde el catálogo actual. Añade `variableDefinitionsSource: "migration_current_catalog"` y `missingVariableDefinitions` para hacer visible la procedencia y las definiciones ya desaparecidas. No es posible reconstruir tipos/opciones históricos que nunca se guardaron.

## H12 — Shapes nuevos para el frontend

Las tres listas seleccionan un DTO explícito de contrato en SQL; no cargan el documento completo para luego ocultarlo. El resumen común es:

```ts
type ContractListSummary = {
  id: string;
  code: string;
  title: string;
  status: ContractStatus;
  contractValue: string | null;
  currency: string;
  startDate: string | null;
  endDate: string | null;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  archived: boolean;
  creator: { id: string; name: string } | null;
  signatory: {
    id: string;
    name: string;
    role: SignatoryRole;
    signingOrder: number;
    status: SignatoryStatus;
    signedAt: string | null;
  } | null;
  myTurn: boolean;
  signatures: { signed: number; total: number };
};
```

No incluye `content`, `generatedContent`, `variablesData`, rutas o hashes de PDF, ruta de firma, IP, user-agent, correo/cédula del firmante ni marcas de aceptación. El documento y los permisos detallados se solicitan al abrir el detalle.

| Endpoint | Respuesta / cambio |
| --- | --- |
| `GET /me/signatures` | **Deja de devolver un array directo.** Devuelve `{ data: ContractListSummary[], meta: { page, pageSize, total } }`. |
| Query de firmas | `status=pending\|signed` (por defecto `pending`), `page=1`, `pageSize=20`, máximo 100. Orden estable por actualización descendente e id. El total corresponde al estado solicitado y se conserva incluso en páginas vacías. |
| `GET /renewals/eligible` | Array de `ContractListSummary`; conserva el ámbito y las reglas de elegibilidad. |
| `GET /renewals` | Conserva `{ data, meta }` y los campos existentes de solicitud de renovación. Cada `data[i].contract` pasa a `ContractListSummary`. Conserva `requester: { id, name, email } \| null`, `daysToExpiry`, `currentValue` y `variationPercent`. |

Claude debe ajustar `src/lib/api` y los consumidores: la bandeja ya no extiende `Contract`, usa `response.data`, y `signatory` es un resumen sin `userId` ni campos de archivo. No se modificó el frontend en esta tarea.

## H09 — Papelera y copias coherentes

- `lib/storage.ts` mueve los archivos eliminados a `.trash/AAAA-MM-DD/<subcarpeta>/<nombre>`, sin cambiar sus bytes. Valida que la ruta permanezca dentro de storage; tolera únicamente ENOENT en reintentos.
- Firmas eliminadas, PDF finales eliminados y avatares reemplazados/eliminados pasan por este mecanismo, incluidos los archivos descartados tras rollback.
- `cleanup` purga únicamente carpetas de fecha con **más de ocho días** y devuelve `trashDirectories` en su resultado. No modifica la lógica existente de limpieza de tokens/correo/notificaciones.
- Movimientos, purga y copia se excluyen mediante el advisory lock de sesión **10409**, compartido entre conexiones de la misma BD. `backup.sh` lo mantiene durante `pg_dump` y `tar`; `capture.sh` incluye `.trash`. Esto evita también la carrera de mover un archivo mientras tar ya ha pasado por una de sus carpetas.
- La retención semanal sigue siendo segura: cada juego contiene sus propios bytes, incluida la papelera necesaria en ese momento. La purga posterior del volumen vivo no cambia juegos publicados.
- `restore.sh` ejecuta `check-references.sh` después de restaurar BD y storage. Contrasta las referencias de `files`, avatares de usuarios, firmas y PDF finales; recupera desde papelera los objetos necesarios y lista faltantes/ubicaciones inválidas. Sale con error si quedan referencias sin resolver.
- Se actualizaron el Dockerfile de backup y únicamente las secciones de copias/restauración de `docs/DEPLOY.md`.

El script de captura propaga errores del comando externo a `psql` con `SHELL_ERROR` y `ON_ERROR_STOP`; el juego parcial no se publica. Se contrastó este mecanismo con la [documentación oficial de psql 17](https://www.postgresql.org/docs/17/app-psql.html#APP-PSQL-VARIABLES).

## Migración

**`api/drizzle/0008_t09b_contract_security.sql`**, registrada como idx 8 después de `0007_t09a_sessions_mail`; no hubo que renombrar por colisión.

Contiene la tabla de revisión, cuarentena de acceso sin borrar evidencias, índice único parcial `signatories_contract_user_unique` sobre `(contract_id, user_id)` para vínculos no nulos, y backfill de definiciones en el JSON de versiones.

No se modificó `api/src/db/schema.ts`, fuera del alcance y en uso por T09a. Los nuevos objetos SQL se usan desde consultas explícitas; deberán representarse en el modelo de Drizzle cuando se autorice actualizarlo, antes de generar otra migración automáticamente. No descartar la tabla de revisión ni el índice al reconciliar el esquema.

## Verificación y límites

Ejecutado desde `api/`, usando `npm.cmd` por la política PowerShell que impide ejecutar `npm.ps1`:

| Comprobación | Resultado |
| --- | --- |
| `npm run format` | Ejecutado; los últimos ajustes se formatearon apuntando a los archivos propios. |
| `npm run format:check` | OK, comprobación final de todo `src` y `test`. |
| `npm run typecheck` | OK. |
| `npm run build` | OK. |
| `npm audit` | OK, 0 vulnerabilidades. |
| `git diff --check` sobre los archivos de T09b | OK. |
| Cinco archivos de pruebas T09b | **19/19 OK**, ejecución conjunta final de 74,74 s. |
| `npm test` completo | **385 OK, 35 fallos**, 8 archivos fallidos / 13 aprobados; 420 casos recogidos en esa ejecución anterior a los últimos casos añadidos. No se presenta como aprobado. |

Pruebas propias: `t09b-identities.test.ts` (6), `t09b-images.test.ts` (5), `t09b-history-lists.test.ts` (3), `t09b-storage-migration.test.ts` (3), `t09b-backup.test.ts` (2), y su helper. Cubren también acceso HTTP denegado tras editar la cédula, concurrencia de vínculos, creación/edición HTTP de snapshots, renovación sin catálogo, paginación/aislamiento y ausencia de campos sensibles en las tres listas.

Fallos de la suite general observados durante la integración concurrente:

- `contracts.test.ts`: 13; sus JWT construidos directamente sin sesión reciben 401 antes de llegar a las reglas de contratos.
- `lifecycle.test.ts`: 11; numerosos accesos del mismo harness reciben 401 y afectan las expectativas posteriores.
- `core.test.ts`: 4, en registro/disponibilidad/refresh y avatar. El fixture de avatar y la comparación byte a byte deben adaptarse a la validación y recodificación.
- `admin.test.ts`: 2, por revocación de sesión y lectura del token antes almacenado en claro en outbox.
- `mail-outbox.test.ts`: 1; expectativa de correo pendiente no satisfecha con la lógica nueva.
- `contracts-unit.test.ts`: 1 y `mail.test.ts`: 2; configuración sin la nueva clave de correo y destino de la nueva plantilla `account_exists`.
- `database.test.ts`: 1; espera una lista cerrada de 18 tablas y debe incorporar `contract_signatory_binding_review`.

Además de esos fallos observados, las pruebas antiguas de bandeja necesitan pasar de `inbox[0]` a `inbox.data[0]` y dejar de esperar `signatory.userId`; los fixtures PNG deben tener CRC válido. No se relajaron las correcciones para satisfacer expectativas antiguas ni se editaron pruebas ajenas.

**Límite operacional de H09:** se verificaron sintaxis POSIX de los cuatro scripts, recuperación/listado de referencias con `psql` simulado y storage temporal, y exclusión real de conexiones mediante advisory lock en simaud_test. La migración se probó en un esquema sintético independiente. **No se ejecutó un ciclo real de pg_dump/tar/pg_restore en un servidor PostgreSQL aislado**: este entorno no dispone de Docker ni de esos binarios. No se hizo ninguna restauración sobre la BD compartida. Antes de dar por aceptada la recuperación de producción queda ensayar ese ciclo en un entorno aislado, incluyendo borrados/reemplazos concurrentes y comprobación de todas las referencias.

No se requieren variables nuevas para T09b. Las decisiones que requieren revisión son la compatibilidad de cargas de avatar solo PNG, el soporte PNG de 8 bits sin entrelazado, la revisión administrativa de vínculos puestos en cuarentena y la integración del esquema/pruebas anteriores con T09a.
