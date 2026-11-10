# T12b — Auditoría global y gestión de acceso de usuarios

Fecha: 10 de noviembre de 2026.

## Resultado

Implementados el registro administrativo persistente y encadenado, el feed unificado de solo lectura, las exportaciones CSV/XLSX y la gestión de invitaciones/restablecimientos. El administrador ya no puede elegir la contraseña de una cuenta al crearla ni al editarla. **22/22 pruebas propias aprobadas**, con las regresiones finales de almacenamiento, integración y permisos también aprobadas. La corrida global no queda completamente verde; se desglosa abajo.

Se leyeron CODE_STANDARDS, PRINCIPIOS y los informes T09a/T10. No se hizo git commit, no se leyó `api/.env` y no se cambió `DATABASE_URL_TEST`. Las migraciones se aplicaron mediante `prepareDatabase()` de los helpers existentes, exclusivamente en **simaud_test3**. No se imprimieron secretos.

## Persistencia, cadena e integridad

Migración manuscrita **`api/drizzle/0012_t12b_admin_audit.sql`**, registrada como entrada 12 después de la 0011 de T13. Añade `users.invited_at`, `admin_audit_logs` y `admin_audit_head`. No genera snapshots de Drizzle, siguiendo el patrón de las migraciones recientes y la limitación documentada en T10.

Cada entrada conserva fecha del servidor, identidad y nombre del actor, área, acción, tipo/identificador/etiqueta del destino, metadatos permitidos e IP. No tiene referencias destructivas a usuarios, plantillas o variables: el registro sobrevive al borrado del destino o del actor.

Un trigger toma el bloqueo de la cabecera global, asigna secuencia y `previous_hash`, calcula SHA-256 y actualiza la cabecera en la misma transacción. La normalización usa JSONB y época para la fecha, siguiendo el enfoque de T10. Otro trigger impide UPDATE/DELETE de entradas. La API solo publica consultas y exportaciones.

`verifyAdminAuditChain()` comprueba hashes, secuencias, enlaces y cabecera/contador, incluida la eliminación de la cola. Es una utilidad interna, no una nueva ruta pública. La cadena permite detectar modificaciones frente a su cabecera; no incorpora un nuevo sello criptográfico ni impide a un propietario de PostgreSQL desactivar triggers o reescribir toda la base.

La auditoría registra los nombres de los campos modificados; para roles y actividad también conserva sus valores operativos. No copia contraseñas, hashes de contraseña, tokens, correos, cédulas, teléfonos, documentos, opciones de variables, direcciones institucionales ni credenciales de almacenamiento a `details`. Nombre del actor y etiqueta del destino son los campos expresamente requeridos por la tarea. La IP se persiste como evidencia, pero no se devuelve en el feed ni en las exportaciones.

## Operaciones auditadas y atomicidad

- Usuarios: alta con invitación, edición de datos, cambio de rol, activación/desactivación, baja, envío de restablecimiento y reenvío de invitación. Un PATCH que cambia varias categorías produce una entrada por categoría relevante. Un cambio sin diferencias efectivas no inventa una modificación.
- Ajustes: la escritura de las claves y su auditoría comparten transacción; se registran nombres de claves, sin sus valores sensibles.
- Catálogo: creación/edición/borrado de variables y creación/edición/duplicado/cambio de estado/borrado de plantillas, también cuando el actor autorizado es supervisor.
- Almacenamiento: configuración, inicio/reanudación/activación y fallo de migración. La creación/reanudación del job de migración, el estado inicial y la auditoría comparten transacción; también el estado de fallo y su auditoría. Se copian únicamente driver, indicador de migración e identificador operativo. Se conserva además el historial operativo anterior de T11 en `contract_audit_logs`, saneado y en la misma transacción; el feed no lo duplica.
- Jobs manuales: la creación de `job_runs` y `job.started` es atómica. Si el lock impide iniciar el job, no se registra un inicio ficticio. La ejecución posterior conserva las transacciones y el registro de resultado propios de cada job; sus efectos externos, como entregar correo, no se envuelven en una transacción SQL global. Los jobs programados conservan su comportamiento anterior.

Las pruebas provocan un fallo real de inserción de auditoría y verifican rollback de cambios de usuario, correos, revocaciones de sesión, catálogo, ajustes e inicio de jobs.

## Contrato para el frontend

