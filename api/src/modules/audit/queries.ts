import { sql, type SQL } from "drizzle-orm";
import { db, type Transaction } from "../../db/client.js";
import { ApiError } from "../../lib/errors.js";
import type { AuditFilters } from "./schemas.js";
import { summarize } from "./summary.js";

export type AuditItem = {
  id: string;
  source: "contract" | "admin";
  at: Date;
  area: string;
  action: string;
  actorId: string | null;
  actorName: string;
  targetType: string;
  targetId: string | null;
  targetLabel: string;
  contractId: string | null;
  contractCode: string | null;
};

const feed = sql`(
  select id, 'admin' as source, at, area, action, actor_id as "actorId",
    actor_name as "actorName", target_type as "targetType", target_id as "targetId",
    target_label as "targetLabel", null::uuid as "contractId", null::text as "contractCode"
  from admin_audit_logs
  union all
  select l.id, 'contract', l.created_at, 'contracts', l.action, l.user_id,
    coalesce(u.name, 'Usuario eliminado'), l.entity_type, l.entity_id::text,
    coalesce(c.title, l.new_values->>'title', l.old_values->>'title', 'Contrato eliminado'),
    coalesce(l.chain_contract_id, l.contract_id),
    coalesce(c.code, l.new_values->>'code', l.old_values->>'code')
  from contract_audit_logs l
  left join contracts c on c.id=l.contract_id
  left join users u on u.id=l.user_id
  where coalesce(l.chain_contract_id, l.contract_id) is not null
) as feed`;

function conditions(query: AuditFilters): SQL {
  const filters: SQL[] = [];
  if (query.from)
    filters.push(
      query.from.length === 10
        ? sql`at >= (${query.from}::date::timestamp at time zone 'America/Santo_Domingo')`
        : sql`at >= ${query.from}::timestamptz`,
    );
  if (query.to)
    filters.push(
      query.to.length === 10
        ? sql`at < ((${query.to}::date + 1)::timestamp at time zone 'America/Santo_Domingo')`
        : sql`at <= ${query.to}::timestamptz`,
    );
  if (query.actorId) filters.push(sql`"actorId" = ${query.actorId}::uuid`);
  if (query.area) filters.push(sql`area = ${query.area}`);
  if (query.action) filters.push(sql`action = ${query.action}`);
  if (query.contractId) filters.push(sql`"contractId" = ${query.contractId}::uuid`);
  if (query.q) {
    const search = "%" + query.q.replace(/[\\%_]/g, "\\$&") + "%";
    filters.push(sql`("targetLabel" ilike ${search} or "contractCode" ilike ${search})`);
  }
  return filters.length ? sql`where ${sql.join(filters, sql` and `)}` : sql``;
}

async function rows(tx: Transaction, query: AuditFilters, limit: number, offset = 0) {
  const result = await tx.execute<AuditItem>(sql`
    select * from ${feed} ${conditions(query)}
    order by at desc, source asc, id desc limit ${limit} offset ${offset}
  `);
  return result.rows.map((entry) => ({
    ...entry,
    at: new Date(entry.at),
    summary: summarize(entry.area, entry.action),
  }));
}

export async function listAudit(query: AuditFilters & { page: number; pageSize: number }) {
  return db.transaction(
    async (tx) => {
      const data = await rows(tx, query, query.pageSize, (query.page - 1) * query.pageSize);
      const total = await tx.execute<{ total: number }>(sql`
      select count(*)::int as total from ${feed} ${conditions(query)}
    `);
      return {
        data,
        meta: { page: query.page, pageSize: query.pageSize, total: total.rows[0]!.total },
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

export async function exportAuditRows(query: AuditFilters) {
  return db.transaction(
    async (tx) => {
      const data = await rows(tx, query, 10001);
      if (data.length > 10000)
        throw new ApiError(
          400,
          "VALIDATION_ERROR",
          "La exportación supera 10 000 registros. Acota los filtros.",
        );
      return data;
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
