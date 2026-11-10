# T12a — Administración avanzada, reportes y paneles: informe

Fecha: 2026-11-10.

**Contrato HTTP: sin diferencias de nombres ni formas respecto de la tarea y de `src/lib/api/report-types.ts`.** Implementación terminada. Los endpoints anteriores conservan sus contratos; los campos de dashboard y `can.reassign` son aditivos.

## Alcance

Se leyeron `CODE_STANDARDS.md`, `PRINCIPIOS.md`, `HANDOFF.md`, la tarea, los informes T02/T03 y el contrato del frontend.

Cambios de esta entrega:

- `api/src/modules/reports/**`: overview, validación, consultas, períodos, filtros y exportación de todas las tablas.
- `api/src/modules/dashboard/{admin-queries,service,rich-queries}.ts`: campos nuevos por rol.
- `api/src/modules/contracts/admin-routes.ts` y `admin-actions.ts`: reasignación y acciones en lote.
- `api/src/modules/contracts/routes.ts`: registro de las rutas nuevas, `can.reassign` y ampliación del listado.
- `api/test/t12a-*.test.ts`: cuatro archivos, 32 pruebas.

No se editaron archivos de frontend, tests anteriores, `schema.ts`, migraciones, `env.ts`, firmas, PDF contractual, almacenamiento, `system/**` ni la regla de borrado. No se añadieron dependencias ni se crearon migraciones. Los cambios concurrentes de T10 se conservaron. No se hizo commit ni staging.

No se leyó ni editó manualmente `.env`, no se modificó `DATABASE_URL_TEST` y no se imprimieron secretos. Se usó la conexión existente a `simaud_test2`.

## Contrato entregado

Todas las rutas llevan el prefijo existente `/api/v1`.

| Ruta | Acceso | Resultado |
| --- | --- | --- |
| `GET /reports/overview` | Admin, supervisor, gestor | `range`, `previousRange`, los ocho `kpis`, `timeline`, `byStatus`, `byTemplate`, `byManager`, `valueRanges`, `topContracts`, `approvals`; `users` exclusivamente para admin |
| `GET /reports/overview/export` | Mismo alcance | CSV, XLSX o PDF con resumen y todas las tablas autorizadas |
| `GET /reports/filters` | Staff | `managers: [{ id, name }]`, `templates: [{ id, title }]`; gestor recibe solo su identidad en `managers` |
| `GET /dashboard` | Usuario autenticado | Campos adicionales por rol; respuesta del firmante conservada |
| `GET /contracts` | Staff | Búsqueda ampliada, estados separados por comas y filtros `createdFrom`/`createdTo`; respuesta y parámetros anteriores conservados |
| `POST /contracts/:id/reassign` | Admin | Valida destino y estado, reasigna y devuelve el detalle con `can.reassign` |
| `POST /contracts/bulk` | Admin | `{ succeeded, failed, results: [{ id, code, ok, error? }] }`, en el orden solicitado |

El overview admite `from`, `to`, `status`, `templateId`, `managerId` y `granularity`. Los reportes anteriores continúan funcionando sin modificaciones de sus respuestas.

## Decisiones de cálculo

- Fechas inclusivas en `America/Santo_Domingo`: inicio del primer día hasta el inicio exclusivo del día posterior al último. Las consultas nuevas convierten explícitamente a `timestamp` antes de aplicar la zona horaria, evitando la sobrecarga implícita de PostgreSQL para `date`. El día actual se obtiene con `Intl` y esa zona.
- Por defecto se incluyen hoy y los 89 días anteriores. El rango anterior tiene exactamente la misma cantidad de días y termina el día previo al inicio actual.
- La lectura del overview usa una transacción de solo lectura con aislamiento `repeatable read`, para que sus tablas compartan la misma instantánea.
- Los filtros de contrato se aplican a todos los indicadores contractuales y sus tablas. El gestor queda limitado por su identidad aunque envíe otro `managerId`. Los usuarios ignoran estado, plantilla y gestor; sus altas y registros sí corresponden a los rangos solicitados.
- `created`, importes, distribuciones y top corresponden a contratos creados en el rango. Las decisiones, cancelaciones y activaciones se cuentan por la fecha de su propio evento, aunque el contrato se haya creado antes.
- Activación significa que existe al menos un firmante y todos tienen estado firmado y fecha de firma. Se usa la última fecha de firma; un cambio administrativo a `active` no fabrica una firma.
- Cancelaciones: contratos distintos con una cancelación aprobada en el período. Aprobaciones: cada decisión aprobada/devuelta cuenta como una decisión; la tasa es una fracción entre 0 y 1. Pendientes: solicitudes del rango que siguen pendientes.
- La demora de aprobación incluye decisiones aprobadas y devueltas. La demora de firma usa la última aprobación anterior o igual a la activación. Sin evidencia temporal suficiente, las medias y tasas son `null`.
- PostgreSQL realiza sumas y medias sobre los importes decimales. El overview convierte los resultados a números para cumplir el contrato; los reportes anteriores conservan su representación original.
- Las series incluyen períodos vacíos, claves ISO de semana y etiquetas españolas. La comparación de cada período usa la misma posición del rango anterior; si no existe esa posición, sus valores anteriores son `null`.
- Bandas: `[0, 50k)`, `[50k, 250k)`, `[250k, 1M)`, `[1M, 5M]` y `(5M, infinito)`. Los importes nulos no se incluyen en bandas, top ni media. El top contiene como máximo diez contratos.
- Los filtros ofrecen gestores/administradores activos y no eliminados; las plantillas incluyen las existentes, también inactivas, para permitir consultar contratos históricos.

