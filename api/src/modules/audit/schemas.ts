import { z } from "zod";

export const areas = [
  "contracts",
  "users",
  "settings",
  "templates",
  "variables",
  "storage",
  "auth",
] as const;
const filters = z.object({
  from: z.union([z.iso.date(), z.iso.datetime({ offset: true })]).optional(),
  to: z.union([z.iso.date(), z.iso.datetime({ offset: true })]).optional(),
  actorId: z.uuid().optional(),
  area: z.enum(areas).optional(),
  action: z.string().trim().min(1).max(100).optional(),
  contractId: z.uuid().optional(),
  q: z.string().trim().max(200).optional(),
});
const orderedDates = (query: { from?: string; to?: string }) =>
  !query.from ||
  !query.to ||
  Date.parse(query.from.length === 10 ? query.from + "T00:00:00-04:00" : query.from) <=
    Date.parse(query.to.length === 10 ? query.to + "T23:59:59.999-04:00" : query.to);
export const listQuery = filters
  .extend({
    page: z.coerce.number().int().min(1).max(1000000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine(orderedDates, "El inicio debe ser anterior al fin.");
export const exportQuery = filters
  .extend({ format: z.enum(["csv", "xlsx"]) })
  .refine(orderedDates, "El inicio debe ser anterior al fin.");
export type AuditFilters = z.infer<typeof filters>;
