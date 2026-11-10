import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../client";
import { keys } from "../keys";
import type { ApprovalStatus, ApprovalQueueItem } from "../types";
export { useApproveContract, useRejectContract } from "./contracts";
export function useApprovals(status: ApprovalStatus = "pending") {
  return useQuery({
    queryKey: keys.approvals.list(status),
    queryFn: ({ signal }) =>
      apiFetch<ApprovalQueueItem[]>("/approvals", {
        query: { status },
        signal,
      }),
  });
}
