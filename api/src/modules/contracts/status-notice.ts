import { and, desc, eq, isNotNull } from "drizzle-orm";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import type { db, Transaction } from "../../db/client.js";
import {
  contractCancellations as cancellations,
  contractRenewals as renewals,
  contracts,
} from "../../db/schema.js";
import type { Contract } from "./service.js";

type Connection = Transaction | typeof db;

/**
 * What the contract's current state means, shown on its page and stamped on every downloaded copy.
 * Without it a cancelled or expired contract downloaded as a PDF looked exactly like a valid one.
 * null while the contract is in force (active / expiring soon): those copies stay untouched.
 */
export interface StatusNotice {
  status: Contract["status"];
  /** Short word for the stamp: «CANCELADO», «VENCIDO»… */
  stamp: string;
  /** One line for the page and the PDF banner. */
  title: string;
  /** Date of the change (ISO), when the system knows it. */
  at: string | null;
  /** Extra context: reason of the cancellation, contract that replaces it… */
  detail: string | null;
  tone: "danger" | "warning" | "info";
}

const CANCELLATION_REASONS: Record<string, string> = {
  mutual_agreement: "Mutuo acuerdo",
  client_request: "Solicitud de la otra parte",
  breach: "Incumplimiento",
  payment_default: "Falta de pago",
  other: "Otro motivo",
};

/** States before the signatures complete: the document has no legal effect yet. */
const NOT_YET_VALID: Partial<Record<Contract["status"], string>> = {
  draft: "BORRADOR",
  pending_approval: "EN APROBACIÓN",
  rejected: "DEVUELTO",
  pending_signatures: "PENDIENTE DE FIRMAS",
};

export async function statusNotice(
  connection: Connection,
  contract: Contract,
): Promise<StatusNotice | null> {
  switch (contract.status) {
    case "active":
    case "expiring_soon":
      return null;
    case "cancelled": {
      const [cancellation] = await connection
        .select({
          at: cancellations.cancelledAt,
          reason: cancellations.reason,
          description: cancellations.description,
        })
        .from(cancellations)
        .where(and(eq(cancellations.contractId, contract.id), eq(cancellations.status, "approved")))
        .orderBy(desc(cancellations.cancelledAt))
        .limit(1);
      const reason = cancellation ? CANCELLATION_REASONS[cancellation.reason] : null;
      const description = cancellation?.description?.trim();
      return {
        status: contract.status,
        stamp: "CANCELADO",
        title: "Contrato cancelado: ya no tiene efecto.",
        at: cancellation?.at.toISOString() ?? null,
        detail: reason ? `Motivo: ${reason}${description ? ` — ${description}` : ""}.` : null,
        tone: "danger",
      };
    }
    case "expired":
      return {
        status: contract.status,
        stamp: "VENCIDO",
        title: "Contrato vencido: su vigencia terminó.",
        at: contract.endDate ? new Date(contract.endDate + "T12:00:00Z").toISOString() : null,
        detail: null,
        tone: "warning",
      };
    case "renewed": {
      const [renewal] = await connection
        .select({ code: contracts.code })
        .from(renewals)
        .innerJoin(contracts, eq(contracts.id, renewals.newContractId))
        .where(and(eq(renewals.originalContractId, contract.id), isNotNull(renewals.newContractId)))
        .orderBy(desc(renewals.createdAt))
        .limit(1);
      return {
        status: contract.status,
        stamp: "RENOVADO",
        title: "Contrato renovado: lo sustituye el contrato de renovación.",
        at: null,
        detail: renewal?.code ? `Contrato nuevo: ${renewal.code}.` : null,
        tone: "info",
      };
    }
    case "amended": {
      const [amendment] = contract.amendedByContractId
        ? await connection
            .select({ code: contracts.code })
            .from(contracts)
            .where(eq(contracts.id, contract.amendedByContractId))
        : [];
      return {
        status: contract.status,
        stamp: "ENMENDADO",
        title: "Contrato enmendado: rige la versión de la enmienda.",
        at: null,
        detail: amendment?.code ? `Enmienda: ${amendment.code}.` : null,
        tone: "info",
      };
    }
    default: {
      const stamp = NOT_YET_VALID[contract.status] ?? contract.status.toUpperCase();
      return {
        status: contract.status,
        stamp,
        title: "Documento sin validez: aún no está firmado por todas las partes.",
        at: null,
        detail: null,
        tone: "warning",
      };
    }
  }
}

const dateFormat = new Intl.DateTimeFormat("es-DO", {
  timeZone: "America/Santo_Domingo",
  dateStyle: "long",
});

/**
 * Stamps the state on every page: a banner at the top with the explanation and a large, light
 * diagonal word across the page. The signed original is never modified; this is a separate copy.
 */
export async function stampStatus(bytes: Buffer, notice: StatusNotice) {
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const colour =
    notice.tone === "danger"
      ? rgb(0.72, 0.11, 0.11)
      : notice.tone === "warning"
        ? rgb(0.66, 0.38, 0.02)
        : rgb(0.2, 0.33, 0.55);
  const headline = notice.stamp + (notice.at ? ` — ${dateFormat.format(new Date(notice.at))}` : "");
  const line = [notice.title, notice.detail].filter(Boolean).join(" ");

  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    // Diagonal word, sized to cross most of the page.
    const diagonal = Math.hypot(width, height);
    const size = Math.min(
      110,
      (diagonal * 0.62) / Math.max(1, bold.widthOfTextAtSize(notice.stamp, 1)),
    );
    const textWidth = bold.widthOfTextAtSize(notice.stamp, size);
    const angle = Math.atan2(height, width);
    page.drawText(notice.stamp, {
      x: width / 2 - (Math.cos(angle) * textWidth) / 2 + (Math.sin(angle) * size) / 3,
      y: height / 2 - (Math.sin(angle) * textWidth) / 2 - (Math.cos(angle) * size) / 3,
      size,
      font: bold,
      color: colour,
      opacity: 0.12,
      rotate: degrees((angle * 180) / Math.PI),
    });
    // Banner at the top of the page.
    page.drawRectangle({
      x: 0,
      y: height - 34,
      width,
      height: 34,
      color: rgb(1, 1, 1),
      opacity: 0.95,
    });
    page.drawRectangle({ x: 0, y: height - 34, width: 4, height: 34, color: colour });
    page.drawText(headline, { x: 16, y: height - 15, size: 9.5, font: bold, color: colour });
    page.drawText(fit(line, regular, 8, width - 32), {
      x: 16,
      y: height - 27,
      size: 8,
      font: regular,
      color: rgb(0.28, 0.32, 0.38),
    });
  }
  return Buffer.from(await pdf.save());
}

/** Cuts the text with «…» so it fits in one line of the banner. */
function fit(
  text: string,
  font: { widthOfTextAtSize: (t: string, s: number) => number },
  size: number,
  max: number,
) {
  if (font.widthOfTextAtSize(text, size) <= max) return text;
  let cut = text;
  while (cut.length > 1 && font.widthOfTextAtSize(cut + "…", size) > max) cut = cut.slice(0, -1);
  return cut.trimEnd() + "…";
}
