import { sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { StorageError, validateKey } from "../../lib/storage-types.js";

export type StorageReference = {
  key: string;
  contentType: string;
  size: number | null;
  sha256: string | null;
};

export async function storageReferences(): Promise<StorageReference[]> {
  // Include redundant references and historical rows, even if a files row is absent.
  const result = await db.execute<StorageReference>(sql`
    select case kind when 'avatar' then 'avatars/' when 'signature' then 'signatures/' when 'export' then 'exports/' end || path as key,
      mime as "contentType", size::float8 as size, null::text as sha256 from files
    union all select 'avatars/' || avatar_path, 'application/octet-stream', null, null from users where avatar_path is not null
    union all select 'signatures/' || signature_path, 'image/png', null, null from contract_signatories where signature_path is not null
    union all select 'contracts/' || signed_pdf_path, 'application/pdf', null, signed_pdf_sha256 from contracts where signed_pdf_path is not null
  `);
  const references = new Map<string, StorageReference>();
  for (const row of result.rows) {
    validateKey(row.key);
    const previous = references.get(row.key);
    if (
      previous &&
      ((previous.size !== null && row.size !== null && previous.size !== row.size) ||
        (previous.sha256 && row.sha256 && previous.sha256 !== row.sha256))
    )
      throw new StorageError(
        "conflict",
        "Hay referencias de archivo incompatibles en la base de datos.",
      );
    references.set(row.key, {
      ...row,
      contentType:
        row.contentType === "application/octet-stream"
          ? (previous?.contentType ?? row.contentType)
          : row.contentType,
      size: row.size ?? previous?.size ?? null,
      sha256: row.sha256 ?? previous?.sha256 ?? null,
    });
  }
  return [...references.values()].sort((left, right) => left.key.localeCompare(right.key));
}
