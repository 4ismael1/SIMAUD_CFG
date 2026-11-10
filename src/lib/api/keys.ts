import type { QueryParams } from "./client";
const lists = (domain: string) => [domain, "list"] as const;
const list = (domain: string, query: QueryParams) =>
  [...lists(domain), query] as const;
export const keys = {
  me: ["me"] as const,
  preferences: ["notification-preferences"] as const,
  signatureStyle: ["me", "signature-style"] as const,
  users: {
    all: ["users"] as const,
    lists: lists("users"),
    list: (query: QueryParams) => list("users", query),
    detail: (id: string) => ["users", "detail", id] as const,
    lookup: (cedula: string) => ["users", "lookup", cedula] as const,
  },
  templates: {
    all: ["templates"] as const,
    lists: lists("templates"),
    list: (query: QueryParams) => list("templates", query),
    detail: (id: string) => ["templates", "detail", id] as const,
  },
  variables: ["variables"] as const,
  contracts: {
    all: ["contracts"] as const,
    lists: lists("contracts"),
    list: (query: QueryParams) => list("contracts", query),
    detail: (id: string) => ["contracts", "detail", id] as const,
    counts: ["contracts", "counts"] as const,
    count: (archived: boolean) =>
      ["contracts", "counts", { archived }] as const,
    history: (id: string) => ["contracts", "history", id] as const,
    versions: (id: string) => ["contracts", "history", id, "versions"] as const,
    version: (id: string, version: number) =>
      ["contracts", "history", id, "versions", version] as const,
    audit: (id: string, query: QueryParams) =>
      ["contracts", "history", id, "audit", query] as const,
    approvals: (id: string) =>
      ["contracts", "history", id, "approvals"] as const,
  },
  approvals: {
    all: ["approvals"] as const,
    list: (status: string) => ["approvals", status] as const,
  },
  signatures: {
    all: ["signatures"] as const,
    list: (status: string) => ["signatures", status] as const,
  },
  renewals: {
    all: ["renewals"] as const,
    lists: lists("renewals"),
    list: (query: QueryParams) => list("renewals", query),
    eligible: ["renewals", "eligible"] as const,
  },
  notifications: {
    all: ["notifications"] as const,
    lists: lists("notifications"),
    list: (query: QueryParams) => list("notifications", query),
    unread: ["notifications", "unread-count"] as const,
  },
  dashboard: {
    all: ["dashboard"] as const,
    detail: (months: number) => ["dashboard", months] as const,
  },
  reports: {
    all: ["reports"] as const,
    detail: (type: string, query: QueryParams) =>
      ["reports", type, query] as const,
  },
  settings: ["system", "settings"] as const,
  jobs: ["system", "jobs"] as const,
  storage: ["system", "storage"] as const,
};
