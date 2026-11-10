import { z } from "zod";
import { email, password, profile } from "../users/schemas.js";
export const registerBody = profile.omit({ position: true }).extend({ email, password }).strict();
export const loginBody = z
  .object({
    email,
    password: z.string().min(1).max(128),
  })
  .strict();
export const emailBody = z.object({ email }).strict();
export const tokenBody = z
  .object({
    token: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const resetBody = tokenBody.extend({ password });
