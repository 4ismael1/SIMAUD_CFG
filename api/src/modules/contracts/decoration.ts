import { inArray, sql } from "drizzle-orm";
import { db, type Transaction } from "../../db/client.js";
import { contractTemplates, contractSignatories, users } from "../../db/schema.js";
import { contentResponse } from "../../lib/rich-doc/content.js";
import { daysUntil } from "../../lib/dates.js";
import type { Contract } from "./service.js";

export async function decorateMany(
  connection: Transaction | typeof db,
  contracts: Contract[],
  now = new Date(),
) {
  if (!contracts.length) return [];
  const signatures = await connection
    .select({
      contractId: contractSignatories.contractId,
      signed: sql<number>`count(*) filter (where ${contractSignatories.status} = 'signed')::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(contractSignatories)
    .where(
      inArray(
        contractSignatories.contractId,
        contracts.map((contract) => contract.id),
      ),
    )
    .groupBy(contractSignatories.contractId);
  const templateIds = contracts.flatMap((contract) =>
    contract.templateId ? [contract.templateId] : [],
  );
  const creatorIds = contracts.flatMap((contract) =>
    contract.createdBy ? [contract.createdBy] : [],
  );
  const templates = templateIds.length
    ? await connection
        .select({ id: contractTemplates.id, title: contractTemplates.title })
        .from(contractTemplates)
        .where(inArray(contractTemplates.id, templateIds))
    : [];
  const creators = creatorIds.length
    ? await connection
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(inArray(users.id, creatorIds))
    : [];
  const countsByContract = new Map(
    signatures.map((row) => [row.contractId, { signed: row.signed, total: row.total }]),
  );
  const templatesById = new Map(templates.map((template) => [template.id, template]));
  const creatorsById = new Map(creators.map((creator) => [creator.id, creator]));
  return contracts.map(({ originalCreatedBy: _origin, ...contract }) => ({
    ...contentResponse(contract),
    template: templatesById.get(contract.templateId ?? "") ?? null,
    creator: creatorsById.get(contract.createdBy ?? "") ?? null,
    signatures: countsByContract.get(contract.id) ?? { signed: 0, total: 0 },
    daysToExpiry: daysUntil(contract.endDate, now),
  }));
}

export async function decorate(
  connection: Transaction | typeof db,
  contract: Contract,
  now = new Date(),
) {
  return (await decorateMany(connection, [contract], now))[0]!;
}
