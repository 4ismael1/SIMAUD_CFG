import { renderLayout } from "./layout.js";
import { env } from "../../../config/env.js";
export const mailTemplates = [
  "email_confirmation",
  "password_reset",
  "invitation",
  "signature_required",
  "approval_result",
  "contract_signed",
  "contract_expiring",
  "renewal_request",
  "renewal_approved",
  "renewal_rejected",
  "approval_needed",
  "contract_cancelled",
  "test",
] as const;
export type MailTemplate = (typeof mailTemplates)[number];
export type MailPayload = { name?: string; message?: string; contractId?: string; token?: string };
const headings: Record<MailTemplate, string> = {
  email_confirmation: "Confirma tu email en SIMAUD",
  password_reset: "Restablece tu contraseña de SIMAUD",
  invitation: "Te invitamos a SIMAUD",
  signature_required: "Es tu turno de firmar",
  approval_result: "Resultado de la revisión del contrato",
  contract_signed: "Contrato activado: todas las firmas completadas",
  contract_expiring: "Aviso de vencimiento de contrato",
  renewal_request: "Renovación solicitada",
  renewal_approved: "Renovación aprobada",
  renewal_rejected: "Renovación devuelta",
  approval_needed: "Contrato pendiente de aprobación",
  contract_cancelled: "Contrato cancelado",
  test: "Correo de prueba de SIMAUD",
};
function mailLink(template: MailTemplate, payload: MailPayload) {
  const base = env.APP_URL.replace(/\/$/, "");
  if (template === "email_confirmation")
    return base + "/auth/confirmar?token=" + encodeURIComponent(payload.token ?? "");
  if (template === "password_reset" || template === "invitation")
    return base + "/auth/restablecer?token=" + encodeURIComponent(payload.token ?? "");
  if (template === "signature_required") return base + "/app/firmas";
  return (
    base +
    (payload.contractId ? "/app/contratos/" + encodeURIComponent(payload.contractId) : "/app")
  );
}
export function renderMail(template: MailTemplate, payload: MailPayload) {
  const title = headings[template];
  const greeting = payload.name ? "Hola, " + payload.name + "." : "Hola.";
  const message = payload.message ?? title;
  const link = mailLink(template, payload);
  const html = renderLayout(title, greeting, message, link);
  return { html, text: greeting + "\n" + message + "\n" + link };
}
