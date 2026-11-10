import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { sanitizePng } from "./storage-png.js";

const logoPatch = z
  .object({
    institution: z
      .object({ logo: z.string().max(500000).startsWith("data:image/png;base64,") })
      .passthrough(),
  })
  .passthrough();

// The shared routes scope lets file validation protect the existing settings endpoint too.
export async function validateInstitutionLogo(request: FastifyRequest) {
  if (request.method !== "PATCH" || !request.routeOptions.url?.endsWith("/system/settings")) return;
  const patch = logoPatch.safeParse(request.body);
  if (!patch.success) return;
  const data = Buffer.from(patch.data.institution.logo.split(",")[1]!, "base64");
  patch.data.institution.logo = "data:image/png;base64," + sanitizePng(data).toString("base64");
  request.body = patch.data;
}
