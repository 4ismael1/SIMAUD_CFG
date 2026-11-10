# T02 — API: plantillas, variables, contratos, aprobación, firmas y auditoría

**Asignado a:** Codex · **Revisa:** Claude · **Depende de:** T01 (usa su esquema, plugin de auth, errores, audit helper, convenciones).
Trabaja SOLO en `api/` y `docs/tasks/`. Consulta `supabase/migrations`, `supabase/functions` y `src/components/contracts/*` como referencia del dominio actual (no los modifiques).

## Reglas de permisos (comprobar SIEMPRE en servidor)
| Recurso | admin | supervisor | gestor | user (firmante) |
|---|---|---|---|---|
| Plantillas / variables: leer | ✓ | ✓ | ✓ (solo activas) | — |
| Plantillas / variables: escribir | ✓ | ✓ | — | — |
| Contratos: listar/ver | todos | todos | los que creó | solo donde es firmante (vía `/me/signatures`) |
| Crear / editar contrato | ✓ | — | ✓ (propios, en draft o rejected) | — |
| Enviar a aprobación | ✓ | — | ✓ propios | — |
| Aprobar / rechazar | ✓ | ✓ (nunca uno creado por él mismo) | — | — |
| Firmar | quien sea firmante del contrato y le toque turno |
| Cancelar | ✓ | ✓ | propios | — |
| Archivar / desarchivar | ✓ | ✓ | propios | — |
| Borrar | ✓ (hard delete, cualquiera; requiere `confirm: <código del contrato>`) | — | propios en draft | — |
| Forzar estado (override) | ✓ solo transiciones válidas + motivo obligatorio | — | — | — |

## Máquina de estados (`contract_status`) — `src/modules/contracts/state-machine.ts`, pura y con tests unitarios
```
draft --submit--> pending_approval --approve--> pending_signatures --(última firma)--> active
pending_approval --reject(comentario obligatorio)--> rejected --edit--> draft (o directo submit)
active --(cron T03)--> expiring_soon --(cron)--> expired
{pending_signatures, active, expiring_soon} --cancel(motivo)--> cancelled
cancelled --uncancel (admin)--> estado previo guardado
{active, expiring_soon, expired} --renew (T03)--> renewed
```
- Editar contenido/variables/firmantes solo en `draft` o `rejected`. Si se edita en `rejected`, se crea nueva versión.
- Si el contenido cambia después de aprobado → no permitido (409); se debe cancelar o crear renovación.
- Cada transición: transacción + `SELECT … FOR UPDATE` del contrato + fila en `contract_audit_logs` (old/new, user, ip, ua) + notificación (tabla `notifications`) a quien corresponda:
  - submit → todos los admin/supervisor activos (`approval_needed`)
  - approve → creador (`approval_result`) + firmante con `signing_order` más bajo (`signature_required`)
  - reject → creador (`approval_result`, con comentario)
  - firma → siguiente firmante (`signature_required`); última firma → creador y todos los firmantes (`contract_signed`)
  - cancel → creador y firmantes (`contract_cancelled`)
- Envío de email para `signature_required` y `approval_result` usando el mailer de T01 (en dev se imprime en consola).

