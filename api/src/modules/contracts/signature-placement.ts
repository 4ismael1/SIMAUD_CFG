import { signaturesMutable } from "./amendment-permissions.js";
import type { FastifyRequest } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { contractSignatories, signatureEvidence } from "../../db/schema.js";
import { plainDocument } from "../../lib/rich-doc/document-pdf.js";
import { storedDocument } from "../../lib/rich-doc/content.js";
import {
  signatureSlotSizes,
  signerSlotIndex,
  type SignatureSlotGeometry,
} from "../../lib/rich-doc/signatures.js";
import { placeSignature, type SignaturePlacement } from "../../lib/signature-placement.js";
import { decodeRenderedText } from "../../lib/pdf.js";
import { storage } from "../../lib/storage.js";
import { canonicalJson } from "../../lib/crypto/canonical.js";
import { contractPdf } from "./pdf.js";
import { recordEvidence } from "./evidence.js";
import * as service from "./service.js";

export function normalizedPlacement(
  contract: service.Contract,
  all: service.Signatory[],
  signerId: string,
  image: Buffer,
  input?: SignaturePlacement,
) {
  const source = contract.generatedContent ?? contract.content;
  const document =
    contract.contentFormat === "plain"
      ? plainDocument(decodeRenderedText(source))
      : storedDocument(source);
  const slot = signatureSlotSizes(document, all)[
    signerSlotIndex(
      document,
      all,
      all.findIndex((signer) => signer.id === signerId),
    )
  ]!;
  return placeSignature(
    image.readUInt32BE(16),
    image.readUInt32BE(20),
    slot.width,
    slot.height,
    input,
  ).placement;
}

export async function ownSignatureSlot(
  connection: Parameters<typeof contractPdf>[0],
  contract: service.Contract,
  all: service.Signatory[],
  userId: string,
) {
  const index = all.findIndex((signer) => signer.userId === userId);
  if (index < 0) return null;
  // The box is only used to place or adjust one's signature, which is possible only while signing is
  // open. Measuring it lays out the whole PDF (0.4-1.4 s on the server), so skip it otherwise.
  if (!signaturesMutable(contract)) return null;
  // Same document and same signer texts give the same layout: reuse the measurement.
  const key = JSON.stringify([
    contract.id,
    contract.currentVersion,
    contract.generatedContent ?? contract.content,
    all.map((signer) => [signer.id, signer.name, signer.cedula, signer.signedAt, signer.slotIndex]),
    index,
  ]);
  const cached = slotCache.get(key);
  if (cached !== undefined) return cached;
  const geometry = await measureSlot(connection, contract, all, index);
  if (slotCache.size >= SLOT_CACHE_SIZE) slotCache.delete(slotCache.keys().next().value!);
  slotCache.set(key, geometry);
  return geometry;
}

const SLOT_CACHE_SIZE = 200;
const slotCache = new Map<string, SignatureSlotGeometry | null>();

async function measureSlot(
  connection: Parameters<typeof contractPdf>[0],
  contract: service.Contract,
  all: service.Signatory[],
  index: number,
) {
  const source = contract.generatedContent ?? contract.content;
  const document =
    contract.contentFormat === "plain"
      ? plainDocument(decodeRenderedText(source))
      : storedDocument(source);
  const slotIndex = signerSlotIndex(document, all, index);
  let geometry: SignatureSlotGeometry | null = null;
  await contractPdf(connection, contract, (slot) => {
    if (slot.slotIndex === slotIndex) geometry = slot;
  });
  return geometry;
}

export function assertSignatureMutable(contract: service.Contract) {
  if (!signaturesMutable(contract))
    throw service.conflict("La firma solo se puede modificar antes de la activación.");
}

export async function adjustOwnPlacement(
  request: FastifyRequest,
  id: string,
  input: SignaturePlacement,
) {
  return db.transaction(async (tx) => {
    const contract = await service.getContract(tx, id, true);
    await service.linkSignatories(tx, request.user, id);
    const all = await service.getSignatories(tx, id);
    const me = all.find((signer) => signer.userId === request.user.id);
    if (!me) throw service.notFound();
    assertSignatureMutable(contract);
    if (me.status !== "signed" || !me.signaturePath)
      throw service.conflict("Debes registrar tu firma primero.");
    const [previous] = await tx
      .select()
      .from(signatureEvidence)
      .where(
        and(
          eq(signatureEvidence.signatoryId, me.id),
          eq(signatureEvidence.contractVersion, contract.currentVersion),
        ),
      )
      .orderBy(desc(signatureEvidence.sequence))
      .limit(1);
    if (!previous) throw service.conflict("La firma no tiene evidencia verificable.");
    const image = await storage.get("signatures/" + me.signaturePath);
    const placement = normalizedPlacement(contract, all, me.id, image, input);
    if (canonicalJson(me.placement) === canonicalJson(placement))
      return { message: "Colocación ajustada.", placement };
    await tx
      .update(contractSignatories)
      .set({ placement })
      .where(eq(contractSignatories.id, me.id));
    await recordEvidence(tx, contract, {
      ...previous.payload,
      placement,
      event: "placement_adjusted",
      supersedesEvidenceHash: previous.evidenceHash,
      recordedAt: new Date().toISOString(),
      eventSessionId: request.sessionId!,
      eventIp: request.ip,
      eventUserAgent: request.headers["user-agent"] ?? "",
    });
    await service.record(
      tx,
      request,
      contract,
      "signature_placement_adjusted",
      { placement: me.placement },
      { placement, signatoryId: me.id },
    );
    return { message: "Colocación ajustada.", placement };
  });
}
