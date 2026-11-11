import { env } from "../../../config/env.js";
import { logoAttachment, renderLayout, renderText, type MailContent, type Tone } from "./layout.js";

export { escapeHtml } from "./layout.js";

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
  "account_exists",
] as const;
export type MailTemplate = (typeof mailTemplates)[number];
/** `code`/`title`: the contract the mail is about, shown in its own box. */
export type MailPayload = {
  name?: string;
  message?: string;
  contractId?: string;
  token?: string;
  code?: string;
  title?: string;
};

interface TemplateCopy {
  tone: Tone;
  eyebrow: string;
  title: string;
  /** Fixed explanation; the event message (if any) is added after it. */
  intro?: string;
  action: string;
  note?: string;
}

const COPY: Record<MailTemplate, TemplateCopy> = {
  email_confirmation: {
    tone: "brand",
    eyebrow: "Activa tu cuenta",
    title: "Confirma tu correo para empezar",
    intro: "Gracias por registrarte en SIMAUD. Solo falta confirmar que este correo es tuyo.",
    action: "Activar mi cuenta",
    note: "El enlace caduca en 24 horas y solo funciona una vez.",
  },
  password_reset: {
    tone: "brand",
    eyebrow: "Seguridad",
    title: "Restablece tu contraseña",
    intro: "Recibimos una solicitud para cambiar la contraseña de tu cuenta.",
    action: "Elegir una contraseña nueva",
    note: "El enlace caduca en 1 hora y solo funciona una vez. Si no lo pediste tú, ignora este correo: tu contraseña no cambia.",
  },
  invitation: {
    tone: "brand",
    eyebrow: "Invitación",
    title: "Te invitamos a SIMAUD",
    intro: "La administración creó una cuenta para ti. Elige tu contraseña para entrar.",
    action: "Crear mi contraseña",
    note: "El enlace caduca y solo funciona una vez; si caducó, pide otro a la administración.",
  },
  signature_required: {
    tone: "info",
    eyebrow: "Firma pendiente",
    title: "Es tu turno de firmar",
    intro: "Un contrato espera tu firma. Léelo completo y firma desde SIMAUD.",
    action: "Firmar ahora",
  },
  approval_needed: {
    tone: "warning",
    eyebrow: "Aprobación",
    title: "Un contrato espera tu revisión",
    intro: "Revisa el documento y apruébalo o devuélvelo con tus observaciones.",
    action: "Revisar contrato",
  },
  approval_result: {
    tone: "success",
    eyebrow: "Revisión",
    title: "Hay novedades en la revisión de tu contrato",
    action: "Ver contrato",
  },
  contract_signed: {
    tone: "success",
    eyebrow: "Contrato vigente",
    title: "Todas las partes han firmado",
    intro: "El contrato ya está vigente. Puedes descargar el PDF firmado y su constancia.",
    action: "Ver contrato y PDF",
  },
  contract_expiring: {
    tone: "warning",
    eyebrow: "Vencimiento",
    title: "Un contrato está por vencer",
    action: "Ver contrato",
    note: "Si debe continuar, solicita la renovación antes de la fecha de fin.",
  },
  renewal_request: {
    tone: "warning",
    eyebrow: "Renovación",
    title: "Se solicitó una renovación",
    action: "Revisar renovación",
  },
  renewal_approved: {
    tone: "success",
    eyebrow: "Renovación",
    title: "La renovación fue aprobada",
    action: "Ver contrato",
  },
  renewal_rejected: {
    tone: "danger",
    eyebrow: "Renovación",
    title: "La renovación fue devuelta",
    action: "Ver contrato",
  },
  contract_cancelled: {
    tone: "danger",
    eyebrow: "Cancelación",
    title: "Un contrato fue cancelado",
    action: "Ver contrato",
  },
  test: {
    tone: "brand",
    eyebrow: "Prueba",
    title: "El correo de SIMAUD funciona",
    intro: "Si lees esto, la configuración de correo está bien.",
    action: "Abrir SIMAUD",
  },
  account_exists: {
    tone: "brand",
    eyebrow: "Tu cuenta",
    title: "Ya tienes una cuenta en SIMAUD",
    intro:
      "Alguien intentó registrarse con este correo, pero ya existe una cuenta. Si fuiste tú y no recuerdas la contraseña, puedes restablecerla.",
    action: "Restablecer contraseña",
    note: "Si no fuiste tú, puedes ignorar este correo.",
  },
};

function mailLink(template: MailTemplate, payload: MailPayload) {
  const base = env.APP_URL.replace(/\/$/, "");
  if (template === "email_confirmation")
    return base + "/auth/confirmar?token=" + encodeURIComponent(payload.token ?? "");
  if (template === "password_reset" || template === "invitation")
    return base + "/auth/restablecer?token=" + encodeURIComponent(payload.token ?? "");
  if (template === "signature_required")
    return (
      base +
      (payload.contractId
        ? "/app/contratos/" + encodeURIComponent(payload.contractId) + "/firmar"
        : "/app/firmas")
    );
  if (template === "approval_needed") return base + "/app/aprobaciones";
  if (template === "account_exists") return base + "/auth/recuperar";
  if (template === "test") return base;
  return (
    base +
    (payload.contractId ? "/app/contratos/" + encodeURIComponent(payload.contractId) : "/app")
  );
}

export function renderMail(template: MailTemplate, payload: MailPayload) {
  const copy = COPY[template];
  const paragraphs = [copy.intro, payload.message?.trim()].filter(
    (text): text is string => Boolean(text) && text !== copy.title,
  );
  const content: MailContent = {
    preheader: paragraphs[0] ?? copy.title,
    tone: copy.tone,
    eyebrow: copy.eyebrow,
    title: copy.title,
    greeting: payload.name ? "Hola, " + payload.name + ":" : "Hola:",
    paragraphs,
    contract:
      payload.code || payload.title ? { code: payload.code, title: payload.title } : undefined,
    action: { label: copy.action, url: mailLink(template, payload) },
    note: copy.note,
  };
  return {
    html: renderLayout(content),
    text: renderText(content),
    attachments: [logoAttachment()],
  };
}
