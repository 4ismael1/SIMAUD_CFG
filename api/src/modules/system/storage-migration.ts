import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { jobRuns, storageMigrationObjects, storageMigrationFailures } from "../../db/schema.js";
import { auditStorage as audit } from "../audit/service.js";
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
type Summary = {
  total: number;
  copied: number;
  verified: number;
  failed: number;
  failures: { key: string; reason: string }[];
};

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
  if (reference.key.startsWith("signatures/")) {
    if (!target.encryptLegacySignature)
      throw new StorageError("conflict", "El destino no admite verificación del cifrado.");
    await target.encryptLegacySignature(reference.key, sha256);
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
      await db
        .delete(storageMigrationFailures)
        .where(
          and(
            eq(storageMigrationFailures.jobId, runId),
            eq(storageMigrationFailures.key, reference.key),
          ),
        );
      summary.verified++;
    } catch (error) {
      summary.failed++;
      const reason = failureReason(error);
      await db
        .insert(storageMigrationFailures)
        .values({ jobId: runId, key: reference.key, reason })
        .onConflictDoUpdate({
          target: [storageMigrationFailures.jobId, storageMigrationFailures.key],
          set: { reason },
        });
      if (summary.failures.length < 20) summary.failures.push({ key: reference.key, reason });
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

async function beginMigration(state: StorageState, actor: StorageActor, summary: Summary) {
  return db.transaction(async (tx) => {
    let jobId = state.migrationJobId;
    if (jobId) {
      await tx
        .update(jobRuns)
        .set({ ok: null, finishedAt: null, error: null, summary })
        .where(eq(jobRuns.id, jobId));
    } else {
      const [run] = await tx
        .insert(jobRuns)
        .values({ name: "storage-migrate", summary })
        .returning();
      jobId = run!.id;
    }
    await saveStorageState({ ...state, migrating: true, migrationJobId: jobId }, tx);
    await audit(tx, {
      ...actor,
      action: state.migrationJobId ? "storage:resume" : "storage:migrate",
      entityType: "storage",
      oldValues: { driver: state.active.driver },
      newValues: { driver: state.pending!.driver, jobId },
    });
    return jobId;
  });
}

async function executeMigration(
  state: StorageState,
  actor: StorageActor,
  announce: (id: string) => void,
) {
  let runId: string | undefined;
  const summary: Summary = { total: 0, copied: 0, verified: 0, failed: 0, failures: [] };
  try {
    runId = await beginMigration(state, actor, summary);
    announce(runId);
    await migrateReferences(runId, state, summary);
    await completeMigration(runId, state, actor, summary);
  } catch (error) {
    await db.transaction(async (tx) => {
      await saveStorageState(
        { ...state, migrating: false, migrationJobId: runId ?? state.migrationJobId },
        tx,
      );
      await audit(tx, {
        ...actor,
        action: "storage:failed",
        entityType: "storage",
        newValues: { driver: state.active.driver, jobId: runId },
      });
      if (runId)
        await tx
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
    });
    throw error;
  }
}

function failureReason(error: unknown) {
  if (!(error instanceof StorageError)) return "Error al copiar o verificar el objeto.";
  return {
    missing: "No se encontró el objeto.",
    denied: "Acceso denegado al objeto.",
    unreachable: "Proveedor inaccesible.",
    invalid: "Objeto o configuración inválidos.",
    conflict: "Conflicto de integridad o cifrado del objeto.",
  }[error.reason];
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
