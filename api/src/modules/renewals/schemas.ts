import { zIsoDate, zMoneyInput, zFreeText } from "../../lib/validation/zod.js";
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
    proposedStartDate: zIsoDate,
    proposedEndDate: zIsoDate,
    proposedValue: zMoneyInput,
    reason: zFreeText(1, 5000),
  })
  .strict()
  .refine((input) => input.proposedEndDate > input.proposedStartDate, {
    message: "La fecha final debe ser posterior al inicio.",
    path: ["proposedEndDate"],
  });
export type RenewalQuery = z.infer<typeof renewalQuerySchema>;
export type RenewalInput = z.infer<typeof renewalInputSchema>;
export type RenewalAction = "approve" | "reject" | "cancel";
