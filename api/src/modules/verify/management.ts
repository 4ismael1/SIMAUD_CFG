import type { FastifyRequest } from "fastify";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { contracts, verificationCodes } from "../../db/schema.js";
import { generateVerificationCode, normalizeVerificationCode } from "./codes.js";
import * as service from "../contracts/service.js";

export async function rotateVerificationCode(request: FastifyRequest, id: string, reason: string) {
  return db.transaction(async (tx) => {
    const contract = await service.getContract(tx, id, true);
    if (request.user.role !== "admin") throw service.forbidden();
    if (!contract.verificationCode || !contract.signedPdfPath)
      throw service.conflict("El contrato no tiene PDF final.");
    const previousCode = normalizeVerificationCode(contract.verificationCode)!;
    await tx
      .insert(verificationCodes)
      .values({ code: previousCode, contractId: id, legacy: true, revoked: true })
      .onConflictDoNothing();
    await tx
      .update(verificationCodes)
      .set({ revoked: true })
      .where(and(eq(verificationCodes.contractId, id), eq(verificationCodes.code, previousCode)));
    const verificationCode = generateVerificationCode();
    await tx
      .insert(verificationCodes)
      .values({ code: normalizeVerificationCode(verificationCode)!, contractId: id });
    await tx
      .update(contracts)
      .set({ verificationCode, updatedAt: contract.updatedAt })
      .where(eq(contracts.id, id));
    await service.record(
      tx,
      request,
      contract,
      "verification_code_rotated",
      { verificationCode: contract.verificationCode },
      { verificationCode, reason },
    );
    return { message: "Código de verificación regenerado.", verificationCode };
  });
}
