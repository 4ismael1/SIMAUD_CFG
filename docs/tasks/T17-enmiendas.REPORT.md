# T17 — Enmiendas y nueva firma antes de activar

Fecha: 10 de noviembre de 2026.

## Resultado y alcance

Implementados el contrato independiente de enmienda, su activación con sustitución del anterior y los dos reinicios de firmas previos a la activación. Se reutilizan la re-firma propia, la evidencia v2, `supersedesEvidenceHash` y los tipos públicos `amended`/`amendedBy` de T18. Se incorpora también la conservación histórica de aprobación de H01.

Se leyeron CODE_STANDARDS, PRINCIPIOS y los informes T10, T13, T14 —incluidos H01, H03, H04 y H05—, T15, T16 y T18. Los cambios de implementación y pruebas están exclusivamente en `api/`; este informe es la única entrega fuera de ese directorio. No se modificó `src/`, no se hizo commit, no se leyó `api/.env` ni se imprimieron secretos. `DATABASE_URL_TEST` se conserva tal como se heredó: PostgreSQL local, `simaud_test2`, `127.0.0.1:55433`. Los comandos npm y las pruebas se ejecutan mediante `C:/Program Files/Git/bin/bash.exe`, evitando la carga implícita de dotenv.

## Modelo, integridad y concurrencia

Migración SQL manuscrita nueva: `api/drizzle/0016_t17_amendments.sql`, registrada después de 0015. No se regeneran los snapshots históricos de Drizzle.

- Estado contractual nuevo `amended`. El original conserva contenido, versión, firmas, evidencia, PDF final, hash, sello y código público; cambia su vigencia y se enlaza con el sucesor mediante `amended_by_contract_id`.
- La enmienda guarda `amends_contract_id` —el contrato sustituido inmediatamente—, `amendment_root_id`, `amendment_number` y `amendment_reason`. Un contador transaccional en la raíz asigna E1, E2… sin reutilizar números tras cancelaciones o borrados permitidos de borradores. E2 sobre E1 mantiene el código base: `CT-2026-0005-E2`.
- Índices únicos para número por familia y para una sola enmienda abierta por familia. Se consideran abiertas `draft`, `rejected`, `pending_approval` y `pending_signatures`; archivar no libera la plaza.
- Se copian documento, formato, contenido generado, valores, moneda, fechas, notas, datos de cliente, configuración de renovación y firmantes en su orden. La versión inicial conserva las definiciones históricas de variables. No se heredan firmas, colocaciones, aprobación, evidencia, sello, PDF ni código público. Los vínculos de identidad se resuelven de nuevo con las reglas existentes de correo confirmado.
- La autoría histórica de la enmienda identifica a quien la solicitó; el responsable inicial es el del contrato origen. Se mantiene H02 de T16, incluida la autoaprobación administrativa auditada expresamente.
- La última firma activa la enmienda y sustituye al anterior en la misma transacción que evidencia, auditoría y PDF. Se rechaza activar una enmienda mediante override administrativo sin ese flujo.
- Los bloqueos de T16 incluyen recursivamente ancestros de renovación y de enmienda, ordenados por UUID antes de usuario/firmantes. Creación simultánea devuelve una sola enmienda y un conflicto; reinicio frente a última firma se serializa según quién obtiene primero el bloqueo.
- Una renovación pendiente o aprobada con hijo aún en curso impide crear enmienda. Una enmienda abierta impide pedir renovación y excluye al original de elegibles. Tras activarse, renovaciones y jobs de vencimiento siguen el contrato nuevo; `amended` queda fuera de los estados vigentes.

Crear, revisar, firmar y activar enmiendas deja eventos en ambos historiales. Los eventos reflejados contienen identificadores, estado y datos de la acción, sin copiar firmantes o evidencia técnica al enlace. Reinicios también se reflejan en el origen cuando ocurren sobre una enmienda. La auditoría utiliza el mecanismo transaccional y el encadenamiento común de T10/T12b.

`ever_approved` se rellena desde aprobación actual, aprobaciones históricas, estados/evidencia de firma y auditoría de aprobación. Los triggers conservan la marca de forma irreversible, la actualizan al aprobar y bloquean el borrado físico de esos contratos. `can.delete` y DELETE aplican la misma protección, incluso después de declinar sin firmar y editar a `draft`. Los borradores/devueltos que nunca fueron aprobados ni firmados conservan la política de borrado existente.

## Contrato HTTP exacto para el front

