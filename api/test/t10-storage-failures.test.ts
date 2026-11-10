import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pool, cleanDatabase, prepareDatabase } from "./helpers.js";
import { files, jobRuns, storageMigrationFailures } from "../src/db/schema.js";
import { saveStorageState, readStorageState } from "../src/lib/storage-config.js";
import {
  startStorageMigration,
  waitStorageMigrations,
} from "../src/modules/system/storage-migration.js";
import { withStorageMutation } from "../src/lib/storage.js";

beforeAll(prepareDatabase);
beforeEach(cleanDatabase);
afterAll(() => pool.end());

it("persiste todos los fallos, expone los primeros veinte y libera escrituras conservando pending", async () => {
  const prefix = randomUUID();
  await db.insert(files).values(
    Array.from({ length: 25 }, (_, index) => ({
      kind: "avatar",
      path: prefix + "-" + index + ".png",
      mime: "image/png",
      size: 100,
    })),
  );
  await saveStorageState({
    active: { driver: "disk" },
    pending: {
      driver: "s3",
      endpoint: "https://objects.example.test",
      region: "auto",
      bucket: "private",
      accessKeyId: "test-access",
      secretAccessKey: "test-secret",
      prefix: "",
      forcePathStyle: true,
    },
    migrating: false,
  });
  const { jobId } = await startStorageMigration({});
  await waitStorageMigrations();
  const [job] = await db.select().from(jobRuns).where(eq(jobRuns.id, jobId));
  expect(job!.ok).toBe(false);
  expect(job!.summary).toMatchObject({ failed: 25, verified: 0 });
  const summary = job!.summary as { failures: { key: string; reason: string }[] };
  expect(summary.failures).toHaveLength(20);
  const failures = await db
    .select()
    .from(storageMigrationFailures)
    .where(eq(storageMigrationFailures.jobId, jobId));
  expect(failures).toHaveLength(25);
  expect(
    failures.every(
      (failure) =>
        failure.key.startsWith("avatars/" + prefix) &&
        failure.reason === "No se encontró el objeto.",
    ),
  ).toBe(true);
  expect(await readStorageState()).toMatchObject({
    active: { driver: "disk" },
    pending: { driver: "s3" },
    migrating: false,
    migrationJobId: jobId,
  });
  await expect(withStorageMutation(async () => "escritura permitida")).resolves.toBe(
    "escritura permitida",
  );
});
