/** Action names written to the audit trail by the API (src/modules/contracts) and the scheduled jobs. */
const AUDIT_ACTION_LABELS: Record<string, string> = {
  create: "Contrato creado",
  edit: "Contrato editado",
  submit: "Enviado a aprobación",
  approve: "Aprobado",
  approved_own: "Autoaprobado por administrador",
  "renewal-approved_own": "Renovación autoaprobada por administrador",
  reject: "Devuelto con observaciones",
  sign: "Firmado",
  decline: "Firma rechazada",
  cancel: "Cancelado",
  uncancel: "Reactivado",
  archive: "Archivado",
  unarchive: "Desarchivado",
  override: "Estado forzado por administración",
  "override-status": "Estado forzado por administración",
  manager_reassigned: "Gestor reasignado",
  remind: "Recordatorio enviado",
  renewed: "Renovado",
  expire: "Vencido",
  expiring: "Marcado como próximo a vencer",
  delete: "Borrador eliminado",
};

/** Human label of an audit action; unknown actions fall back to their own name. */
export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action.replaceAll("_", " ");
}
