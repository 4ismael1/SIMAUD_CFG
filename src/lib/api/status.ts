import type { ContractStatus, Role } from "./types";
export type StatusTone =
  "neutral" | "warning" | "danger" | "info" | "success" | "violet";
export interface StatusPresentation {
  label: string;
  tone: StatusTone;
}
export const contractStatus: Record<ContractStatus, StatusPresentation> = {
  draft: { label: "Borrador", tone: "neutral" },
  pending_approval: { label: "En aprobación", tone: "warning" },
  rejected: { label: "Devuelto", tone: "danger" },
  pending_signatures: { label: "Por firmar", tone: "info" },
  active: { label: "Vigente", tone: "success" },
  expiring_soon: { label: "Por vencer", tone: "warning" },
  expired: { label: "Vencido", tone: "danger" },
  cancelled: { label: "Cancelado", tone: "neutral" },
  renewed: { label: "Renovado", tone: "violet" },
  amended: { label: "Enmendado", tone: "violet" },
};
export const roleStatus: Record<Role, StatusPresentation> = {
  admin: { label: "Administrador", tone: "violet" },
  supervisor: { label: "Supervisor", tone: "info" },
  gestor: { label: "Gestor", tone: "success" },
  user: { label: "Firmante", tone: "neutral" },
};
