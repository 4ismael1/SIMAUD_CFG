# T17 — Enmiendas de contratos firmados (lanzar DESPUÉS de T15 y T16)

**Asignado a:** Codex · **Revisa:** Claude. Lee `docs/PRINCIPIOS.md`, `docs/CODE_STANDARDS.md` y los informes T10, T13,
T14 (H01, H03, H04, H05), T15 y T16.

## Decisión del dueño (10 nov 2026)
Un contrato **ya firmado** (activo, por vencer o vencido) **no se edita**: se corrige con una **enmienda con nueva firma**.
Lo firmado siempre coincide con lo guardado; el original se conserva íntegro, con su PDF final, su sello y su código público.

## Modelo y flujo
- `POST /contracts/:id/amendments` (admin, y gestor dueño del contrato): crea una **enmienda** = un contrato nuevo
  enlazado (`amends_contract_id`, `amendment_number` 1, 2…, código `CT-2026-0005-E1`) que copia contenido, formato,
  datos y firmantes del vigente, con un motivo obligatorio. Empieza en `draft` y sigue el flujo normal: edición →
  aprobación (con la regla de H02 de T16) → firmas en orden → activación.
- Al **activarse** la enmienda: el original pasa a un estado/marca `amended` (deja de estar vigente, sin perder su
  evidencia ni su verificación pública, que mostrará «Sustituido por la enmienda E1» con su código), y la enmienda queda
  `active` con las fechas que tenga. Renovaciones y vencimientos pasan a seguir la enmienda.
- Solo una enmienda abierta a la vez por contrato. Cancelar la enmienda no afecta al original.
- `can.amend` en el detalle; la lista y el detalle exponen la cadena (original ↔ enmiendas) sin datos personales extra.
- Auditoría (T10/T12b): crear, aprobar, firmar y activar enmiendas quedan en el historial de **ambos** contratos.
- H01 (del informe T14): incluye la marca histórica de aprobación y la protección de borrado, porque comparte el modelo.

## Volver a firmar ANTES de la activación (decisión del dueño, 10 nov 2026)
Contrato en `pending_signatures` con alguna firma registrada (no activo, sin PDF final):
- **Pedir nueva firma** `POST /contracts/:id/signatures/:signatoryId/reset` (admin, y gestor dueño), motivo obligatorio
  (≤ 500): anula la firma vigente de ese firmante (queda en la evidencia como `superseded`, con el motivo; nada se borra),
  el firmante vuelve a `pending` y se le notifica. Se respeta el orden: si firmantes posteriores ya firmaron, sus firmas
  **se conservan** (el documento no cambia) salvo que se use «Reiniciar firmas». El turno vuelve al primer pendiente.
- **Reiniciar firmas** `POST /contracts/:id/signatures/reset` (admin, y gestor dueño), motivo obligatorio: anula todas las
  firmas vigentes (evidencia `superseded`), todos vuelven a `pending` en su orden y se notifica al primero.
- Ambas acciones: bloqueo del contrato (orden de locks de T16), 409 si el contrato ya está activo/tiene PDF final (para
  eso, enmienda) o si no hay firmas que anular; auditoría en el historial; cadena de evidencia de T10 válida tras anular;
  no reabren la aprobación. Nadie se pide nueva firma a sí mismo como atajo para saltar el turno.
- `can.resetSignature` / `can.resetSignatures` en el detalle (y por firmante, cuál se puede anular).
- Compatible con T18 (el firmante también puede rehacer su propia firma antes de la activación): reutilizar el mismo modelo
  de «firma sustituida».
- Pruebas: anular una firma intermedia y conservar las posteriores, reiniciar todas, permisos por rol, 409 tras activar,
  concurrencia anular vs firmar, evidencia y verificación correctas tras volver a firmar.

## Entrega
Migración nueva (número siguiente libre), pruebas de todo el flujo (incluido verificar el original tras la enmienda,
concurrencia de dos enmiendas, permisos por rol), suite completa en verde (Git Bash), sin commit, sin secretos.
Informe `docs/tasks/T17-enmiendas.REPORT.md` con el contrato HTTP para el front.
