import { inArray, or, sql } from "drizzle-orm";
import { db, type Transaction } from "../../db/client.js";
import { contracts } from "../../db/schema.js";
import type { Contract } from "./service.js";

export async function amendmentChains(connection: Transaction | typeof db, rows: Contract[]) {
  const rootIds = [...new Set(rows.map((row) => row.amendmentRootId ?? row.id))];
  const familyIds = [
    ...new Set(
      rows
        .filter((row) => row.amendmentRootId || row.amendmentSequence)
        .map((row) => row.amendmentRootId ?? row.id),
    ),
  ];
  const related = familyIds.length
    ? await connection
        .select({
          id: contracts.id,
          code: contracts.code,
          status: contracts.status,
          amendsContractId: contracts.amendsContractId,
          amendmentRootId: contracts.amendmentRootId,
          amendedByContractId: contracts.amendedByContractId,
          amendmentNumber: contracts.amendmentNumber,
        })
        .from(contracts)
        .where(or(inArray(contracts.amendmentRootId, familyIds), inArray(contracts.id, familyIds)))
        .orderBy(sql`coalesce(${contracts.amendmentNumber}, 0)`)
    : [];
  const chain = [
    ...related,
    ...rows
      .filter((row) => !familyIds.includes(row.amendmentRootId ?? row.id))
      .map((row) => ({
        id: row.id,
        code: row.code,
        status: row.status,
        amendsContractId: row.amendsContractId,
        amendmentRootId: row.amendmentRootId,
        amendedByContractId: row.amendedByContractId,
        amendmentNumber: row.amendmentNumber,
      })),
  ];
  return new Map(
    rootIds.map((rootId) => [
      rootId,
      chain.filter((row) => (row.amendmentRootId ?? row.id) === rootId),
    ]),
  );
}
