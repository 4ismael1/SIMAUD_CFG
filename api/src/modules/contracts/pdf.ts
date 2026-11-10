import { sanitizePng } from "../../lib/storage-png.js";
import { storage } from "../../lib/storage.js";
import { createHash, randomBytes } from "node:crypto";
import { pdfAttestation, maskCedula, formatSigningDate } from "./pdf-attestation.js";
import { documentHash } from "../../lib/crypto/canonical.js";
import { sealPdf } from "../../lib/crypto/system-signing.js";
import type { FastifyInstance } from "fastify";
import type { Content } from "pdfmake/interfaces.js";
import { eq } from "drizzle-orm";
import { db, type Transaction } from "../../db/client.js";
import { contracts } from "../../db/schema.js";
import { authenticate } from "../../plugins/auth.js";
import { makePdf, paragraphs, decodeRenderedText } from "../../lib/pdf.js";
import { getSettings } from "../system/settings.js";
import { parse, uuid } from "./schemas.js";
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
): Promise<Buffer> {
  const settings = await getSettings(tx);
  const signatories = await service.getSignatories(tx, contract.id);
  const text = decodeRenderedText(contract.generatedContent ?? contract.content);
  const content: Content[] = [];
  if (settings.institution.logo)
    content.push({
      image:
        "data:image/png;base64," +
        sanitizePng(Buffer.from(settings.institution.logo.split(",")[1]!, "base64")).toString(
          "base64",
        ),
      fit: [90, 50],
      margin: [0, 0, 0, 12],
    });
  content.push(
    { text: settings.institution.name, bold: true, fontSize: 16 },
    {
      text: [settings.institution.rnc, settings.institution.address].filter(Boolean).join(" | "),
      fontSize: 9,
      margin: [0, 4, 0, 20],
    },
    { text: contract.title, bold: true, fontSize: 18, margin: [0, 0, 0, 8] },
    {
      text: contract.code + " | Versión " + contract.currentVersion,
      fontSize: 9,
      color: "#555555",
      margin: [0, 0, 0, 18],
    },
    ...paragraphs(text),
    { text: "Firmas", bold: true, fontSize: 14, margin: [0, 20, 0, 12] },
  );
  for (const signer of signatories) {
    const block: Content[] = [];
    if (signer.signaturePath && /^[0-9a-f-]{36}\.png$/.test(signer.signaturePath)) {
      const bytes = await storage.get("signatures/" + signer.signaturePath);
      block.push({ image: "data:image/png;base64," + bytes.toString("base64"), fit: [150, 65] });
    }
    block.push(
      { text: signer.name, bold: true },
      { text: signer.role + " | Cédula: " + maskCedula(signer.cedula) },
      { text: formatSigningDate(signer.signedAt), fontSize: 9 },
    );
    content.push({ stack: block, unbreakable: true, margin: [0, 0, 0, 16] });
  }
  content.push(...(await pdfAttestation(tx, contract, signatories)));
  return makePdf(content, contract.code);
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
        documentHash(current.generatedContent ?? current.content)
    )
      throw service.conflict("El PDF final es inmutable y no corresponde a esta versión.");
    const bytes = await storage.get("contracts/" + current.signedPdfPath);
    if (contentHashBuffer(bytes) !== current.signedPdfSha256)
      throw service.conflict("El PDF final no supera la verificación de integridad.");
    return;
  }
  const code = randomBytes(10).toString("hex").toUpperCase();
  const verificationCode = "SIM-" + code.match(/.{4}/g)!.join("-");
  const activatedAt = new Date();
  const documentSha256 = documentHash(contract.generatedContent ?? contract.content);
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
    const final = (req.query as { final?: string }).final;
    if (final !== undefined && final !== "true" && final !== "false")
      throw service.invalid("final inválido.");
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
    return reply
      .header("Cache-Control", "private, no-store")
      .header(
        "Content-Disposition",
        'attachment; filename="' + contract.code + (final === "true" ? "-final" : "") + '.pdf"',
      )
      .type("application/pdf")
      .send(bytes);
  });
}