## Endpoints (`/api/v1`)
**Variables** `GET /variables` · `POST /variables` · `PATCH /variables/:id` · `DELETE /variables/:id` (409 con `details.templates` si está en uso). `name` = `^[a-z][a-z0-9_]*$`, único. Tipo `select` exige `options` ≥ 1.
**Plantillas** `GET /templates?status=&q=&category=` (incluye `usageCount`) · `GET /templates/:id` (con variables resueltas) · `POST /templates` · `PATCH /templates/:id` · `POST /templates/:id/duplicate` (copia inactiva) · `PATCH /templates/:id/status` · `DELETE /templates/:id` (409 si tiene contratos) · `POST /templates/preview` {content, values} → {html, missing[]}. Al guardar: extraer `{{var}}` del contenido en servidor, validar que existen (400 con lista de desconocidas) y guardar `variables`.
**Render**: `lib/render-template.ts` sustituye `{{var}}` formateando por tipo (fecha `d 'de' MMMM 'de' yyyy` es-DO, número/valor `RD$ 1.234,56`, select/text tal cual) y ESCAPA HTML. Tests.
**Contratos**
- `GET /contracts?status=&q=&templateId=&createdBy=&expiresBefore=&archived=false&page&pageSize&sort=-updatedAt` → incluye `code` (`CT-AAAA-NNNN`, secuencial por año, generado al crear), plantilla {id,title}, creador {id,name}, `signatures: {signed,total}`, `daysToExpiry`. También `GET /contracts/counts` → conteo por estado (para pestañas) respetando permisos.
- `POST /contracts` {templateId, title, variables, value, startDate, endDate, notes?, signatories:[{name,email,phone?,cedula?,role,signingOrder}]} → todo en una transacción: contrato `draft` + firmantes (vincular `user_id` si existe usuario con ese email o cédula) + versión 1 + `generated_content` renderizado en servidor. Validar variables requeridas, fechas (fin > inicio), ≥1 firmante, emails válidos, sin firmantes duplicados.
- `GET /contracts/:id` → contrato + firmantes + permisos calculados para el usuario actual: `can: {edit, submit, approve, reject, sign, cancel, archive, delete, override}` (el front pinta botones solo con esto).
- `PATCH /contracts/:id` (draft/rejected) → reemplaza firmantes por diff (conserva ids/vínculos de los que siguen), nueva versión si cambia contenido.
- `POST /contracts/:id/submit` · `POST /contracts/:id/approve` {comment?} · `POST /contracts/:id/reject` {comment} · `POST /contracts/:id/cancel` {reason, description} · `POST /contracts/:id/uncancel` · `POST /contracts/:id/archive` · `POST /contracts/:id/unarchive` · `POST /contracts/:id/override-status` {status, reason} · `DELETE /contracts/:id` {confirm?}
- `GET /contracts/:id/versions` · `GET /contracts/:id/versions/:n` · `GET /contracts/:id/audit?page` · `GET /contracts/:id/approvals`
- `POST /contracts/:id/remind` {signatoryId} → reenvía aviso al firmante (rate limit 1/h por firmante).
**Aprobaciones** `GET /approvals?status=pending` (con contrato, solicitante, antigüedad, versión y diff resumido respecto a la versión aprobada/rechazada anterior si existe).
**Firmas**
- `GET /me/signatures?status=pending|signed` → contratos donde el usuario es firmante (por `user_id`; al primer acceso vincular por email confirmado/cédula), con `myTurn` (true si todos los de `signing_order` menor ya firmaron).
- `POST /contracts/:id/sign` multipart {signature: PNG ≤ 500 KB, acceptedDeclaration: true, viewedAt} → valida que es su turno y estado `pending_signatures`; guarda PNG en `storage/signatures/` (tabla `files`), IP real (`request.ip`, trustProxy configurable) y user agent; si es la última firma → `active`. Idempotente (409 si ya firmó).
- `POST /contracts/:id/decline` {reason} → firmante rechaza firmar: estado vuelve a `rejected` con comentario y notifica al creador.
- `GET /files/signatures/:id` → solo admin/supervisor, creador o firmantes del contrato.

## Tests mínimos (Vitest)
Máquina de estados completa (válidas e inválidas); render (escape HTML, formatos); permisos: gestor no ve contratos ajenos, firmante no ve contratos donde no participa, supervisor no aprueba lo suyo, user no puede crear; crear contrato transaccional (falla firmante → no queda contrato); orden de firma (segundo no puede firmar antes que el primero); última firma → active; aprobación concurrente (dos approve simultáneos → uno 409); delete exige confirm; variable en uso → 409.

## Ajustes a T01 (revisión de Claude)
1. **Refresh multi-pestaña**: hoy, si dos pestañas refrescan a la vez con el mismo token, la segunda ve el token revocado y revoca toda la familia (cierra la sesión del usuario). Añade una ventana de gracia de 15 s: si el token presentado fue rotado (tiene `replacedBy`) hace menos de 15 s, responde 409 `REFRESH_RACE` SIN revocar la familia (el front reintentará con la cookie nueva). Fuera de esa ventana se mantiene la detección de reutilización. Test.
2. **`trustProxy`**: variable `TRUST_PROXY` (por defecto `false`; acepta `true`, número de saltos o lista de IPs) aplicada a Fastify, para que `request.ip` sea la IP real detrás de Nginx en producción. Documenta en `.env.example`.
3. Corrige la redacción de la plantilla seed: moneda RD$ (no pesos colombianos).

## Criterios de aceptación
`npm test`, `npm run typecheck`, `npm run build` y `npm audit` limpios. Seed ampliado con ~8 contratos de ejemplo en estados distintos (con firmantes enlazados a los usuarios seed). Actualiza `api/README.md` y escribe `docs/tasks/T02-api-contratos.REPORT.md` (decisiones, dudas, endpoints).
