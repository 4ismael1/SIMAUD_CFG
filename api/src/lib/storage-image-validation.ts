import { setImmediate } from "node:timers/promises";
import { ApiError } from "./errors.js";
import { sanitizePng } from "./storage-png.js";
let processingLogo = false;

export async function sanitizeInstitutionLogo(logo: string) {
  if (processingLogo)
    throw new ApiError(503, "RATE_LIMITED", "Hay una imagen en proceso. Inténtalo de nuevo.");
  processingLogo = true;
  try {
    // Admit one decoded image without retaining a queue of compressed inputs.
    await setImmediate();
    const bytes = Buffer.from(logo.slice("data:image/png;base64,".length), "base64");
    return "data:image/png;base64," + sanitizePng(bytes).toString("base64");
  } finally {
    processingLogo = false;
  }
}