Todas las rutas llevan **`/api/v1`**. Las mutaciones requieren bearer y mantienen los controles existentes de sesión, correo confirmado, cambio obligatorio de contraseña y origen. UUID inválido, claves inesperadas o entradas fuera del esquema producen 400. Los errores conservan:

```ts
{ error: { code: string, message: string, details?: unknown } }
```

### Crear enmienda

**`POST /contracts/:id/amendments`**

JSON estricto, obligatorio:

```json
{ "reason": "Corregir la cláusula de pago" }
```

`reason` es string, se recorta y debe tener 1–500 caracteres después del recorte. No se aceptan campos de contrato en esta petición; las modificaciones se hacen luego con PATCH sobre el ID nuevo.

Solo admin o gestor responsable. El origen debe estar `active`, `expiring_soon` o `expired`, con PDF final y sello, sin revocación ni sustitución previa, y sin enmienda abierta o renovación en curso.

**201**, forma exacta:

```ts
{
  id: string,
  code: string,                // Ejemplo: CT-2026-0005-E1
  status: 'draft',
  amendsContractId: string,
  amendmentNumber: number
}
```

El front debe navegar al ID nuevo y usar el flujo existente: `PATCH /contracts/:nuevoId`, `POST /contracts/:nuevoId/submit`, aprobación y firmas en orden. Submit/approve siguen devolviendo el detalle existente. No hay una segunda API de edición o firma exclusiva de enmiendas.

Errores específicos:

| HTTP / code | Situación |
| --- | --- |
| 400 / `VALIDATION_ERROR` | Motivo ausente, vacío, excesivo, tipo inválido o claves extra. |
| 401 / `UNAUTHORIZED` | Sin sesión válida. |
| 403 / `FORBIDDEN` | El actor puede conocer el contrato pero no es admin ni gestor responsable. Supervisor tampoco crea enmiendas. |
| 404 / `NOT_FOUND` | Contrato inexistente o fuera del alcance del actor, con el mismo contrato de error. |
| 409 / `CONFLICT` | Estado incompatible, falta PDF/sello, revocación, sustitución previa, enmienda abierta, renovación en curso o falta de definiciones históricas de variables. |

Cancelar una enmienda usa **`POST /contracts/:nuevoId/cancel`**, con el cuerpo existente `{ reason: <categoría existente>, description: string }`, y devuelve 200 con el detalle. Se permite además en `draft`, `rejected` y `pending_approval` cuando es una enmienda; en aprobación pendiente se cierra esa solicitud. El original permanece como estaba. Cancelar después de activar no restaura automáticamente la vigencia del anterior. Los números cancelados no se reutilizan. La restauración administrativa de una enmienda pendiente de firmas, también mediante override, rechaza si hay otra enmienda abierta, una renovación en curso o si el original ya no admite sustitución. Los restantes límites de restauración existentes se mantienen.

### Pedir nueva firma individual

**`POST /contracts/:id/signatures/:signatoryId/reset`**

`id` y `signatoryId`: UUID. JSON estricto **`{ reason: string }`**, recortado, 1–500 caracteres.

Solo admin o gestor responsable, sobre firma ajena vigente en un contrato `pending_signatures` sin activación, PDF final, hash de PDF final ni sello. El firmante se identifica por su **ID de fila contractual**, no por el ID del usuario.

**200 exacto:**

```json
{ "message": "Nueva firma solicitada." }
```

Se añade evidencia `superseded`, se conservan los archivos y todas las filas anteriores, y ese firmante vuelve a `pending`. Las firmas posteriores permanecen intactas. Se notifica al afectado y al primer turno pendiente, evitando duplicar el aviso cuando coinciden. No se cambia contenido, versión, frescura documental ni aprobación.

### Reiniciar todas las firmas

**`POST /contracts/:id/signatures/reset`**

Mismo JSON y permisos. **200 exacto:**

```json
{ "message": "Firmas reiniciadas." }
```

Anula las firmas vigentes en una sola transacción y conserva el orden. Los firmantes vuelven a `pending`, se notifica al primer turno y no se reabre la aprobación.

El actor **no puede anular su propia firma por estas rutas**, aunque sea admin. El reinicio global también devuelve 403 si incluiría su firma vigente. Para rehacer su propia firma debe usar la re-firma de T18: `POST /contracts/:id/sign`, con el multipart existente, declaración aceptada de nuevo e identidad propia. Reiniciar a otro no permite firmar por él ni saltar el turno.

