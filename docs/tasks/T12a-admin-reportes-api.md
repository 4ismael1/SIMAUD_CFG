# T12a — API para el módulo avanzado del administrador, reportes y paneles ricos

**Asignado a:** Codex · **Revisa:** Claude. Lee `docs/PRINCIPIOS.md` (obligatorio), `docs/CODE_STANDARDS.md` y los informes T02/T03.
**Corre EN PARALELO con T10.** Para no pisarnos:
- **Tu alcance (solo esto):** `api/src/modules/reports/**`, `api/src/modules/dashboard/**`, archivos nuevos `api/src/modules/contracts/admin-routes.ts` y `admin-actions.ts` (regístralos donde se registran las rutas de contratos con un cambio mínimo), el handler `GET /contracts` y su esquema de query (solo lo del listado), `api/test/t12a-*.test.ts`, `docs/tasks/T12a*`.
- **Prohibido:** `schema.ts`, migraciones, `env.ts`, firmas, PDF, storage, `system/**`, la regla de borrado, cualquier test existente (si un test existente se rompe por tu cambio, es que rompiste compatibilidad: todo lo de esta tarea es **aditivo**). **Sin migraciones**: todo se calcula con las tablas actuales.
- Base de pruebas: **`simaud_test2`** (Claude ya dejó preparada la variable de entorno del proceso; no leas ni imprimas `.env`).
- No toques `src/**` (front = Claude). Los tipos de respuesta de abajo son el contrato: Claude ya está construyendo el front contra ellos, **respeta nombres y formas exactamente**.

Convenciones: dinero como en los reportes actuales (`value` numérico), fechas ISO, `from`/`to` `YYYY-MM-DD` inclusivos en zona `America/Santo_Domingo`. Un gestor solo ve lo suyo (se ignora `managerId` ajeno). `Comparison = { value: number | null; previous: number | null }` donde `previous` es el mismo indicador en el período inmediatamente anterior de igual duración.

## 1. `GET /reports/overview` (admin, supervisor, gestor)
Query: `from`, `to` (por defecto últimos 90 días), `status` (lista separada por comas de estados de contrato), `templateId`, `managerId`, `granularity` = `week | month | quarter | year` (por defecto `month`). Los filtros aplican a todo salvo a `users`.

```ts
interface ReportsOverview {
  range: { from: string; to: string };
  previousRange: { from: string; to: string };
  kpis: {
    created: Comparison; // contratos creados en el rango
    totalValue: Comparison; // suma de contractValue de los creados
    averageValue: Comparison; // null si no hay contratos con valor
    activated: Comparison; // contratos que quedaron vigentes (última firma) en el rango
    cancelled: Comparison;
    approvalRate: Comparison; // 0..1: aprobados / decisiones tomadas en el rango; null sin decisiones
    avgApprovalDays: Comparison; // envío → decisión
    avgSigningDays: Comparison; // aprobación → activación
  };
  // períodos sin datos incluidos con 0
  timeline: Array<{
    period: string;
    label: string;
    created: number;
    activated: number;
    value: number;
    previousCreated: number | null;
    previousValue: number | null;
  }>;
  byStatus: Array<{ status: ContractStatus; count: number; value: number }>;
  byTemplate: Array<{ templateId: string | null; label: string; count: number; value: number }>;
  byManager: Array<{
    managerId: string;
    name: string;
    count: number;
    value: number;
    activated: number;
    approvalRate: number | null;
    avgApprovalDays: number | null;
  }>;
  valueRanges: Array<{ key: string; label: string; min: number; max: number | null; count: number; value: number }>;
  // los 10 de mayor valor
  topContracts: Array<{
    id: string;
    code: string;
    title: string;
    status: ContractStatus;
    contractValue: number;
    managerName: string | null;
    createdAt: string;
  }>;
  approvals: {
    decided: number;
    approved: number;
    returned: number;
    pending: number;
    bySupervisor: Array<{
      supervisorId: string;
      name: string;
      decided: number;
      approved: number;
      returned: number;
      avgResponseDays: number | null;
    }>;
  };
  // solo admin
  users?: {
    total: number;
    active: number;
    newInRange: Comparison;
    byRole: Array<{ role: Role; count: number }>;
    registrations: Array<{ period: string; label: string; count: number }>;
  };
}
```

