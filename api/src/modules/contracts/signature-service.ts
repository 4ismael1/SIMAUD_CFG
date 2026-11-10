import type { FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
  contracts,
  contractSignatories as signatories,
  files,
  signatureEvidence,
} from "../../db/schema.js";
import { canonicalJson, sha256 } from "../../lib/crypto/canonical.js";
import { storage } from "../../lib/storage.js";
import type { SignaturePlacement } from "../../lib/signature-placement.js";
import { signatureKey, removeSignatureFiles } from "./signature-storage.js";
import { assertSignatureMutable, normalizedPlacement } from "./signature-placement.js";
import { recordEvidence, signingDeclaration } from "./evidence.js";
import { activateRenewalParent } from "../renewals/routes.js";
import { saveFinalPdf, finalPdfName, removeFinalPdf } from "./pdf.js";
import { transition } from "./state-machine.js";
import * as contractService from "./service.js";

export async function registerSignature(
  req: FastifyRequest,
  id: string,
  buffer: Buffer,
  viewed: string,
  method: { method: "typed" | "drawn" | "uploaded" | "unknown"; fontId?: string },
  placementRequest?: SignaturePlacement,
) {
  const name = randomUUID() + ".png";
  let written = false;
  let finalName: string | undefined;
  try {
    await db.transaction(async (tx) => {
      const contract = await contractService.getContract(tx, id, true);
      await contractService.linkSignatories(tx, req.user, id);
      const allSignatories = await contractService.getSignatories(tx, id);
      const me = allSignatories.find((item) => item.userId === req.user.id);
      if (!me) throw contractService.notFound();
      assertSignatureMutable(contract);
      const resigning = me.status === "signed";
      if (!resigning && !contractService.permissions(contract, req.user, allSignatories).sign)
        throw contractService.conflict("No es tu turno de firmar.");
      if (Date.parse(viewed) < contract.updatedAt.getTime())
        throw contractService.invalid("Debes volver a visualizar el contrato actual.");
      const placement = normalizedPlacement(
        contract,
        allSignatories,
        me.id,
        buffer!,
        placementRequest,
      );
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
      if (
        resigning &&
        previous &&
        previous.payload.signatureImageSha256 === sha256(buffer!) &&
        canonicalJson(previous.payload.placement) === canonicalJson(placement) &&
        previous.payload.method === method.method &&
        previous.payload.fontId === (method.fontId ?? null)
      )
        return;
      await storage.put(signatureKey(name), buffer!, { contentType: "image/png" });
      written = true;
      const [file] = await tx
        .insert(files)
        .values({
          ownerId: req.user.id,
          contractId: id,
          kind: "signature",
          path: name,
          mime: "image/png",
          size: buffer!.length,
        })
        .returning();
      const signedAt = new Date();
      await tx
        .update(signatories)
        .set({
          status: "signed",
          placement,
          signaturePath: name,
          signedAt,
          viewedAt: new Date(viewed),
          acceptedDeclarationAt: signedAt,
          ip: req.ip,
          userAgent: req.headers["user-agent"],
        })
        .where(eq(signatories.id, me.id));
      await recordEvidence(tx, contract, {
        placement,
        event: resigning ? "resigned" : "signed",
        supersedesEvidenceHash: previous?.evidenceHash ?? null,
        recordedAt: signedAt.toISOString(),
        signatoryId: me.id,
        userId: req.user.id,
        name: me.name,
        role: me.role,
        signedAt: signedAt.toISOString(),
        viewedAt: new Date(viewed).toISOString(),
        acceptedDeclarationAt: signedAt.toISOString(),
        declaration: signingDeclaration,
        declarationVersion: 1,
        sessionId: req.sessionId!,
        authenticationMethod: "password-session",
        signatureImageSha256: sha256(buffer!),
        signaturePath: name,
        ip: req.ip,
        userAgent: req.headers["user-agent"] ?? "",
        method: method.method,
        fontId: method.fontId ?? null,
      });
      const last = allSignatories.every((item) => item.id === me.id || item.status === "signed");
      const next = last ? transition(contract.status, "sign") : contract.status;
      // Intermediate signatures do not change document freshness.
      if (last)
        await tx
          .update(contracts)
          .set({ status: next, updatedAt: new Date() })
          .where(eq(contracts.id, id));
      if (last) await activateRenewalParent(tx, contract, req.user.id);
      if (last)
        await contractService.notify(
          tx,
          contract,
          "contract_signed",
          [{ userId: contract.createdBy }, ...allSignatories],
          "El contrato ha sido firmado por todos.",
        );
      else if (!resigning) await contractService.nextSigners(tx, contract);
      await contractService.record(
        tx,
        req,
        contract,
        resigning ? "signature_replaced" : "sign",
        { status: contract.status, signatoryId: me.id },
        {
          status: next,
          signatoryId: me.id,
          fileId: file!.id,
          viewedAt: viewed,
          acceptedDeclaration: true,
        },
      );
      if (last) {
        await saveFinalPdf(tx, contract, () => {
          finalName = finalPdfName(contract);
        });
      }
    });
  } catch (error) {
    if (written) await removeSignatureFiles([name]);
    if (finalName) await removeFinalPdf(finalName);
    throw error;
  }
  return { message: "Firma registrada." };
}
