import { z } from "zod";
import { parse, uuid } from "../contracts/schemas.js";
import { authenticate, requireRole } from "../../plugins/auth.js";
import { identityLimit } from "../auth/rate-limit.js";
import { normalizeVerificationCode } from "./codes.js";
import { rotateVerificationCode } from "./management.js";
import type { FastifyInstance } from "fastify";
import { ApiError } from "../../lib/errors.js";
import {
  publicVerification,
  verifyPdfFile,
  verifyPdfHash,
  verifyPdfSha256,
  officialPdfCopy,
} from "./service.js";

export async function verifyRoutes(app: FastifyInstance) {
  app.addHook("onSend", async (request, reply, payload) => {
    if (request.url.startsWith("/api/v1/verify/")) reply.header("Cache-Control", "no-store");
    return payload;
  });
  const limit = { max: 10, timeWindow: "1 minute" };
  app.get("/verify/:code", { config: { rateLimit: limit } }, async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const code = (req.params as { code: string }).code;
    return publicVerification(code);
  });
  app.post("/verify/lookup", { config: { rateLimit: limit } }, async (req) => {
    const input = parse(
      z.strictObject({ sha256: z.string().regex(/^[a-fA-F0-9]{64}$/) }),
      req.body,
    );
    return verifyPdfSha256(input.sha256);
  });
  app.post("/verify/hash", { config: { rateLimit: limit } }, async (req) => {
    const input = parse(
      z.strictObject({ code: z.string().max(200), sha256: z.string().regex(/^[a-fA-F0-9]{64}$/) }),
      req.body,
    );
    return verifyPdfHash(input.code, input.sha256);
  });
  app.get(
    "/verify/:code/pdf",
    {
      config: { rateLimit: { max: 3, timeWindow: "1 minute" } },
      // Private: a session with access to the contract is required (checked in officialPdfCopy).
      preHandler: [
        authenticate,
        identityLimit(
          "verification-copy",
          5,
          (request) =>
            normalizeVerificationCode((request.params as { code: string }).code) ?? "malformed",
        ),
      ],
    },
    async (request, reply) => {
      const bytes = await officialPdfCopy(
        (request.params as { code: string }).code,
        request.ip,
        request.user,
      );
      return reply
        .header("Content-Disposition", 'attachment; filename="copia-verificacion.pdf"')
        .header("X-Content-Type-Options", "nosniff")
        .type("application/pdf")
        .send(bytes);
    },
  );
  app.post(
    "/contracts/:id/verification-code/rotate",
    { preHandler: requireRole("admin") },
    async (request) => {
      const id = parse(uuid, (request.params as { id: string }).id);
      const input = parse(
        z.strictObject({ reason: z.string().trim().min(1).max(2000) }),
        request.body,
      );
      return rotateVerificationCode(request, id, input.reason);
    },
  );
  app.post(
    "/verify/file",
    { bodyLimit: 16 * 1024 * 1024, config: { rateLimit: limit } },
    async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      let bytes: Buffer | undefined;
      for await (const part of req.parts({
        limits: { fileSize: 15 * 1024 * 1024, files: 1, fields: 0, parts: 1 },
      })) {
        if (
          part.type !== "file" ||
          part.fieldname !== "file" ||
          part.mimetype !== "application/pdf"
        )
          throw new ApiError(400, "VALIDATION_ERROR", "Selecciona un archivo PDF.");
        bytes = await part.toBuffer();
      }
      if (!bytes || !bytes.subarray(0, 5).equals(Buffer.from("%PDF-")))
        throw new ApiError(400, "VALIDATION_ERROR", "El archivo no es un PDF válido.");
      return verifyPdfFile(bytes);
    },
  );
}
