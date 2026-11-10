import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { jobRuns, storageMigrationObjects } from "../../db/schema.js";
import { audit } from "../../lib/audit.js";
import {
  createDriver,
  readStorageState,
  saveStorageState,
  type StorageState,
} from "../../lib/storage-config.js";
import { StorageError, type StorageDriver } from "../../lib/storage-types.js";
import { storageReferences, type StorageReference } from "./storage-references.js";
import { withConfigurationLock, type StorageActor } from "./storage-service.js";

const running = new Set<Promise<void>>();
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
type Summary = { total: number; copied: number; verified: number; failed: number };

async function saveCheckpoint(
  jobId: string,
  key: string,
  values: Pick<typeof storageMigrationObjects.$inferInsert, "size" | "sha256" | "copied">,
) {
  await db
    .insert(storageMigrationObjects)
    .values({ jobId, key, ...values })
    .onConflictDoUpdate({
      target: [storageMigrationObjects.jobId, storageMigrationObjects.key],
      set: values,
    });
}

async function copyReference(
  reference: StorageReference,
  source: StorageDriver,
  target: StorageDriver,
  onCopied: (size: number, sha256: string) => Promise<void>,
) {
  const bytes = await source.get(reference.key);
  const sha256 = hash(bytes);
  if (
    (reference.size !== null && bytes.length !== reference.size) ||
    (reference.sha256 && reference.sha256 !== sha256)
  )
    throw new StorageError(
      "conflict",
      "El archivo de origen no supera la verificación de integridad.",
    );
  if (!(await target.exists(reference.key))) {
    await target.put(reference.key, bytes, { contentType: reference.contentType });
    await onCopied(bytes.length, sha256);
  }
  const received = await target.get(reference.key);
  if (received.length !== bytes.length || hash(received) !== sha256)
    throw new StorageError(
      "conflict",
      "El archivo de destino no supera la verificación de integridad.",
    );
  return { size: bytes.length, sha256 };
}

async function migrateReferences(runId: string, state: StorageState, summary: Summary) {
  const source = createDriver(state.active);
  const target = createDriver(state.pending!);
  const references = await storageReferences();
  summary.total = references.length;
  const checkpoints = await db
    .select()
    .from(storageMigrationObjects)
    .where(eq(storageMigrationObjects.jobId, runId));
  summary.copied = checkpoints.filter((row) => row.copied).length;
  for (const reference of references) {
    try {
      let copied = checkpoints.some((row) => row.key === reference.key && row.copied);
      const result = await copyReference(reference, source, target, async (size, sha256) => {
        await saveCheckpoint(runId, reference.key, { size, sha256, copied: true });
        if (!copied) summary.copied++;
        copied = true;
      });
      await saveCheckpoint(runId, reference.key, { ...result, copied });
      summary.verified++;
    } catch {
      // No paths, response bodies or provider credentials enter job logs.
      summary.failed++;
    }
    await db
      .update(jobRuns)
      .set({ summary: { ...summary } })
      .where(eq(jobRuns.id, runId));
  }
}

async function completeMigration(
  runId: string,
  state: StorageState,
  actor: StorageActor,
  summary: Summary,
) {
  if (summary.failed)
    throw new StorageError(
      "unreachable",
      "La migración tiene archivos fallidos. Corrige el origen o destino y reanuda la tarea.",
    );
  await db.transaction(async (tx) => {
    await saveStorageState(
      {
        active: state.pending!,
        migrating: false,
        retired: [...(state.retired ?? []), state.active],
      },
      tx,
    );
    await audit(tx, {
      ...actor,
      action: "storage:activate",
      entityType: "storage",
      oldValues: { driver: state.active.driver },
      newValues: { driver: state.pending!.driver, jobId: runId },
    });
    await tx
      .update(jobRuns)
      .set({ ok: true, finishedAt: new Date(), summary })
      .where(eq(jobRuns.id, runId));
  });
}

async function executeMigration(
  state: StorageState,
  actor: StorageActor,
  announce: (id: string) => void,
) {
  let runId: string | undefined;
  const summary: Summary = { total: 0, copied: 0, verified: 0, failed: 0 };
  try {
    if (state.migrationJobId) {
      runId = state.migrationJobId;
      await db
        .update(jobRuns)
        .set({ ok: null, finishedAt: null, error: null, summary })
        .where(eq(jobRuns.id, runId));
    } else {
      const [run] = await db
        .insert(jobRuns)
        .values({ name: "storage-migrate", summary })
        .returning();
      runId = run!.id;
    }
    await db.transaction(async (tx) => {
      await saveStorageState({ ...state, migrating: true, migrationJobId: runId }, tx);
      await audit(tx, {
        ...actor,
        action: state.migrationJobId ? "storage:resume" : "storage:migrate",
        entityType: "storage",
        oldValues: { driver: state.active.driver },
        newValues: { driver: state.pending!.driver, jobId: runId },
      });
    });
    announce(runId);
    await migrateReferences(runId, state, summary);
    await completeMigration(runId, state, actor, summary);
  } catch (error) {
    if (runId)
      await db
        .update(jobRuns)
        .set({
          ok: false,
          finishedAt: new Date(),
          summary,
          error:
            error instanceof StorageError
              ? error.message
              : "La migración se interrumpió. Revisa conectividad y reanuda la tarea.",
        })
        .where(eq(jobRuns.id, runId));
    throw error;
  }
}

export function startStorageMigration(actor: StorageActor): Promise<{ jobId: string }> {
  return new Promise((resolve, reject) => {
    const execution = withConfigurationLock(async () => {
      const state = await readStorageState();
      if (!state.pending)
        throw new StorageError("conflict", "Configura primero un proveedor de destino pendiente.");
      await executeMigration(state, actor, (jobId) => resolve({ jobId }));
    }).catch((error: unknown) =>
      reject(
        error instanceof StorageError
          ? error
          : new StorageError(
              "unreachable",
              "No se pudo iniciar o completar la migración. Consulta las tareas del sistema.",
            ),
      ),
    );
    running.add(execution);
    void execution.finally(() => running.delete(execution));
  });
}

export async function waitStorageMigrations() {
  await Promise.allSettled(running);
}
