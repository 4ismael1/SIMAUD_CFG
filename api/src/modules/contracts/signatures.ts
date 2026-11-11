import { registerSignature } from "./signature-service.js";
import { signatureKey } from "./signature-storage.js";
export { removeSignatureFiles } from "./signature-storage.js";
import { placementInput } from "../../lib/signature-placement.js";
import { adjustOwnPlacement } from "./signature-placement.js";
import { signatureInbox } from "./signature-inbox.js";
import { signatureMethod } from "./signature-style.js";
import { normalizeSignaturePng } from "../../lib/storage-png.js";
import { storage, withRequestStorageMutation } from "../../lib/storage.js";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { files } from "../../db/schema.js";
import { authenticate } from "../../plugins/auth.js";
import { parse, uuid, pageInput } from "./schemas.js";
import * as contractService from "./service.js";
export async function signatureRoutes(app: FastifyInstance) {
  const auth = { preHandler: authenticate };
  app.get("/me/signatures", auth, async (req) => {
    const query = parse(
      pageInput.extend({ status: z.enum(["pending", "signed"]).default("pending") }),
      req.query,
    );
    return signatureInbox(req.user, query);
  });
  app.post("/contracts/:id/sign", auth, async (req, reply) =>
    withRequestStorageMutation(req, reply, async () => {
      const id = parse(uuid, (req.params as { id: string }).id);
      let buffer: Buffer | undefined;
      let accepted: string | undefined;
      let viewedAt: string | undefined;
      const methodFields: Record<string, string> = {};
      for await (const part of req.parts({
        limits: { fileSize: 500 * 1024, files: 1, fields: 5, parts: 6 },
      })) {
        if (part.type === "file") {
          if (buffer || part.fieldname !== "signature" || part.mimetype !== "image/png")
            throw contractService.invalid("La firma debe ser PNG.");
          buffer = await part.toBuffer();
        } else if (part.fieldname === "acceptedDeclaration" && accepted === undefined)
          accepted = String(part.value);
        else if (part.fieldname === "viewedAt" && viewedAt === undefined)
          viewedAt = String(part.value);
        else if (
          ["method", "fontId", "placement"].includes(part.fieldname) &&
          methodFields[part.fieldname] === undefined
        )
          methodFields[part.fieldname] = String(part.value);
        else throw contractService.invalid("Campo multipart inválido.");
      }
      if (!buffer) throw contractService.invalid("Selecciona una firma PNG.");
      buffer = normalizeSignaturePng(buffer);
      let placementValue: unknown;
      if (methodFields.placement !== undefined) {
        try {
          placementValue = JSON.parse(methodFields.placement);
        } catch {
          throw contractService.invalid("Colocación inválida: envía un objeto JSON.");
        }
        delete methodFields.placement;
      }
      const placementRequest =
        placementValue === undefined ? undefined : parse(placementInput, placementValue);
      const method = parse(signatureMethod, methodFields);
      if (accepted !== "true") throw contractService.invalid("Debes aceptar la declaración.");
      const viewed = parse(z.iso.datetime({ offset: true }), viewedAt);
      if (Date.parse(viewed) > Date.now())
        throw contractService.invalid("viewedAt no puede estar en el futuro.");
      return registerSignature(req, id, buffer, viewed, method, placementRequest);
    }),
  );
  app.patch("/contracts/:id/signatures/me/placement", auth, async (req, reply) => {
    const id = parse(uuid, (req.params as { id: string }).id);
    const input = parse(z.strictObject({ placement: placementInput }), req.body);
    return withRequestStorageMutation(req, reply, () =>
      adjustOwnPlacement(req, id, input.placement),
    );
  });
  app.get("/files/signatures/:id", auth, async (req, reply) => {
    const id = parse(uuid, (req.params as { id: string }).id);
    const [file] = await db
      .select()
      .from(files)
      .where(and(eq(files.id, id), eq(files.kind, "signature")));
    if (!file) throw contractService.notFound();
    if (!file.contractId) throw contractService.notFound();
    const contract = await contractService.getContract(db, file.contractId);
    const all = await contractService.getSignatories(db, contract.id);
    // Same rule as opening the contract (current role, and signatories only once it was sent to sign).
    if (!contractService.canRead(contract, req.user, all)) throw contractService.notFound();
    let bytes: Buffer;
    try {
      bytes = await storage.get(signatureKey(file.path));
    } catch {
      throw contractService.notFound();
    }
    return reply
      .header("Cache-Control", "private, no-store")
      .header("X-Content-Type-Options", "nosniff")
      .type("image/png")
      .send(bytes);
  });
}