Todos los paths llevan `/api/v1` y requieren bearer vigente. Las rutas nuevas de auditoría y gestión de acceso exigen rol **admin**; usuarios sin sesión reciben 401 y los otros roles, 403.

### Feed

`GET /audit` devuelve:

```ts
{
  data: Array<{
    id: string;
    source: "contract" | "admin";
    at: string; // ISO, UTC
    area: "contracts" | "users" | "settings" | "templates" | "variables" | "storage" | "auth";
    action: string;
    actorId: string | null;
    actorName: string;
    targetType: string;
    targetId: string | null;
    targetLabel: string;
    contractId: string | null;
    contractCode: string | null;
    summary: string; // Frase en español, en pasado
  }>;
  meta: { page: number; pageSize: number; total: number };
}
```

Orden: fecha descendente, fuente e identificador como desempate estable. Datos y total se leen en una misma instantánea de BD. Usar `source + ":" + id` como clave de fila.

Filtros combinables:

| Parámetro | Contrato |
| --- | --- |
| `page`, `pageSize` | Página desde 1; tamaño 1–100, por defecto 20. |
| `from`, `to` | Fecha `YYYY-MM-DD` o fecha/hora ISO con offset. Los días completos se interpretan en **America/Santo_Domingo**; `to` incluye todo ese día. Las horas ISO son límites inclusivos. Rango invertido: 400. |
| `actorId`, `contractId` | UUID. `contractId` excluye entradas administrativas. |
| `area` | Uno de los valores indicados arriba. Los jobs manuales se agrupan en `settings`, con `targetType=job`. |
| `action` | Coincidencia exacta con el identificador persistido. |
| `q` | Búsqueda literal, sin distinguir mayúsculas, en código/título de contrato o etiqueta administrativa. `%` y `_` no actúan como comodines. |

Las entradas administrativas tienen `contractId` y `contractCode` nulos. El historial contractual reutiliza T10, incluidos borradores eliminados mediante `chain_contract_id`; código y título se recuperan de las instantáneas auditadas si ya no existe el contrato. No se exponen `details`, valores anteriores/nuevos, IP, user-agent, hashes ni evidencia documental. Respuesta `Cache-Control: private, no-store`.

Acciones administrativas emitidas:

| Área | Acciones |
| --- | --- |
| `users` | `user.created`, `user.updated`, `user.role_changed`, `user.activated`, `user.deactivated`, `user.deleted`, `user.password_reset`, `user.invite_resent` |
| `settings` | `settings.updated`, `job.started` |
| `variables` | `variable.created`, `variable.updated`, `variable.deleted` |
| `templates` | `template.created`, `template.updated`, `template.duplicated`, `template.status_changed`, `template.deleted` |
| `storage` | `storage:configure`, `storage:migrate`, `storage:resume`, `storage:activate`, `storage:failed` |

Las acciones contractuales conservan sus identificadores existentes. `summary` traduce las conocidas y ofrece una frase genérica en pasado para acciones futuras. `auth` se admite como área del modelo/filtro; esta tarea no añade auditoría de login/logout ni amplía el módulo de autenticación.

### Exportación

`GET /audit/export?format=csv|xlsx` admite los mismos filtros de contenido. Exporta todas las coincidencias, sin paginarlas, con las mismas columnas del feed y orden. Más de **10 000** coincidencias produce 400 y pide acotar los filtros; no se trunca silenciosamente.

CSV: UTF-8 con BOM, separador `;`, celdas entrecomilladas y neutralización de fórmulas. XLSX: hoja `Auditoría`, cabecera y fechas ISO como texto; los textos que empiezan por `=` se guardan como strings, sin fórmulas. Ambos formatos envían `Content-Disposition: attachment` y `private, no-store`.

### Usuarios y acceso

