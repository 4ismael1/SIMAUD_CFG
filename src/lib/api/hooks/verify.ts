import { useMutation, useQuery } from '@tanstack/react-query';
import { apiFetch } from '../client';

/**
 * Public verification of a signed contract (task T10): by the code printed on the certificate/QR,
 * or by uploading the PDF. No session needed; the API masks personal data.
 */

export type VerificationStatus = 'valid' | 'revoked' | 'invalid' | 'not_found';

export interface VerificationResult {
  status: VerificationStatus;
  title?: string;
  code?: string;
  activatedAt?: string | null;
  revokedAt?: string | null;
  signatoryCount?: number;
  signatories?: { name: string; signedAt: string | null }[];
  documentSha256?: string;
  finalPdfSha256?: string;
  auditChainValid?: boolean;
  evidenceChainValid?: boolean;
  systemSignatureValid?: boolean;
  pdfIntegrityValid?: boolean;
}

export interface FileVerificationResult {
  matches: boolean;
  status: VerificationStatus;
  code?: string;
  systemSignatureValid: boolean;
}

/** SIM-XXXX-XXXX-XXXX-XXXX-XXXX: upper case, spaces removed, dashes kept. */
export function normalizeVerificationCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

export const VERIFICATION_CODE = /^SIM(-[A-Z0-9]{4}){5}$/;

export function useVerification(code: string | undefined) {
  return useQuery({
    queryKey: ['verify', code],
    queryFn: ({ signal }) => apiFetch<VerificationResult>(`/verify/${encodeURIComponent(code ?? '')}`, { signal }),
    enabled: Boolean(code),
    retry: false,
    staleTime: 0,
  });
}

export function useVerifyFile() {
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.set('file', file, file.name);
      return apiFetch<FileVerificationResult>('/verify/file', { method: 'POST', formData });
    },
  });
}
