const summaries: Record<string, string> = {
  "user.created": "Creó una cuenta y envió la invitación.",
  "user.updated": "Actualizó los datos del usuario.",
  "user.role_changed": "Cambió el rol del usuario.",
  "user.activated": "Activó la cuenta del usuario.",
  "user.deactivated": "Desactivó la cuenta del usuario.",
  "user.deleted": "Dio de baja al usuario.",
  "user.password_reset": "Envió el enlace de restablecimiento y cerró las sesiones.",
  "user.invite_resent": "Reenvió la invitación al usuario.",
  "settings.updated": "Actualizó los ajustes del sistema.",
  "variable.created": "Creó una variable.",
  "variable.updated": "Actualizó una variable.",
  "variable.deleted": "Eliminó una variable.",
  "template.created": "Creó una plantilla.",
  "template.updated": "Actualizó una plantilla.",
  "template.deleted": "Eliminó una plantilla.",
  "template.duplicated": "Duplicó una plantilla.",
  "template.status_changed": "Cambió el estado de una plantilla.",
  "storage:configure": "Configuró el almacenamiento.",
  "storage:migrate": "Inició la migración del almacenamiento.",
  "storage:resume": "Reanudó la migración del almacenamiento.",
  "storage:activate": "Activó el almacenamiento de destino.",
  "storage:failed": "Registró el fallo de la migración del almacenamiento.",
  "job.started": "Inició manualmente una tarea del sistema.",
  create: "Creó el contrato.",
  update: "Editó el contrato.",
  edit: "Editó el contrato.",
  delete: "Eliminó el borrador del contrato.",
  submit: "Envió el contrato a aprobación.",
  approve: "Aprobó el contrato.",
  reject: "Devolvió el contrato.",
  sign: "Firmó el contrato.",
  cancel: "Canceló el contrato.",
  uncancel: "Reactivó el contrato cancelado.",
  "override-status": "Forzó el estado del contrato con motivo administrativo.",
  manager_reassigned: "Reasignó el gestor responsable del contrato.",
  archive: "Archivó el contrato.",
  unarchive: "Restauró el contrato archivado.",
  "renewal-request": "Solicitó la renovación del contrato.",
  "renewal-approve": "Aprobó la renovación del contrato.",
  "renewal-reject": "Rechazó la renovación del contrato.",
  "renewal-cancel": "Canceló la solicitud de renovación.",
  "renewal-child": "Creó el contrato de renovación.",
  renewed: "Renovó el contrato.",
};

export function summarize(area: string, action: string) {
  return (
    summaries[action] ??
    (area === "contracts"
      ? "Registró una acción sobre el contrato."
      : "Registró una acción de administración.")
  );
}