`period` es una clave ordenable (`2026-11`, `2026-W45`, `2026-Q4`, `2026`); `label` en español corto («nov 2026», «Sem 45», «T4 2026»). `previousCreated/previousValue` = el período homólogo del rango anterior (misma posición). Rangos de valor: `<50k`, `50k–250k`, `250k–1M`, `1M–5M`, `>5M` (DOP), con etiquetas legibles.

`GET /reports/overview/export?format=csv|xlsx|pdf` (mismos filtros): exporta resumen + todas las tablas (en xlsx una hoja por tabla), reutilizando `export.ts`.

`GET /reports/filters` (staff): `{ managers: Array<{ id: string; name: string }>; templates: Array<{ id: string; title: string }> }` (gestor: solo él mismo en `managers`).

Los endpoints de reportes actuales siguen funcionando igual.

## 2. Paneles (`GET /dashboard`) — campos nuevos, aditivos
- **Admin:** `totals: { users: number; newUsersThisMonth: number; contracts: number; newContractsThisMonth: number; totalValue: number; averageValue: number | null; approvalRate: number | null }`; cada elemento de `monthly` gana `value: number`; `topManagers: Array<{ managerId: string; name: string; count: number; value: number }>` (5, últimos 90 días); `usersByRole: Array<{ role: Role; count: number }>`; `recentActivity: Array<{ id: string; at: string; action: string; actorName: string | null; contractId: string | null; contractCode: string | null; contractTitle: string | null }>` (15 últimas entradas de la auditoría de contratos).
- **Supervisor:** `catalog: { activeTemplates: number; variables: number; contractsFromTemplates: number }`, `templatesByCategory: Array<{ category: string; count: number }>`, `recentActivity` (misma forma, limitada a lo que puede ver).
- **Gestor:** `monthly: Array<{ month: string; created: number; signed: number; value: number }>` (12 meses, propios), `byStatus: Array<{ status: ContractStatus; count: number }>`, `upcomingExpirations` (misma forma que en admin, propios).
- **Firmante:** sin cambios.

## 3. Contratos: búsqueda y filtros del listado
`GET /contracts`: `q` busca además en nombre del cliente, nombre del gestor y nombre/cédula de firmantes (respetando el alcance por rol; usa parámetros, nunca interpolación; escapa `%`/`_`). `status` acepta lista separada por comas. Nuevos filtros `createdFrom`, `createdTo` (`YYYY-MM-DD`). Compatibilidad total con las llamadas actuales.

## 4. Acciones avanzadas del administrador (`admin-routes.ts`)
- `POST /contracts/:id/reassign` (admin) `{ managerId: uuid, reason: string 5–500 }`: el destino debe ser un usuario activo con rol `gestor` o `admin`; no permitido en `cancelled`/`renewed` ni archivados; cambia el gestor responsable (`createdBy`), deja auditoría `manager_reassigned` con origen, destino y motivo en la misma transacción con bloqueo del contrato, notifica a ambos gestores, devuelve el `ContractDetail`. El detalle de contrato gana `can.reassign: boolean`.
- `POST /contracts/bulk` (admin) `{ action: 'cancel' | 'archive' | 'unarchive', ids: uuid[] (1–100, sin repetidos), reason?: string }` (`reason` obligatoria para `cancel`, mismas reglas que la acción individual). Cada contrato en **su propia transacción**, reutilizando exactamente las funciones de las acciones individuales (mismas validaciones de estado, auditoría y notificaciones). Respuesta 200: `{ succeeded: number; failed: number; results: Array<{ id: string; code: string | null; ok: boolean; error?: { code: string; message: string } }> }` — un fallo no aborta los demás. Rate limit moderado. **No existe borrado masivo** (PRINCIPIOS §1).

## 5. Tests (`t12a-*.test.ts`)
Overview: totales, comparación con período anterior, granularidades, filtros combinados, gestor aislado, `users` solo admin; export en los 3 formatos; filtros; búsqueda por cliente/gestor/firmante y aislamiento por rol; reassign (permisos, destino inválido, auditoría, estados prohibidos); bulk (mezcla de éxitos y fallos, límites, permisos, motivo); paneles con los campos nuevos.

Verificación: `npm run format:check && npm run typecheck && npm audit` y `npm test -- t12a` + los tests de `reports`, `dashboard`, `contracts`, `lifecycle` (la suite entera la corre Claude al final). Formatea solo tus archivos.

## Informe
`docs/tasks/T12a-admin-reportes-api.REPORT.md`: contrato final (si algo difiere de lo de arriba, dilo arriba del todo), decisiones, limitaciones. No hagas git commit. No imprimas secretos.
