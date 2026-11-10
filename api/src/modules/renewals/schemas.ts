import { z } from "zod";
import { renewalStatus, priority } from "../../db/schema.js";
import { pageInput, uuid } from "../contracts/schemas.js";

export const renewalQuerySchema = pageInput.extend({
  status: z.enum(renewalStatus.enumValues).optional(),
  priority: z.enum(priority.enumValues).optional(),
});

export const renewalInputSchema = z
  .object({
    contractId: uuid,
    proposedStartDate: z.iso.date(),
    proposedEndDate: z.iso.date(),
    proposedValue: z
      .union([
        z.string().regex(/^\d{1,13}(\.\d{1,2})?$/),
        z.number().nonnegative().max(9999999999999.99),
      ])
      .transform(String),
    reason: z.string().trim().min(1).max(5000),
  })
  .strict();
export type RenewalQuery = z.infer<typeof renewalQuerySchema>;
export type RenewalInput = z.infer<typeof renewalInputSchema>;
export type RenewalAction = "approve" | "reject" | "cancel";
