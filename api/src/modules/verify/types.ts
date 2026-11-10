export type VerificationStatus =
  "registered" | "revoked" | "amended" | "cancelled" | "not_found" | "integrity_error";
export interface RegisteredVerification {
  status: Exclude<VerificationStatus, "not_found">;
  title: string;
  code: string | null;
  legacy: boolean;
  activatedAt: Date | null;
  revokedAt: Date | null;
  pageCount: number | null;
  signatoryCount: number;
  signatories: { name: string; signedAt: Date | null }[];
  documentSha256: string | null;
  finalPdfSha256: string | null;
  auditChainValid: boolean;
  evidenceChainValid: boolean;
  systemSignatureValid: boolean;
  pdfIntegrityValid: boolean;
  downloadAvailable: boolean;
  amendedBy?: {
    verificationCode: string;
    title: string;
    code: string;
    amendmentNumber: number | null;
  };
}
export type PublicVerification = RegisteredVerification | { status: "not_found" | "revoked" };
