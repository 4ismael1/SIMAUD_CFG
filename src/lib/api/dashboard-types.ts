import type { ContractStatus, SignatoryStatus } from "./core-types";
export interface Metric {
  value: number | string;
  previous: number | string;
  trend: (number | string)[];
}
export interface DashboardContract {
  id: string;
  code: string;
  title: string;
}
export interface DashboardApproval {
  id: string;
  contractId: string;
  code: string;
  title: string;
  requestedAt: string;
  ageDays: string | number;
}
export interface DashboardDecision {
  id: string;
  contractId: string;
  code: string;
  title: string;
  status: "approved" | "rejected";
  comments: string | null;
  reviewedAt: string;
}
export interface DashboardLane extends DashboardContract {
  signed?: number;
  total?: number;
  returnComment?: string | null;
}
export interface DashboardSignature extends DashboardContract {
  status: ContractStatus;
  signatoryId: string;
  signedAt: string | null;
  signatureStatus: SignatoryStatus;
  myTurn: boolean;
}
export interface AdminDashboard {
  attention: {
    pendingApprovals: number;
    oldestPendingDays: number;
    expiring30: number;
    urgentRenewals: number;
  };
  kpis: Record<
    | "activeContracts"
    | "activeValue"
    | "pendingSignatures"
    | "contractsAwaitingSignatures"
    | "avgApprovalDays",
    Metric
  >;
  monthly: { month: string; created: number; signed: number }[];
  byStatus: Record<ContractStatus, number>;
  pendingApprovals: DashboardApproval[];
  upcomingExpirations: (DashboardContract & {
    endDate: string;
    value: string | null;
  })[];
}
export interface SupervisorDashboard {
  kpis: Record<
    | "toReview"
    | "approvedThisMonth"
    | "returnedThisMonth"
    | "returnRate"
    | "myAvgResponseDays",
    number
  >;
  queue: DashboardApproval[];
  templateUsage: { templateId: string; title: string; count: number }[];
  myRecentDecisions: DashboardDecision[];
}
export interface GestorDashboard {
  kpis: {
    myActive: number;
    myValue: string;
    firstTimeApprovalRate: number;
    institutionFirstTimeApprovalRate: number;
    pendingSignatures: number;
  };
  lanes: {
    returned: DashboardLane[];
    drafts: DashboardLane[];
    awaitingSignatures: DashboardLane[];
  };
  recent: (DashboardContract & {
    status: ContractStatus;
    value: string | null;
    updatedAt: string;
  })[];
}
export interface SignerDashboard {
  myTurn: DashboardSignature[];
  waitingOthers: DashboardSignature[];
  signed: DashboardSignature[];
}
export type Dashboard =
  AdminDashboard | SupervisorDashboard | GestorDashboard | SignerDashboard;
