import type { FastifyInstance, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { users } from "../../db/schema.js";
import { authenticate } from "../../plugins/auth.js";
import { audit } from "../../lib/audit.js";
import { ApiError } from "../../lib/errors.js";
import { parse } from "./schemas.js";
import { signingDeclaration } from "./evidence.js";

export const fontId = z.enum([
  "herr-von-muellerhoff",
  "great-vibes",
  "mr-dafoe",
  "alex-brush",
  "allura",
  "la-belle-aurore",
  "sacramento",
  "homemade-apple",
]);
export const signatureMethod = z
  .object({
    method: z
      .enum(["typed", "drawn", "uploaded"])
      .optional()
      .transform((value) => value ?? "unknown"),
    fontId: fontId.optional(),
  })
  .superRefine((value, ctx) => {
    if ((value.fontId && value.method !== "typed") || (value.method === "typed" && !value.fontId))
      ctx.addIssue({
        code: "custom",
        message:
          "La firma escrita requiere una fuente válida; los otros métodos no admiten fuente.",
      });
  });
const styleInput = z
  .object({
    text: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .regex(/^[\p{L}\p{M} .’'\-]+$/u)
      .refine((text) => /\p{L}/u.test(text)),
    fontId,
  })
  .strict();

async function getSignatureStyle(userId: string) {
  const [user] = await db
    .select({ style: users.signatureStyle })
    .from(users)
    .where(eq(users.id, userId));
  if (!user?.style) throw new ApiError(404, "NOT_FOUND", "No hay un estilo de firma guardado.");
  return user.style;
}

async function saveSignatureStyle(
  req: FastifyRequest,
  style: typeof users.$inferSelect.signatureStyle,
) {
  await db.transaction(async (tx) => {
    await tx.update(users).set({ signatureStyle: style }).where(eq(users.id, req.user.id));
    await audit(tx, {
      userId: req.user.id,
      action: style ? "signature-style:put" : "signature-style:delete",
      entityType: "user",
      entityId: req.user.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
  });
}

export async function signatureStyleRoutes(app: FastifyInstance) {
  const auth = { preHandler: authenticate };
  app.get("/signature-declaration", async () => ({ version: 1, text: signingDeclaration }));
  app.get("/me/signature-style", auth, (req) => getSignatureStyle(req.user.id));
  for (const method of ["PUT", "DELETE"] as const) {
    app.route({
      method,
      url: "/me/signature-style",
      ...auth,
      handler: async (req) => {
        const style = method === "PUT" ? parse(styleInput, req.body) : null;
        await saveSignatureStyle(req, style);
        return method === "PUT" ? style : { message: "Estilo de firma eliminado." };
      },
    });
  }
}
