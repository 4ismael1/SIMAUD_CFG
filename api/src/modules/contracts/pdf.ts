import { generateVerificationCode, normalizeVerificationCode } from "../verify/codes.js";
import type { SignatureSlotGeometry } from "../../lib/rich-doc/signatures.js";
import { storedDocument } from "../../lib/rich-doc/content.js";
import { documentPdf, plainDocument } from "../../lib/rich-doc/document-pdf.js";
import type { PdfSigner } from "../../lib/rich-doc/signatures.js";
import { sanitizePng } from "../../lib/storage-png.js";
import { storage } from "../../lib/storage.js";
import { createHash } from "node:crypto";
import { pdfAttestation } from "./pdf-attestation.js";
import { stampStatus, statusNotice } from "./status-notice.js";
import { contentDocumentHash } from "../../lib/rich-doc/content.js";
import { sealPdf } from "../../lib/crypto/system-signing.js";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db, type Transaction } from "../../db/client.js";
import { contracts, verificationCodes } from "../../db/schema.js";
import { authenticate } from "../../plugins/auth.js";
import { decodeRenderedText } from "../../lib/pdf.js";
import { getSettings } from "../system/settings.js";
import { parse, uuid } from "./schemas.js";
import { z } from "zod";
import * as service from "./service.js";

export const contentHash = (text: string) =>
  createHash("sha256").update(text, "utf8").digest("hex");

export function finalPdfName(contract: service.Contract) {
  return contract.id + "-v" + contract.currentVersion + ".pdf";
}

export async function removeFinalPdf(name: string) {
  if (!/^[0-9a-f-]{36}-v\d+\.pdf$/.test(name)) return;
  await storage.delete("contracts/" + name);
}

export async function contractPdf(
  tx: Transaction | typeof db,
  contract: service.Contract,
  onSignatureSlot?: (geometry: SignatureSlotGeometry) => void,
): Promise<Buffer> {
  const settings = await getSettings(tx);
  const signatories = await service.getSignatories(tx, contract.id);
  const source = contract.generatedContent ?? contract.content;
  const document =
    contract.contentFormat === "plain"
      ? plainDocument(decodeRenderedText(source))
      : storedDocument(source);
  const signers: PdfSigner[] = [];
  for (const signer of signatories) {
    let image: string | undefined;
    if (signer.signaturePath && /^[0-9a-f-]{36}\.png$/.test(signer.signaturePath)) {
      const bytes = await storage.get("signatures/" + signer.signaturePath);
      image = "data:image/png;base64," + bytes.toString("base64");
    }
    signers.push({
      signingOrder: signer.signingOrder,
      roleLabel: signer.roleLabel,
      slotIndex: signer.slotIndex,
      name: signer.name,
      cedula: signer.cedula,
      signedAt: signer.signedAt,
      image,
      placement: signer.placement,
    });
  }
  const logo = settings.institution.logo
    ? "data:image/png;base64," +
      sanitizePng(Buffer.from(settings.institution.logo.split(",")[1]!, "base64")).toString(
        "base64",
      )
    : null;
  return documentPdf(document, contract.title, {
    signers,
    logo,
    onSignatureSlot,
    appendix: [
      {
        stack: await pdfAttestation(tx, contract, signatories),
        font: "Roboto",
        fontSize: 10,
        lineHeight: 1.3,
      },
    ],
  });
}

export async function saveFinalPdf(
  tx: Transaction,
  contract: service.Contract,
  onWritten?: () => void,
) {
  const current = await service.getContract(tx, contract.id, true);
  if (current.signedPdfPath) {
    if (
      current.signedPdfPath !== finalPdfName(current) ||
      current.systemSeal?.payload.documentSha256 !==
        contentDocumentHash(current.generatedContent ?? current.content, current.contentFormat)
    )
      throw service.conflict("El PDF final es inmutable y no corresponde a esta versión.");
    const bytes = await storage.get("contracts/" + current.signedPdfPath);
    if (contentHashBuffer(bytes) !== current.signedPdfSha256)
      throw service.conflict("El PDF final no supera la verificación de integridad.");
    return;
  }
  const verificationCode = generateVerificationCode();
  await tx
    .insert(verificationCodes)
    .values({ code: normalizeVerificationCode(verificationCode)!, contractId: contract.id });
  const activatedAt = new Date();
  const documentSha256 = contentDocumentHash(
    contract.generatedContent ?? contract.content,
    contract.contentFormat,
  );
  const bytes = await contractPdf(tx, { ...current, verificationCode, activatedAt });
  const name = finalPdfName(contract);
  await storage.put("contracts/" + name, bytes, { contentType: "application/pdf" });
  onWritten?.();
  await tx
    .update(contracts)
    .set({
      signedPdfPath: name,
      signedPdfSha256: contentHashBuffer(bytes),
      verificationCode,
      activatedAt,
      documentSha256,
      systemSeal: sealPdf({
        format: "simaud-detached-v1",
        contractId: contract.id,
        contractVersion: contract.currentVersion,
        verificationCode,
        activatedAt: activatedAt.toISOString(),
        documentSha256,
        finalPdfSha256: contentHashBuffer(bytes),
        evidenceHead: current.evidenceHead,
        auditHead: current.auditHead,
      }),
    })
    .where(eq(contracts.id, contract.id));
}
const contentHashBuffer = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

export async function pdfRoutes(app: FastifyInstance) {
  app.get("/contracts/:id/pdf", { preHandler: authenticate }, async (req, reply) => {
    const id = parse(uuid, (req.params as { id: string }).id);
    const contract = await service.getContract(db, id);
    const signatories = await service.getSignatories(db, id);
    if (!service.canRead(contract, req.user, signatories)) throw service.notFound();
    const { final } = parse(
      z.strictObject({ final: z.enum(["true", "false"]).optional() }),
      req.query,
    );
    let bytes: Buffer;
    if (final === "true" || contract.signedPdfPath) {
      if (!contract.signedPdfPath || contract.signedPdfPath !== finalPdfName(contract))
        throw service.notFound();
      try {
        bytes = await storage.get("contracts/" + contract.signedPdfPath);
      } catch {
        throw service.notFound();
      }
      if (createHash("sha256").update(bytes).digest("hex") !== contract.signedPdfSha256)
        throw service.conflict("El PDF final no supera la verificación de integridad.");
    } else bytes = await contractPdf(db, contract);
    // Outside its validity (draft, cancelled, expired…) every copy carries the state in sight, so a
    // download cannot pass for a contract in force. ?final=true still returns the untouched signed
    // original, the file that matches the verification hash.
    const notice = final === "true" ? null : await statusNotice(db, contract);
    if (notice) bytes = await stampStatus(bytes, notice);
    const suffix =
      final === "true"
        ? "-final"
        : notice
          ? "-" + notice.stamp.toLowerCase().replace(/\s+/g, "-")
          : "";
    return reply
      .header("Cache-Control", "private, no-store")
      .header(
        "Content-Disposition",
        'attachment; filename="' +
          contract.code +
          suffix.normalize("NFD").replace(/[\u0300-\u036f]/g, "") +
          '.pdf"',
      )
      .type("application/pdf")
      .send(bytes);
  });
}
