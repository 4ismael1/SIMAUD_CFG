import { withReportRead } from "../reports/limits.js";
import { and, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import type { Transaction } from "../../db/client.js";
import {
  contracts,
  contractApprovals as approvals,
  contractVersions as versions,
  users,
} from "../../db/schema.js";
import { contentResponse } from "../../lib/rich-doc/content.js";
import { pageInput } from "./schemas.js";
import { decorateMany } from "./decoration.js";
import type { Actor } from "./service.js";

export const approvalQuery = pageInput.extend({
  status: z.enum(["pending", "approved", "rejected"]).default("pending"),
});

export async function getPendingApprovalRequester(tx: Transaction, contractId: string) {
  const [request] = await tx
    .select({ requestedBy: approvals.originalRequestedBy })
    .from(approvals)
    .where(and(eq(approvals.contractId, contractId), eq(approvals.status, "pending")));
  return request?.requestedBy;
}

export async function listApprovals(
  actor: Actor,
  query: z.infer<typeof approvalQuery>,
  now = new Date(),
) {
  return withReportRead(async (tx) => {
    const prior = alias(versions, "prior");
    const rows = await tx
      .select({
        approval: approvals,
        contract: contracts,
        requester: { id: users.id, name: users.name },
        current: versions,
        prior,
      })
      .from(approvals)
      .innerJoin(contracts, eq(contracts.id, approvals.contractId))
      .leftJoin(users, eq(users.id, approvals.requestedBy))
      .leftJoin(
        versions,
        and(
          eq(versions.contractId, contracts.id),
          eq(versions.versionNumber, approvals.versionNumber),
        ),
      )
      .leftJoin(
        prior,
        and(
          eq(prior.contractId, contracts.id),
          sql`${prior.versionNumber} = (
      select a.version_number from contract_approvals a where a.contract_id = ${contracts.id}
      and a.status <> 'pending' and a.requested_at < ${approvals.requestedAt}
      order by a.requested_at desc, a.id limit 1
    )`,
        ),
      )
      .where(
        and(
          eq(approvals.status, query.status),
          actor.role !== "admin" && query.status === "pending"
            ? sql`${contracts.originalCreatedBy} is distinct from ${actor.id}::uuid and ${contracts.createdBy} is distinct from ${actor.id}::uuid and ${approvals.originalRequestedBy} is distinct from ${actor.id}::uuid`
            : undefined,
        ),
      )
      .orderBy(approvals.requestedAt, approvals.id)
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    const decorated = new Map(
      (
        await decorateMany(
          tx,
          rows.map((row) => row.contract),
          now,
        )
      ).map((contract) => [contract.id, contract]),
    );
    return rows.map(
      ({
        approval: { originalRequestedBy: _origin, ...approval },
        contract,
        requester,
        current,
        prior,
      }) => ({
        ...approval,
        contract: decorated.get(contract.id)!,
        requester,
        ageSeconds: Math.floor((now.getTime() - approval.requestedAt.getTime()) / 1000),
        version: current ? contentResponse(current) : null,
        diff:
          prior && current
            ? {
                previousVersion: prior.versionNumber,
                contentChanged: prior.content !== current.content,
                variablesChanged:
                  JSON.stringify(prior.variablesData) !== JSON.stringify(current.variablesData),
                detailsChanged: JSON.stringify(prior.snapshot) !== JSON.stringify(current.snapshot),
              }
            : null,
      }),
    );
  });
}
