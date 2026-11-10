import { ApiError } from "../../lib/errors.js";
import { contractStatus } from "../../db/schema.js";
export type Status = (typeof contractStatus.enumValues)[number];
export const transitions: Partial<Record<Status, Partial<Record<string, Status>>>> = {
  draft: { submit: "pending_approval" },
  rejected: { edit: "draft", submit: "pending_approval" },
  pending_approval: { approve: "pending_signatures", reject: "rejected" },
  pending_signatures: { sign: "active", decline: "rejected", cancel: "cancelled" },
  active: { expireSoon: "expiring_soon", cancel: "cancelled", renew: "renewed" },
  expiring_soon: { expire: "expired", cancel: "cancelled", renew: "renewed" },
  expired: { renew: "renewed" },
};
export function transition(status: Status, action: string, previous?: Status | null): Status {
  if (
    status === "cancelled" &&
    action === "uncancel" &&
    previous &&
    ["pending_signatures", "active", "expiring_soon"].includes(previous)
  )
    return previous;
  const next = transitions[status]?.[action];
  if (!next) throw new ApiError(409, "CONFLICT", "Transición de estado no permitida.");
  return next;
}
export function overrideTransition(status: Status, target: Status, previous?: Status | null) {
  if (status === "cancelled") {
    if (transition(status, "uncancel", previous) === target) return target;
    throw new ApiError(409, "CONFLICT", "Transición de estado no permitida.");
  }
  if (!Object.values(transitions[status] ?? {}).includes(target))
    throw new ApiError(409, "CONFLICT", "Transición de estado no permitida.");
  return target;
}
