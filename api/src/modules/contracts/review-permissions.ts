import { inPilot } from "../../lib/pilot.js";
import type { Actor, Contract } from "./service.js";

export function isOwnReview(contract: Contract, actor: Actor, requestedBy?: string | null) {
  return (
    contract.originalCreatedBy === actor.id ||
    contract.createdBy === actor.id ||
    requestedBy === actor.id
  );
}

export function canReview(contract: Contract, actor: Actor, requestedBy?: string | null) {
  // Admins and supervisors review any contract, their own included (recorded as «approved_own»).
  // In pilot mode a supervisor reviews only what they themselves created or sent.
  if (actor.role === "admin") return true;
  if (actor.role !== "supervisor") return false;
  return !inPilot(actor) || isOwnReview(contract, actor, requestedBy);
}