## Paneles y exportación

Admin recibe `totals`, importe mensual, cinco gestores principales de los últimos 90 días, usuarios por rol y las 15 entradas más recientes de auditoría contractual. Supervisor recibe catálogo, categorías y actividad; su alcance existente permite leer todos los contratos. Gestor recibe doce meses propios, estados y vencimientos propios con la misma forma del panel de admin. `recentActivity.at` se devuelve como fecha ISO en UTC.

Se conserva el criterio anterior del campo `monthly.signed` del dashboard: primera transición auditada a `active`. El overview distingue las activaciones por firmas completas, según la definición de esta tarea.

La exportación reutiliza `reports/export.ts` y `csvCell`, sin cambiar el exportador anterior. CSV conserva BOM y protección contra fórmulas; XLSX genera una hoja por tabla; PDF usa el generador existente. Las descargas mantienen caché privada y `Content-Disposition`. Las tablas de usuarios solo se exportan para admin.

## Acciones administrativas

Reasignar exige destino activo, no eliminado y con rol gestor/admin, y motivo de 5–500 caracteres mediante la validación compartida. Bloquea el contrato y el destino; cambio, auditoría y avisos son transaccionales. La auditoría `manager_reassigned` conserva gestor anterior, nuevo gestor, motivo y actor. Se rechaza el mismo destino y los contratos cancelados, renovados o archivados.

La restricción actual de notificaciones no admite una categoría nueva de reasignación. Se reutiliza `approval_result` con el mensaje explícito de reasignación para ambos gestores y sus preferencias existentes. La acción de auditoría sí es `manager_reassigned`; no se modifica el esquema.

El lote valida 1–100 UUID sin repeticiones, incluyendo equivalencias entre mayúsculas y minúsculas. Cada contrato toma su bloqueo y su propia transacción, reutilizando `applyContractAction`, permisos, transición, auditoría y notificaciones de las acciones individuales. Un error no aborta los siguientes contratos. Para cancelar, el motivo libre se adapta al cuerpo individual `{ reason: 'other', description: reason }`; los motivos opcionales de archivo también quedan auditados. Las rutas administrativas tienen límite de diez peticiones por minuto. No existe borrado masivo.

## Verificación

| Comprobación en `api/` | Resultado |
| --- | --- |
| `npm run typecheck` | Correcto |
| `npm run build` | Correcto |
| `npm run format:check` | Correcto en todo `src` y `test`; solo se formatearon archivos propios o compartidos dentro del alcance autorizado |
| `npm test -- t12a` — última ejecución | **32/32 aprobadas**, cuatro archivos, sin skips, salida 0 |
| Regresión: `npm test -- t12a contracts lifecycle reports dashboard` | **227/227 pruebas anteriores aprobadas**. La primera pasada conjunta detectó un único fallo propio en la frontera horaria; se corrigió y las pruebas T12a completas se ejecutaron nuevamente en verde |
| `npm audit --logs-max=0` | Auditoría online correcta: **0 vulnerabilidades** |
| `git diff --check` del alcance | Correcto |

Cobertura: indicadores y comparación anterior, fechas límite, granularidades y períodos vacíos, filtros combinados y aislamiento del gestor, usuarios solo para admin, bandas y top, tres exportaciones, opciones de filtros, búsqueda por cliente/gestor/firmante/cédula con comodines literales, reasignación y sus permisos/estados/destinos/auditoría/avisos, resultados parciales y límites del lote, rate limit y campos de dashboard por rol.

Durante el trabajo paralelo, T10 amplió una migración que ya estaba aplicada en `simaud_test2`; una comprobación posterior encontró el desfase de `ever_signed`. Se reconstruyó exclusivamente el esquema de esa base desechable, con guardas que exigían exactamente `simaud_test2` y una base de desarrollo diferente, y se aplicaron las migraciones existentes sin editarlas. La última ejecución de 32 pruebas pasó sobre ese esquema reconstruido.

## Límites y pendientes

No se reconstruyen retrospectivamente el valor, gestor o estado del contrato en la fecha de cada evento: los filtros y agrupaciones usan sus datos actuales, y los indicadores temporales usan la evidencia conservada. Los registros importados sin fechas de firma o decisión no generan duraciones inventadas.

No quedan dudas funcionales ni atajos pendientes de esta tarea. La suite completa del API, fuera de las regresiones seleccionadas, corresponde a la revisión conjunta final indicada en la tarea. No se verificó interfaz ni se modificó frontend.