| Operación | Entrada / resultado |
| --- | --- |
| `POST /users` | Perfil, email y rol; **no acepta `password`**. Devuelve 201 `{ user }`, crea cuenta invitada y encola la invitación cifrada. |
| `PATCH /users/:id` | Conserva los campos permitidos anteriores. `password` y campos desconocidos se rechazan con 400. |
| `POST /users/:id/password-reset` | Sin contraseña ni email en el cuerpo. Encola enlace de restablecimiento al correo registrado, revoca inmediatamente todas sus sesiones y devuelve **202 `{ message: "Enlace de restablecimiento enviado." }`**. |
| `POST /users/:id/resend-invite` | Solo una cuenta invitada pendiente. Encola invitación nueva, invalida el enlace anterior, actualiza `invitedAt`, revoca sesiones y devuelve **202 `{ message: "Invitación enviada." }`**. Cuenta ya activada: **409**. |
| Ambos envíos | Usuario inexistente o dado de baja: 404. Cuenta desactivada: 409; hay que activarla antes. Presupuesto agotado: 429 `RATE_LIMITED`, con `Retry-After`. |
| `GET /users?status=active|inactive|invited` | Conserva filtros/paginación previos y añade filtro y campo `status` en las filas. Devuelve `lastLoginAt` e `invitedAt`, con null cuando no existen. Excluye bajas. |

`invited` significa `isActive=true`, `invitedAt` presente y `mustChangePassword=true`. La activación mediante el reset existente quita `mustChangePassword`; después la fila pasa a `active` y el reenvío devuelve 409. `inactive` tiene prioridad si `isActive=false`. `invitedAt` indica la última invitación emitida, sin borrarse al activar la cuenta. No se añaden estados persistidos que puedan desincronizarse.

Se reutiliza `issueAuthToken()` de T09a: token de un uso, caducidad de **una hora**, hash en `auth_tokens`, payload cifrado en outbox y consumo por `POST /auth/reset-password`. El 202 confirma el encolado; `email-dispatch` realiza la entrega. No se añade un mecanismo alternativo de contraseñas ni se devuelven enlaces/tokens al administrador.

Presupuestos compartidos por proceso: **10 envíos/minuto por administrador**, incluyendo altas con invitación, restablecimientos y reenvíos; además **3/minuto por destinatario**, compartidos entre administradores y entre las dos rutas de enlace. Se mantiene el límite general por IP. El frontend debe mostrar el aviso de resultado y tratar el envío como acción que requiere confirmación según CODE_STANDARDS.

## Alcance y trabajo concurrente

Código principal en `api/src/modules/audit/**`, `users/**`, entradas propias de schema/migración y `api/test/t12b-*.test.ts`. En los archivos compartidos se volvieron a leer los contenidos antes de escribir; se conservaron la entrada 0011 y los campos de formato de T13. Solo se formatearon archivos propios/conexiones y el bloque nuevo del esquema, conservando el contenido ajeno.

Conexiones imprescindibles para publicar las rutas y cumplir la auditoría en la misma transacción:

- `api/src/app.ts`: importar y registrar las rutas de auditoría.
- `api/src/modules/system/routes.ts`, `settings.ts`: pasar el actor y auditar las escrituras.
- `api/src/jobs/index.ts`: auditar el inicio manual junto a `job_runs`.
- `api/src/modules/system/storage-service.ts`, `storage-migration.ts`: conectar la auditoría global y hacer atómicos el inicio/reanudación del job y la persistencia del estado de fallo con sus entradas de auditoría.
- **Único archivo contractual editado por T12b: `api/src/modules/contracts/catalog.ts`**. Se añadieron llamadas a `auditCatalog` en las transacciones de plantillas/variables y una transacción en el alta de variable, que antes era una inserción aislada. Se conservaron las funciones y respuestas de documentos con formato de T13. No se editaron por esta tarea el ciclo de contratos, las firmas, PDF, renovaciones ni otros archivos contractuales.

No se editó `src/**`. Los demás cambios de T13 presentes en el árbol compartido no se atribuyen a esta implementación. No se ejecutó un formateo que escribiera indiscriminadamente sobre el trabajo concurrente.

## Verificación

Todas las ejecuciones de tests y comandos npm se hicieron desde **Git Bash (`sh`)**. Para evitar la carga implícita de `api/.env`, las pruebas usaron `DOTENV_CONFIG_PATH` apuntando a un path inexistente y configuración no sensible de test; `DATABASE_URL_TEST` se heredó sin modificación.

