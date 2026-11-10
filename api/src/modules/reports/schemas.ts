import { z } from "zod";
import { uuid } from "../contracts/schemas.js";

export const querySchema = z
  .object({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    groupBy: z.enum(["status", "month", "template", "manager", "role", "activity"]).optional(),
    templateId: uuid.optional(),
    managerId: uuid.optional(),
    format: z.enum(["csv", "xlsx", "pdf"]).optional(),
  })
  .strict();
export type Query = z.infer<typeof querySchema>;
