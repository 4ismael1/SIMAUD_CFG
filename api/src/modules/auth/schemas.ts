import { z } from "zod";
import { email, password, profile } from "../users/schemas.js";
export const registerBody = profile.extend({ email, password }); // Unknown keys (including role) are discarded.
export const loginBody = z.object({
  email,
  password: z.string().min(1).max(128),
});
export const emailBody = z.object({ email });
export const tokenBody = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
});
export const resetBody = tokenBody.extend({ password });
