import { eq } from "drizzle-orm";
import { db, type Transaction } from "../../db/client.js";
import { contracts, issuedCopies } from "../../db/schema.js";
import { sha256 } from "../../lib/crypto/canonical.js";

/**
 * Remembers the exact bytes of a marked copy the system hands out. Its hash differs from the signed
 * original, so without this record a genuine copy (e.g. one stamped «CANCELADO») could not be told
 * apart from a forged or edited file when someone uploads it to the verification page.
 */
export async function recordIssuedCopy(
  bytes: Buffer,
  input: {
    contractId: string;
    kind: "status" | "verification";
    stamp?: string | null;
    issuedBy?: string | null;
  },
  connection: Transaction | typeof db = db,
) {
  await connection
    .insert(issuedCopies)
    .values({
      sha256: sha256(bytes),
      contractId: input.contractId,
      kind: input.kind,
      stamp: input.stamp ?? null,
      issuedBy: input.issuedBy ?? null,
    })
    .onConflictDoNothing();
}

/** The issued copy with this hash, with the contract it belongs to. */
export async function findIssuedCopy(hash: string) {
  const [row] = await db
    .select({
      kind: issuedCopies.kind,
      stamp: issuedCopies.stamp,
      issuedAt: issuedCopies.issuedAt,
      contract: contracts,
    })
    .from(issuedCopies)
    .innerJoin(contracts, eq(contracts.id, issuedCopies.contractId))
    .where(eq(issuedCopies.sha256, hash));
  return row ?? null;
}
