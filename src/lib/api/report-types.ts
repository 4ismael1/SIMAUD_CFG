import type { ContractStatus, Role } from "./core-types";

/** One indicator for the chosen range and for the range of equal length right before it. */
export interface Comparison<T extends string | number = number> {
  value: T | null;
  previous: T | null;
}

export type ReportGranularity = "week" | "month" | "quarter" | "year";

export interface ReportsOverviewQuery {
  from?: string;
  to?: string;
  /** Comma-separated contract statuses. */
  status?: string;
  templateId?: string;
  managerId?: string;
  granularity?: ReportGranularity;
}

export interface DateRange {
  from: string;
  to: string;
}

export interface TimelinePoint {
  period: string;
  label: string;
  created: number;
  activated: number;
  value: string;
  previousCreated: number | null;
  previousValue: string | null;
}

export interface ManagerReportRow {
  managerId: string;
  name: string;
  count: number;
  value: string;
  activated: number;
  approvalRate: number | null;
  avgApprovalDays: number | null;
}

export interface SupervisorReportRow {
  supervisorId: string;
  name: string;
  decided: number;
  approved: number;
  returned: number;
  avgResponseDays: number | null;
}

export interface TopContractRow {
  id: string;
  code: string;
  title: string;
  status: ContractStatus;
  contractValue: string;
  managerName: string | null;
  createdAt: string;
}

export interface ReportKpis {
  created: Comparison;
  totalValue: Comparison<string>;
  averageValue: Comparison<string>;
  activated: Comparison;
  cancelled: Comparison;
  approvalRate: Comparison;
  avgApprovalDays: Comparison;
  avgSigningDays: Comparison;
}

export interface ReportsOverview {
  range: DateRange;
  previousRange: DateRange;
  kpis: ReportKpis;
  timeline: TimelinePoint[];
  byStatus: { status: ContractStatus; count: number; value: string }[];
  byTemplate: {
    templateId: string | null;
    label: string;
    count: number;
    value: string;
  }[];
  byManager: ManagerReportRow[];
  valueRanges: {
    key: string;
    label: string;
    min: number;
    max: number | null;
    count: number;
    value: string;
  }[];
  topContracts: TopContractRow[];
  approvals: {
    decided: number;
    approved: number;
    returned: number;
    pending: number;
    bySupervisor: SupervisorReportRow[];
  };
  /** Present only for administrators. */
  users?: {
    total: number;
    active: number;
    newInRange: Comparison;
    byRole: { role: Role; count: number }[];
    registrations: { period: string; label: string; count: number }[];
  };
}

export interface ReportFilterOptions {
  managers: { id: string; name: string }[];
  templates: { id: string; title: string }[];
}
