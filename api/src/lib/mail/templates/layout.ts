import { readFileSync } from "node:fs";

export function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );
}

/** Embedded (cid:) so it shows even when the server is not public, e.g. http://localhost. */
export const LOGO_CID = "simaud-logo";
let logo: Buffer | undefined;
export function logoAttachment() {
  logo ??= readFileSync(new URL("../../../../assets/mail/logo.png", import.meta.url));
  return { filename: "simaud.png", content: logo, cid: LOGO_CID, contentType: "image/png" };
}

export type Tone = "brand" | "info" | "success" | "warning" | "danger";
const TONE_COLORS: Record<Tone, { accent: string; soft: string }> = {
  brand: { accent: "#8B2029", soft: "#FBF2F3" },
  info: { accent: "#1D4ED8", soft: "#EFF6FF" },
  success: { accent: "#15803D", soft: "#F0FDF4" },
  warning: { accent: "#B45309", soft: "#FFFBEB" },
  danger: { accent: "#B91C1C", soft: "#FEF2F2" },
};

export interface MailContent {
  /** Hidden preview line shown by mail clients next to the subject. */
  preheader: string;
  tone: Tone;
  /** Short label above the title (e.g. «Firma pendiente»). */
  eyebrow: string;
  title: string;
  greeting: string;
  /** Paragraphs of plain text (escaped). */
  paragraphs: string[];
  /** Contract box: code and title, when the mail is about a contract. */
  contract?: { code?: string; title?: string };
  action: { label: string; url: string };
  /** Small print under the button (expiry of a link, why you got it…). */
  note?: string;
}

/**
 * Table-based layout with inline styles: the only HTML that renders the same in Gmail, Outlook and
 * phone mail apps. Brand colours of the approved design (slate + burgundy), logo at the top.
 */
export function renderLayout(content: MailContent) {
  const tone = TONE_COLORS[content.tone];
  const paragraphs = content.paragraphs
    .map(
      (text) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#334155">${escapeHtml(text)}</p>`,
    )
    .join("");
  const contract =
    content.contract && (content.contract.code || content.contract.title)
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 22px;border:1px solid #E2E8F0;border-radius:10px;background:#F8FAFC">
  <tr><td style="padding:14px 16px">
    ${content.contract.code ? `<div style="font-family:Consolas,Menlo,monospace;font-size:12px;color:#64748B;letter-spacing:.3px">${escapeHtml(content.contract.code)}</div>` : ""}
    ${content.contract.title ? `<div style="margin-top:2px;font-size:15px;font-weight:600;color:#0F172A">${escapeHtml(content.contract.title)}</div>` : ""}
  </td></tr>
</table>`
      : "";
  const url = escapeHtml(content.action.url);
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(content.title)}</title>
</head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0F172A">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(content.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9">
<tr><td align="center" style="padding:28px 12px">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px">
    <tr><td align="center" style="padding:0 0 18px">
      <img src="cid:${LOGO_CID}" width="150" alt="SIMAUD" style="display:block;width:150px;height:auto;border:0">
    </td></tr>
    <tr><td style="background:#FFFFFF;border-radius:14px;border:1px solid #E2E8F0;overflow:hidden">
      <div style="height:4px;background:${tone.accent};font-size:0;line-height:0">&nbsp;</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding:30px 32px 10px">
        <span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${tone.soft};color:${tone.accent};font-size:12px;font-weight:600;letter-spacing:.2px">${escapeHtml(content.eyebrow)}</span>
        <h1 style="margin:14px 0 18px;font-size:22px;line-height:1.3;font-weight:700;color:#0F172A">${escapeHtml(content.title)}</h1>
        <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#334155">${escapeHtml(content.greeting)}</p>
        ${paragraphs}
        ${contract}
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 18px">
          <tr><td style="border-radius:10px;background:#8B2029">
            <a href="${url}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:10px">${escapeHtml(content.action.label)}</a>
          </td></tr>
        </table>
        ${content.note ? `<p style="margin:0 0 18px;font-size:13px;line-height:1.5;color:#64748B">${escapeHtml(content.note)}</p>` : ""}
      </td></tr>
      <tr><td style="padding:16px 32px 26px;border-top:1px solid #F1F5F9">
        <p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:#64748B">¿El botón no funciona? Copia este enlace en tu navegador:</p>
        <p style="margin:0;font-size:12px;line-height:1.5;word-break:break-all"><a href="${url}" style="color:#8B2029">${url}</a></p>
      </td></tr>
      </table>
    </td></tr>
    <tr><td align="center" style="padding:18px 16px 0">
      <p style="margin:0;font-size:12px;line-height:1.6;color:#94A3B8">SIMAUD · Módulo de gestión legal digital<br>Si no esperabas este correo, ignóralo o avisa a la administración. Nunca te pediremos tu contraseña por correo.</p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

/** Plain-text version for clients that do not show HTML (and for spam filters). */
export function renderText(content: MailContent) {
  const lines = [content.title, "", content.greeting, "", ...content.paragraphs];
  if (content.contract?.code || content.contract?.title)
    lines.push("", [content.contract.code, content.contract.title].filter(Boolean).join(" · "));
  if (content.note) lines.push("", content.note);
  lines.push("", "SIMAUD · Si no esperabas este correo, ignóralo o avisa a la administración.");
  // The link goes last, on its own line: easy to find and to copy.
  lines.push("", content.action.label + ":", content.action.url);
  return lines.join("\n");
}
