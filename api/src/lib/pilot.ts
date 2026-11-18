import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { settings } from "../db/schema.js";

/**
 * Pilot mode (temporary, switched on by an admin): each supervisor works as if alone in the system.
 * They see and act only on the contracts, templates and variables they created, plus the read-only
 * examples created by the example accounts ticked in Settings.
 */
export interface PilotSettings {
  enabled: boolean;
  /** Accounts whose contracts and templates every supervisor sees as examples. Empty = none. */
  exampleUserIds: string[];
}
export const PILOT_DEFAULTS: PilotSettings = { enabled: false, exampleUserIds: [] };

/** What a supervisor in pilot mode may see besides their own work. */
export interface PilotScope {
  exampleUserIds: string[];
}

let cache: { at: number; value: PilotScope | null } | null = null;
const TTL = 5000;

export function invalidatePilotCache() {
  cache = null;
}

/** The active pilot scope, or null when pilot mode is off. Cached for a few seconds. */
export async function pilotScope(): Promise<PilotScope | null> {
  if (cache && Date.now() - cache.at < TTL) return cache.value;
  const [row] = await db.select().from(settings).where(eq(settings.key, "pilot"));
  const value = (row?.value as Partial<PilotSettings> | undefined) ?? {};
  let scope: PilotScope | null = null;
  if (value.enabled) {
    // Exactly the accounts ticked in Settings: none ticked = no examples (no hidden default).
    scope = { exampleUserIds: Array.isArray(value.exampleUserIds) ? value.exampleUserIds : [] };
  }
  cache = { at: Date.now(), value: scope };
  return scope;
}

/** Minimal shape of the signed-in user these helpers need. */
interface ScopedActor {
  id: string;
  role: string;
  pilot?: PilotScope | null;
}

/** Pilot restrictions apply to supervisors only (admins keep seeing everything). */
export const inPilot = (actor: ScopedActor) => actor.role === "supervisor" && !!actor.pilot;

/** Creators whose contracts the actor may see in pilot mode: themselves and the example accounts. */
export const pilotOwners = (actor: ScopedActor) => [
  actor.id,
  ...(actor.pilot?.exampleUserIds ?? []),
];

/** True when the actor may see something created by `createdBy`. Always true outside pilot mode. */
export function pilotCanSee(actor: ScopedActor, createdBy: string | null | undefined) {
  if (!inPilot(actor)) return true;
  return !!createdBy && pilotOwners(actor).includes(createdBy);
}

/** In pilot mode a supervisor only changes their own work; outside it, no extra restriction. */
export function pilotOwns(actor: ScopedActor, createdBy: string | null | undefined) {
  return !inPilot(actor) || createdBy === actor.id;
}

/** Reports and renewals are limited to the actor's own contracts: gestores always, supervisors in pilot mode. */
export const ownContractsOnly = (actor: ScopedActor) => actor.role === "gestor" || inPilot(actor);

/**
 * Pilot mode: approval requests notify only the contract's creator (who approves it), instead of
 * every admin and supervisor; otherwise 30 students would get each other's notifications and e-mails.
 */
export async function pilotReviewers(
  createdBy: string | null,
): Promise<{ userId: string }[] | null> {
  if (!(await pilotScope())) return null;
  return createdBy ? [{ userId: createdBy }] : [];
}