| Comprobación | Resultado |
| --- | --- |
| API `format:check` | Correcto. |
| API `typecheck` | Correcto. |
| API `build` | Correcto. |
| Primera regresión propia completa | 19/19 aprobadas; posteriormente se separaron los archivos y se añadieron casos de límites compartidos y volumen de exportación. |
| Regresión propia final, cinco archivos `t12b-*.test.ts` | **22/22 aprobadas**, 132,88 segundos. |
| Repetición de integración/almacenamiento tras ajustar la atomicidad del inicio de migración | **14/14 aprobadas**: nueve casos de T11 y cinco de integración T12b, 95,17 segundos. Incluye rollback del inicio de migración cuando falla auditoría. |
| Repetición de permisos de `core.test.ts`, selección `-t no` | **8 aprobadas, 12 omitidas**, 41,85 segundos. Incluye el caso que antes fallaba por devolver 400 en vez de 403. |
| API `npm test -- --reporter=verbose` | **555 aprobadas, 8 fallidas y 1 omitida**, 39 archivos, 1360,30 segundos. Se inició antes de las correcciones finales; desglose debajo. |
| Web `npm test` | 102/102 aprobadas. |
| Web `build` | Correcto; aviso de tamaño de chunks. |
| Web `typecheck` | Falla fuera del alcance: errores en componentes existentes, incluidos imports sin uso y contratos de tipos incompatibles. No se editaron esos archivos. |
| Web `format:check` | Señala 23 archivos fuera del alcance. No se reformatearon. |
| `git diff --check` en los paths propios | Correcto. |

Los logs de validación están en `api/tmp/t12b-*.log`, ignorados por git. No se presenta la corrida global como completamente verde ni como una ejecución nueva de todo el árbol después de los últimos ajustes. Se repitieron en procesos nuevos las regresiones afectadas.

Cobertura propia: `t12b-audit.test.ts` (8 casos), `t12b-users.test.ts` (6), `t12b-integration.test.ts` (5), `t12b-access-rates.test.ts` (2) y `t12b-export-limit.test.ts` (1). La exportación XLSX se reabre y comprueba como libro real. El caso de volumen inserta 10 001 entradas y comprueba tanto el rechazo como la exportación al acotar filtros. El log de la selección de core conserva el resumen recibido por stdout; el resto conserva la salida capturada de Vitest.

Desglose de los ocho fallos de esa corrida:

| Archivo | Casos | Resultado observado y tratamiento |
| --- | ---: | --- |
| `database.test.ts` | 1 | Inventario antiguo: espera 22 tablas y ahora hay 24. No se cambia el test ajeno al patrón asignado a T12b. |
| `core.test.ts` | 1 | El alta sin permisos y con el antiguo campo `password` recibía 400 antes de autorizar. Se adelantó la autorización del alta a `preValidation`, conservando 403 para usuarios sin rol admin y 400 para contraseñas aportadas por un admin. |
| `t12b-audit.test.ts` | 1 | Misma comprobación de permisos con una instancia que había cargado el código anterior al ajuste. La repetición final pasa. |
| `t11-storage.test.ts` | 1 | La instancia de esa corrida no conservaba aún la entrada histórica `storage:configure` en `contract_audit_logs`. Se conservó el registro T11 además del administrativo, sin duplicarlo en el feed, y se repite su regresión en proceso nuevo. |
| `contracts.test.ts` | 1 | Preview de plantilla: el test exige exactamente `{ html, missing }`, mientras la respuesta concurrente de T13 añade `contentFormat`. T12b no modifica el preview ni ese test. |
| `t13-rich-doc.test.ts` | 2 | Validación de contenedores vacíos y tablas con filas cubiertas por rowspan en el trabajo concurrente de T13. No se modifican sus validadores ni tests. |
| `t13-pdf.test.ts` | 1 | Mismo rechazo de documento con formato al probar contenedores vacíos/rowspan. No se modifica el generador PDF ni ese test. |

Los resultados concurrentes de T13 corresponden a esa corrida; no se certifica aquí su estado final después de sus cambios posteriores.

## Decisiones y límites

- No se reconstruyen acciones administrativas históricas que solo existían en logs del servidor. La captura administrativa comienza al desplegar esta versión.
- El nombre del actor contractual histórico sigue el modelo de T10: se obtiene del usuario conservado, o se muestra `Usuario eliminado`. Las entradas administrativas nuevas sí guardan el nombre del momento de la acción.
- Las invitaciones anteriores sin marcador persistido no se clasifican retrospectivamente por heurísticas. `invitedAt` permanece null; se puede usar el restablecimiento para emitir un enlace seguro. Las invitaciones creadas por esta versión tienen estado verificable.
- Los límites de envío son locales al proceso, como los de T09a. No se introdujo infraestructura distribuida.
- No se añaden interfaces, despliegue, envío directo de correos fuera de outbox ni cambios de configuración privada. No se hizo commit.
