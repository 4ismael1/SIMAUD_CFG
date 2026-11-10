import type { ContentFormat, DocumentContent } from "../rich-doc/types";
import type {
  ContractStatus,
  SignatoryRole,
  SignatoryStatus,
  VariableValues,
  ListQuery,
  CancellationReason,
  ApprovalStatus,
} from "./core-types";
export interface SignatoryInput {
  name: string;
  email: string;
  phone?: string;
  cedula?: string;
  role: SignatoryRole;
  signingOrder: number;
}
export interface Signatory extends Omit<SignatoryInput, "phone" | "cedula"> {
  id: string;
  contractId: string;
  userId: string | null;
  phone: string | null;
  cedula: string | null;
  status: SignatoryStatus;
  signaturePath: string | null;
  signatureFileId: string | null;
  signedAt: string | null;
  viewedAt: string | null;
  acceptedDeclarationAt: string | null;
  ip: string | null;
  userAgent: string | null;
}
export interface ContractInput {
  templateId: string;
  title: string;
  variables: VariableValues;
  /** Decimal string (preferred, exact) or number; the API normalizes it. */
  value: number | string;
  startDate: string;
  endDate: string;
  notes?: string | null;
  signatories: SignatoryInput[];
}
export type ContractPatch = Partial<ContractInput> & { content?: string };
export interface Contract {
  id: string;
  code: string;
  title: string;
  status: ContractStatus;
  previousStatus: ContractStatus | null;
  archived: boolean;
  archivedAt: string | null;
  archivedBy: string | null;
  templateId: string | null;
  template: { id: string; title: string } | null;
  createdBy: string | null;
  creator: { id: string; name: string } | null;
  /** Format of content/generatedContent; absent on APIs older than T13 (= plain). */
  contentFormat?: ContentFormat;
  content: DocumentContent;
  generatedContent: DocumentContent;
  variablesData: VariableValues;
  contractValue: string | null;
  currency: string;
  startDate: string | null;
  endDate: string | null;
  currentVersion: number;
  notes: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  parentContractId: string | null;
  renewalType: string | null;
  signedPdfPath?: string | null;
  signedPdfSha256?: string | null;
  signatures: { signed: number; total: number };
  daysToExpiry: number | null;
  createdAt: string;
  updatedAt: string;
}
export type ContractPermissions = Record<
  | "edit"
  | "submit"
  | "approve"
  | "reject"
  | "sign"
  | "cancel"
  | "archive"
  | "delete"
  | "override",
  boolean
> & {
  /** Admin only; arrived with T12a, so an older API omits it. */
  reassign?: boolean;
};
export interface ContractDetail extends Contract {
  signatories: Signatory[];
  can: ContractPermissions;
}
export interface ContractQuery extends ListQuery {
  status?: ContractStatus;
  templateId?: string;
  createdBy?: string;
  expiresBefore?: string;
  archived?: boolean;
}
export type ContractCounts = Record<ContractStatus, number>;
export interface CancelInput {
  reason: CancellationReason;
  description: string;
}
export interface OverrideInput {
  status: ContractStatus;
  reason: string;
}
export interface ContractVersion {
  id: string;
  contractId: string;
  versionNumber: number;
  /** Format of content/generatedContent; absent on APIs older than T13 (= plain). */
  contentFormat?: ContentFormat;
  content: DocumentContent;
  generatedContent: DocumentContent;
  variablesData: VariableValues;
  snapshot: Record<string, unknown>;
  changeSummary: string | null;
  createdBy: string | null;
  createdAt: string;
}
export interface AuditEntry {
  id: string;
  contractId: string | null;
  entityType: string;
  entityId: string | null;
  action: string;
  userId: string | null;
  oldValues: unknown;
  newValues: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}
export interface Approval {
  id: string;
  contractId: string;
  versionNumber: number;
  status: ApprovalStatus;
  requestedBy: string | null;
  requestedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  comments: string | null;
}
export interface ApprovalQueueItem extends Approval {
  contract: Contract;
  requester: { id: string; name: string } | null;
  ageSeconds: number;
  version: ContractVersion | null;
  diff: {
    previousVersion: number;
    contentChanged: boolean;
    variablesChanged: boolean;
    detailsChanged: boolean;
  } | null;
}
/** Lightweight contract row used by inboxes and lists (no document, no personal data of other parties). */
export interface ContractListSummary {
  id: string;
  code: string;
  title: string;
  status: ContractStatus;
  contractValue: string | null;
  currency: string;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  creator: { id: string; name: string } | null;
  signatory: {
    id: string;
    name: string;
    role: SignatoryRole;
    signingOrder: number;
    status: SignatoryStatus;
    signedAt: string | null;
  } | null;
  myTurn: boolean;
  signatures: { signed: number; total: number };
}
export type SignatureInboxItem = ContractListSummary;
export interface SignatureInput {
  signature: Blob;
  acceptedDeclaration: true;
  viewedAt: string;
  /** How the signature was made (T10 evidence); fontId only for typed signatures. */
  method: "typed" | "drawn" | "uploaded";
  fontId?: string;
}
