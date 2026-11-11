import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { contracts, contractSignatories as signatories } from "../../db/schema.js";
import { SIGNER_VISIBLE_STATUSES, linkSignatories, type Actor } from "./service.js";
import { summaryColumns } from "./list-summary.js";

export async function signatureInbox(
  actor: Actor,
  query: { status: "pending" | "signed"; page: number; pageSize: number },
) {
  return db.transaction(async (tx) => {
    await linkSignatories(tx, actor);
    // Same rule as canRead: nothing reaches the signatories before it is sent to sign.
    const sentToSign = or(
      inArray(contracts.status, SIGNER_VISIBLE_STATUSES),
      and(
        eq(contracts.status, "rejected"),
        sql`exists (select 1 from contract_signatories declined
          where declined.contract_id = ${contracts.id} and declined.status = 'declined')`,
      ),
    );
    const filter = and(
      eq(signatories.userId, actor.id),
      eq(signatories.status, query.status),
      sentToSign,
    );
    const data = await tx
      .select(summaryColumns(actor))
      .from(contracts)
      .innerJoin(signatories, eq(signatories.contractId, contracts.id))
      .where(filter)
      .orderBy(sql`${contracts.updatedAt} desc`, contracts.id)
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    const [count] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(signatories)
      .innerJoin(contracts, eq(contracts.id, signatories.contractId))
      .where(filter);
    return { data, meta: { page: query.page, pageSize: query.pageSize, total: count!.total } };
  });
}