Errores comunes de ambos reinicios:

| HTTP / code | Situación |
| --- | --- |
| 400 / `VALIDATION_ERROR` | Motivo/UUID inválido, claves extra. |
| 401 / `UNAUTHORIZED` | Sin sesión válida. |
| 403 / `FORBIDDEN` | Rol sin administración de firmas sobre un recurso conocido, o intento de anular la firma propia. |
| 404 / `NOT_FOUND` | Contrato ajeno/inexistente; o firmante que no pertenece al contrato, una vez autorizado el actor. |
| 409 / `CONFLICT` | Estado incompatible, activación/PDF/hash/sello final, ninguna firma vigente que anular o firma sin evidencia verificable. Repetir el reinicio antes de que vuelva a firmarse devuelve 409 sin añadir eventos. |

Después de un éxito, volver a consultar el detalle y refrescar la bandeja. La primera firma pendiente vuelve a requerir turno; la re-firma propia de una firma que permanece vigente conserva la semántica de T18.

### Detalle, lista y capacidades

**`GET /contracts/:id`** añade a `can`:

```ts
{
  amend: boolean,
  resetSignature: boolean,   // Hay al menos una firma ajena anulable
  resetSignatures: boolean   // Hay firmas y el reinicio no incluye la propia
}
```

Cada elemento de `signatories` añade **`canResetSignature: boolean`**. `can.delete` ahora es false también si existe aprobación histórica. Los permisos son capacidades informativas; el servidor vuelve a comprobarlos bajo bloqueo al mutar.

Lista **`GET /contracts`**, cada `data[]`, y detalle conservan su forma y añaden **`amendmentChain`**:

```ts
Array<{
  id: string,
  code: string,
  status: ContractStatus,                 // Incluye 'amended'
  amendsContractId: string | null,
  amendmentRootId: string | null,
  amendedByContractId: string | null,
  amendmentNumber: number | null
}>
```

Orden: raíz y luego número ascendente. Incluye enmiendas canceladas conservadas; no incluye borradores eliminados según la política permitida. Un contrato sin enmiendas tiene una cadena de un elemento. El enlace solo contiene estos siete campos: ningún nombre, correo, cédula, imagen, IP o motivo adicional. Cada navegación a otro ID mantiene sus propios controles de acceso.

Los objetos contractuales decorados exponen además `amendsContractId`, `amendmentRootId`, `amendedByContractId`, `amendmentNumber` y `amendmentReason`, así como `everApproved: boolean` y `amendmentSequence: number` —contador interno informativo, no editable por HTTP—. En una raíz, origen, número y motivo son null; `amendedByContractId` identifica al sucesor si fue sustituida. El listado conserva su paginación `data/meta`; el detalle conserva los campos anteriores, formatos rich y capacidades de T18. Los listados y conteos que usan el enum contractual admiten también `amended`.

### Verificación pública del original

Se reutiliza **`GET /verify/:code`** de T18, sin cambiar sus límites, privacidad o cabeceras. Un original íntegro sustituido devuelve **200**, todos los campos registrados de T18, y:

```ts
{
  status: 'amended',
  amendedBy: {
    verificationCode: string,  // Código público actual de la enmienda inmediata
    title: string,
    code: string,              // Código contractual, por ejemplo CT-2026-0005-E1
    amendmentNumber: number | null
  }
}
```

El front puede mostrar **«Sustituido por la enmienda E1 (CT-2026-0005-E1)»** y enlazar `/verificar/<amendedBy.verificationCode>`. Una enmienda posterior se sigue desde la verificación del sucesor inmediato. El campo existente `code` del resultado público sigue siendo el código de verificación del **original**, no el número CT.

`amended` indica sustitución de vigencia; sus cuatro comprobaciones de integridad siguen siendo verdaderas si todo está intacto. Cancelación, revocación y fallo de integridad conservan la precedencia de T18. La copia oficial marcada del original sigue disponible si cumple las condiciones de T18; nunca se modifica el PDF persistido para añadir una marca de enmienda. `POST /verify/hash` devuelve `{ match, status: 'amended' }` para la huella correcta y `POST /verify/file` mantiene `{ matches, code, status, systemSignatureValid }`, también con `amended`.

## Evidencia y conservación

