import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { contracts } from "../../db/schema.js";
import { pageInput, uuid } from "./schemas.js";
import { statusList } from "../reports/overview-schema.js";
import { withReportRead } from "../reports/limits.js";
import { invalid, type Actor } from "./service.js";
import { decorateMany } from "./decoration.js";
import { escapeLike, localDateRange } from "../../lib/sql.js";
export const contractListQuery = pageInput.extend({
  status: statusList.optional(),
  q: z.string().trim().max(200).optional(),
  templateId: uuid.optional(),
  createdBy: uuid.optional(),
  expiresBefore: z.iso.date().optional(),
  createdFrom: z.iso.date().optional(),
  createdTo: z.iso.date().optional(),
  archived: z.enum(["true", "false"]).default("false"),
  sort: z
    .enum([
      "updatedAt",
      "-updatedAt",
      "createdAt",
      "-createdAt",
      "title",
      "-title",
      "endDate",
      "-endDate",
      "code",
      "-code",
    ])
    .default("-updatedAt"),
});

export async function listContracts(actor: Actor, query: z.infer<typeof contractListQuery>) {
  return withReportRead(async (tx) => {
    if (query.createdFrom && query.createdTo && query.createdFrom > query.createdTo)
      throw invalid("Rango de fechas inválido.");
    const search = query.q ? "%" + escapeLike(query.q) + "%" : undefined;
    const where = and(
      actor.role === "gestor" ? eq(contracts.createdBy, actor.id) : undefined,
      query.status ? inArray(contracts.status, query.status) : undefined,
      query.templateId ? eq(contracts.templateId, query.templateId) : undefined,
      query.createdBy ? eq(contracts.createdBy, query.createdBy) : undefined,
      eq(contracts.archived, query.archived === "true"),
      query.expiresBefore ? sql`${contracts.endDate}<${query.expiresBefore}` : undefined,
      localDateRange(sql`${contracts.createdAt}`, query.createdFrom, query.createdTo),
      search
        ? sql`(${contracts.title} ilike ${search} OR ${contracts.code} ilike ${search}
          OR ${contracts.clientName} ilike ${search}
          OR exists (select 1 from users manager where manager.id = ${contracts.createdBy} and manager.name ilike ${search})
          OR exists (select 1 from contract_signatories signer where signer.contract_id = ${contracts.id}
            and (signer.name ilike ${search} or signer.cedula ilike ${search})))`
        : undefined,
    );
    const column = {
      updatedAt: contracts.updatedAt,
      createdAt: contracts.createdAt,
      title: contracts.title,
      endDate: contracts.endDate,
      code: contracts.code,
    }[query.sort.replace("-", "")]!;
    const rows = await tx
      .select()
      .from(contracts)
      .where(where)
      .orderBy(sql`${column} ${sql.raw(query.sort.startsWith("-") ? "desc" : "asc")}`, contracts.id)
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    const [count] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(contracts)
      .where(where);
    return {
      data: await decorateMany(tx, rows),
      meta: { page: query.page, pageSize: query.pageSize, total: count!.n },
    };
  });
}
