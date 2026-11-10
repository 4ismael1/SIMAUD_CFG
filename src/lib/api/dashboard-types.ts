import type { ContractStatus, Role, SignatoryStatus } from "./core-types";
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
export interface DashboardExpiration extends DashboardContract {
  endDate: string;
  value: string | null;
}
/** One entry of the contract audit trail, as shown in the panels. */
export interface DashboardActivity {
  id: string;
  at: string;
  action: string;
  actorName: string | null;
  contractId: string | null;
  contractCode: string | null;
  contractTitle: string | null;
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
  upcomingExpirations: DashboardExpiration[];
  /** The fields below arrived with T12a; an older API simply omits them. */
  totals?: {
    users: number;
    newUsersThisMonth: number;
    contracts: number;
    newContractsThisMonth: number;
    totalValue: string;
    averageValue: string | null;
    approvalRate: number | null;
  };
  topManagers?: {
    managerId: string;
    name: string;
    count: number;
    value: string;
  }[];
  usersByRole?: { role: Role; count: number }[];
  recentActivity?: DashboardActivity[];
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
  /** Added by T12a; an older API omits them. */
  catalog?: {
    activeTemplates: number;
    variables: number;
    contractsFromTemplates: number;
  };
  templatesByCategory?: { category: string; count: number }[];
  recentActivity?: DashboardActivity[];
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
  /** Added by T12a; an older API omits them. */
  monthly?: { month: string; created: number; signed: number; value: string }[];
  byStatus?: { status: ContractStatus; count: number }[];
  upcomingExpirations?: DashboardExpiration[];
}
export interface SignerDashboard {
  myTurn: DashboardSignature[];
  waitingOthers: DashboardSignature[];
  signed: DashboardSignature[];
}
export type Dashboard =
  AdminDashboard | SupervisorDashboard | GestorDashboard | SignerDashboard;