Cada anulación añade un payload v2 `event: 'superseded'`, enlazado por `supersedesEvidenceHash` a la última evidencia de ese firmante/versión. Conserva los datos originales de firma e incorpora motivo, actor, sesión, IP, user-agent y fecha de la anulación. No reescribe el payload anterior ni crea aceptaciones o firmas en nombre del afectado. Una evidencia v1 también puede recibir este sucesor v2 sin colocación histórica inventada.

El verificador distingue la última evidencia sustituida de una firma vigente, comprueba la fila sin firma vigente y continúa validando imágenes y hashes históricos. La cadena sigue siendo válida si el afectado declina después de la anulación. La nueva firma usa `event: 'resigned'` y enlaza al evento de anulación; los ajustes y re-firmas de T18 continúan funcionando. Un fallo intermedio del reinicio global revierte firmantes, evidencia, cabecera y auditoría.

No se añaden rutas públicas que expongan motivos o evidencia técnica, ni se amplían los DTO históricos generales para corregir de forma global H04. Las rutas nuevas aplican H05: 404 para recursos fuera de alcance, 403 para acciones prohibidas sobre recursos conocidos. No se añade una infraestructura paralela de auditoría o de firma.

## Verificación

Todas las comprobaciones finales se ejecutaron desde Git Bash, en un proceso nuevo y sobre el código cerrado:

| Comprobación en `api/` | Resultado |
| --- | --- |
| `npm run typecheck` | Correcto, salida 0. |
| `npm run format:check` | Correcto, global de `src` y `test`, salida 0. |
| `npm run build` | Correcto, salida 0. |
| `npm test -- --reporter=verbose` | **63/63 archivos aprobados; 714 pruebas aprobadas y una omitida; cero fallos; salida 0; 305,52 s.** |
| Pruebas propias T17 en esa suite | **17/17 aprobadas**, cinco archivos. |
| `git diff --check` | Correcto. |

La omisión corresponde a la comprobación de permisos POSIX de disco, exclusiva de Linux. No hay casos propios omitidos ni verificaciones obligatorias pendientes. No se añadieron dependencias ni se cambiaron umbrales de pruebas ni se retiraron regresiones existentes.

Una primera corrida completa aprobó 710 pruebas y omitió una, antes de añadir las últimas regresiones. La corrida intermedia registró 712 aprobadas, dos fallidas y una omitida: se añadieron los casos de declinación tras anular y restauración obsoleta mientras ese proceso aún conservaba los módulos anteriores. La repetición dirigida en un proceso nuevo aprobó los siete casos de evidencia/rich/migración, y la suite completa final de la tabla aprobó las 714 pruebas sobre el árbol estabilizado. La corrida intermedia no se presenta como validación final.

Logs ignorados por git: `api/tmp/t17-typecheck-final.log`, `t17-format-final.log`, `t17-build-final.log`, `t17-full-suite-final.log` y `t17-full-suite-intermediate.log`.

La cobertura propia incluye flujo completo con edición/aprobación/firmas, orden y copia rich-v2, verificación y bytes originales intactos, cadena E1/E2, cancelación, creación concurrente, permisos/opacidad/validación, exclusión mutua con renovación, jobs de vencimiento, aprobación histórica y backfill, reinicio individual/global, conservación de firmas posteriores, bloqueo de anulación propia, ambas carreras con última firma mediante barreras sin sleeps, compatibilidad v1/v2 y rollback del reinicio global.

Reproducción desde Git Bash con la variable de pruebas heredada:

```sh
cd api
export DOTENV_CONFIG_PATH="$PWD/tmp/t17-no-dotenv"
export NODE_ENV=test MAIL_DRIVER=log JOBS_ENABLED=false
export DATABASE_URL="${DATABASE_URL:-postgresql://unused:unused@localhost/simaud_unused}"
export JWT_ACCESS_SECRET="${JWT_ACCESS_SECRET:-t17-synthetic-test-key-at-least-32-characters}"
export APP_URL="${APP_URL:-http://localhost:5173}"
node -e 'const u = new URL(process.env.DATABASE_URL_TEST); if (u.pathname !== "/simaud_test2" || u.hostname !== "127.0.0.1" || u.port !== "55433") process.exit(1)'
npm run typecheck
npm run format:check
npm run build
npm test -- --reporter=verbose
```

No se asigna ni se imprime `DATABASE_URL_TEST`. Los valores alternativos son sintéticos y permiten arrancar las pruebas sin cargar dotenv. No se ejecutaron despliegues, migraciones contra bases de desarrollo/producción ni cambios de configuración del PostgreSQL local.
