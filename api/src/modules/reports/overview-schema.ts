import { z } from "zod";
import { contractStatus } from "../../db/schema.js";
import { uuid } from "../contracts/schemas.js";

export const statusList = z
  .string()
  .transform((value) => value.split(","))
  .pipe(z.array(z.enum(contractStatus.enumValues)).min(1).max(contractStatus.enumValues.length));

export const overviewSchema = z
  .object({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    status: statusList.optional(),
    templateId: uuid.optional(),
    managerId: uuid.optional(),
    granularity: z.enum(["week", "month", "quarter", "year"]).default("month"),
    format: z.enum(["csv", "xlsx", "pdf"]).optional(),
  })
  .strict();

export type OverviewQuery = z.infer<typeof overviewSchema>;
export type DateRange = { from: string; to: string };
