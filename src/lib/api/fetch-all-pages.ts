import { apiFetch, type QueryParams } from './client';

/** Largest page the API accepts for its plain-array lists (approvals, versions, renewal candidates). */
export const ARRAY_PAGE_SIZE = 100;
/** Stops a misbehaving server from looping forever; 50 pages = 5000 rows. */
const MAX_PAGES = 50;

/**
 * Reads every page of an API list that answers with a bare array (no `meta`): asks for full pages
 * and stops at the first short one.
 */
export async function fetchAllPages<T>(path: string, options: { query?: QueryParams; signal?: AbortSignal } = {}): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = await apiFetch<T[]>(path, {
      query: { ...options.query, page, pageSize: ARRAY_PAGE_SIZE },
      signal: options.signal,
    });
    rows.push(...batch);
    if (batch.length < ARRAY_PAGE_SIZE) break;
  }
  return rows;
}
