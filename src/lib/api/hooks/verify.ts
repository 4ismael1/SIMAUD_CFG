import { useMutation, useQuery } from '@tanstack/react-query';
import { apiFetch } from '../client';

/**
 * Public verification of a signed contract (T10, reworked in T18). A code alone only proves that a
 * contract with that code is registered and gives data to compare; authenticity of a document is
 * proven by comparing the file's SHA-256 (computed in the browser) with the sealed original.
 * No session needed; the API masks personal data.
 */

export type VerificationStatus = 'registered' | 'revoked' | 'cancelled' | 'integrity_error' | 'not_found';

export interface VerificationResult {
  status: VerificationStatus;
  /** Older SIM-… codes: still resolve, but never allow downloading the official copy. */
  legacy?: boolean;
  downloadAvailable?: boolean;
  pageCount?: number | null;
  title?: string;
  code?: string | null;
  activatedAt?: string | null;
  revokedAt?: string | null;
  signatoryCount?: number;
  signatories?: { name: string; signedAt: string | null }[];
  documentSha256?: string | null;
  finalPdfSha256?: string | null;
  auditChainValid?: boolean;
  evidenceChainValid?: boolean;
  systemSignatureValid?: boolean;
  pdfIntegrityValid?: boolean;
}

export interface HashVerificationResult {
  match: boolean;
  status: VerificationStatus;
}

export interface FileVerificationResult {
  matches: boolean;
  status: VerificationStatus;
  code?: string;
  systemSignatureValid: boolean;
}

/** Upper case, without spaces or dashes: the API accepts any grouping. */
function compact(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]+/g, '');
}

/** New codes: 16 Crockford base32 symbols (no I, L, O, U). Legacy: SIM + 20 hex digits. */
const NEW_CODE = /^[0-9A-HJKMNP-TV-Z]{16}$/;
const LEGACY_CODE = /^SIM[0-9A-F]{20}$/;

export function isVerificationCode(raw: string): boolean {
  const value = compact(raw);
  return NEW_CODE.test(value) || LEGACY_CODE.test(value);
}

/** Canonical display form: XXXX-XXXX-XXXX-XXXX, or SIM-XXXX-…-XXXX for legacy codes. */
export function normalizeVerificationCode(raw: string): string {
  const value = compact(raw);
  if (LEGACY_CODE.test(value)) return 'SIM-' + value.slice(3).match(/.{4}/g)!.join('-');
  if (NEW_CODE.test(value)) return value.match(/.{4}/g)!.join('-');
  return raw.trim().toUpperCase();
}

/** SHA-256 of the file's exact bytes, in hex; the file never leaves the browser. */
export async function fileSha256(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function useVerification(code: string | undefined) {
  return useQuery({
    queryKey: ['verify', code],
    queryFn: ({ signal }) => apiFetch<VerificationResult>(`/verify/${encodeURIComponent(code ?? '')}`, { signal }),
    enabled: Boolean(code),
    retry: false,
    staleTime: 0,
  });
}

/** Compares a local file with the original of a code, sending only its hash. */
export function useVerifyHash(code: string) {
  return useMutation({
    mutationFn: async (file: File) =>
      apiFetch<HashVerificationResult>('/verify/hash', { method: 'POST', body: { code, sha256: await fileSha256(file) } }),
  });
}

/** Without a code: the server looks the PDF up by its hash (the file is not stored). */
export function useVerifyFile() {
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.set('file', file, file.name);
      return apiFetch<FileVerificationResult>('/verify/file', { method: 'POST', formData });
    },
  });
}
