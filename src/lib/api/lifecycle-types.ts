import type { Contract, ContractListSummary, PageQuery, User } from "./types";
export type Priority = "low" | "medium" | "high" | "urgent";
export type RenewalStatus = "pending" | "approved" | "rejected" | "cancelled";
export interface RenewalInput {
  contractId: string;
  proposedStartDate: string;
  proposedEndDate: string;
  proposedValue: string | number;
  reason: string;
}
export interface Renewal {
  id: string;
  originalContractId: string;
  proposedStartDate: string | null;
  proposedEndDate: string | null;
  proposedValue: string | null;
  proposedChanges: Record<string, unknown>;
  status: RenewalStatus;
  priority: Priority;
  requestedBy: string | null;
  requestedAt: string;
  processedBy: string | null;
  processedAt: string | null;
  gestorResponse: string | null;
  newContractId: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface RenewalListItem extends Renewal {
  contract: ContractListSummary;
  daysToExpiry: number | null;
  currentValue: string | null;
  variationPercent: string | null;
  requester: Pick<User, "id" | "name" | "email"> | null;
}
export type ContractRecord = Omit<
  Contract,
  "template" | "creator" | "signatures" | "daysToExpiry"
>;
export interface RenewalQuery extends PageQuery {
  status?: RenewalStatus;
  priority?: Priority;
}
export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}
export interface NotificationPreferences {
  emailOnSignatureRequired: boolean;
  emailOnApprovalResult: boolean;
  emailOnExpiry: boolean;
}
export interface SystemSettings {
  expiryWarningDays: number;
  expiryNotificationDays: number[];
  institution: {
    name: string;
    rnc: string;
    address: string;
    logo?: string | null;
  };
}
export type JobName = "contract-status" | "expiry-notifications" | "cleanup" | "email-dispatch";
export interface JobRun {
  id: string;
  name: JobName;
  startedAt: string;
  finishedAt: string | null;
  ok: boolean | null;
  summary: Record<string, unknown>;
  error: string | null;
}
export interface JobSummary {
  name: JobName;
  lastRun: JobRun | null;
}
export type JobResult =
  | { skipped: true; reason: string }
  | { skipped: false; summary: Record<string, unknown> };
export interface EventTicket {
  ticket: string;
  expiresIn?: number;
}
export type ReportType = "contracts" | "users" | "approvals";
export interface ReportQuery {
  from?: string;
  to?: string;
  groupBy?: "status" | "month" | "template" | "manager" | "role" | "activity";
  templateId?: string;
  managerId?: string;
}
export type ReportRow = Record<string, string | number | null>;
export interface Report {
  rows: ReportRow[];
  totals: ReportRow;
  byManager?: ReportRow[];
  bySupervisor?: ReportRow[];
}
