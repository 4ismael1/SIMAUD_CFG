import type { FastifyInstance } from "fastify";
import { ApiError } from "../../lib/errors.js";
import { publicVerification, verifyPdfFile } from "./service.js";

export async function verifyRoutes(app: FastifyInstance) {
  const limit = { max: 10, timeWindow: "1 minute" };
  app.get("/verify/:code", { config: { rateLimit: limit } }, async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const code = (req.params as { code: string }).code;
    if (!/^SIM-(?:[A-F0-9]{4}-){4}[A-F0-9]{4}$/.test(code)) return { status: "not_found" };
    return publicVerification(code);
  });
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
