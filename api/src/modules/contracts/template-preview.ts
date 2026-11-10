import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireRole } from "../../plugins/auth.js";
import { contentFormatSchema, previewContentInput } from "../../lib/rich-doc/content.js";
import { templatePreviewPdf } from "./template-preview-service.js";
import { parse } from "./schemas.js";

export async function templatePreviewRoutes(app: FastifyInstance) {
  const staff = requireRole("admin", "supervisor", "gestor");
  app.get("/templates/capabilities", { preHandler: staff }, async () => ({
    formats: ["plain", "rich-v1", "rich-v2"],
    paperSizes: ["letter", "legal", "a4"],
    fonts: ["serif", "sans"],
    previewPdf: true,
  }));
  app.post(
    "/templates/preview-pdf",
    {
      bodyLimit: 600 * 1024,
      config: { rateLimit: false },
      preHandler: [
        staff,
        app.rateLimit({
          max: 20,
          timeWindow: "1 minute",
          keyGenerator: (request) => request.user.id,
        }),
      ],
    },
    async (request, reply) => {
      const input = parse(
        z.strictObject({
          contentFormat: contentFormatSchema.default("plain"),
          content: previewContentInput,
          title: z.string().trim().min(1).max(1000),
        }),
        request.body,
      );
      const bytes = await templatePreviewPdf(input, request.user.role);
      return reply.header("cache-control", "no-store").type("application/pdf").send(bytes);
    },
  );
}
