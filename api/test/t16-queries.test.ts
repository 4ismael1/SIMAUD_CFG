import { beforeAll, beforeEach, afterAll, afterEach, expect, it, vi } from "vitest";
import pg from "pg";
import { prepareDatabase, cleanDatabase, db, pool, createUser } from "./helpers.js";
import {
  contracts,
  contractTemplates,
  contractApprovals,
  contractVersions,
} from "../src/db/schema.js";
import { listContracts, contractListQuery } from "../src/modules/contracts/list-queries.js";
import { listApprovals, approvalQuery } from "../src/modules/contracts/approval-queries.js";
import { listEligibleRenewals } from "../src/modules/renewals/queries.js";

beforeAll(prepareDatabase);
beforeEach(cleanDatabase);
afterEach(() => vi.restoreAllMocks());
afterAll(() => pool.end());

it("una página de cien contratos mantiene un presupuesto constante de consultas", async () => {
  const admin = await createUser({ role: "admin" });
  const [template] = await db
    .insert(contractTemplates)
    .values({ title: "Plantilla", content: "Documento" })
    .returning();
  await db.insert(contracts).values(
    Array.from({ length: 101 }, (_, index) => ({
      title: "Contrato " + index,
      content: "Documento",
      createdBy: admin.id,
      templateId: template!.id,
    })),
  );
  const query = vi.spyOn(pg.Client.prototype, "query");
  const response = await listContracts(admin, contractListQuery.parse({ pageSize: 100 }));
  expect(response.data).toHaveLength(100);
  expect(response.meta.total).toBe(101);
  // pg transaction: begin, isolation/mode, timeout, page, count, three decorations, commit.
  expect(query.mock.calls.length).toBeGreaterThanOrEqual(5);
  expect(query.mock.calls.length).toBeLessThanOrEqual(10);
  expect(response.data[0]).not.toHaveProperty("originalCreatedBy");
});

it("pagina aprobaciones y elegibles conservando arrays y carga solo las versiones comparadas", async () => {
  const admin = await createUser({ role: "admin" });
  const inserted = await db
    .insert(contracts)
    .values(
      Array.from({ length: 3 }, (_, index) => ({
        title: "Contrato " + index,
        content: "Documento",
        createdBy: admin.id,
        status: "active" as const,
      })),
    )
    .returning();
  await db.insert(contractApprovals).values(
    inserted.map((contract) => ({
      contractId: contract.id,
      versionNumber: 2,
      requestedBy: admin.id,
      requestedAt: new Date("2026-11-10T12:00:00Z"),
    })),
  );
  await db.insert(contractApprovals).values(
    inserted.map((contract) => ({
      contractId: contract.id,
      versionNumber: 1,
      requestedBy: admin.id,
      status: "rejected" as const,
      requestedAt: new Date("2026-11-01T12:00:00Z"),
    })),
  );
  await db.insert(contractVersions).values(
    inserted.flatMap((contract) =>
      [1, 2, 3].map((versionNumber) => ({
        contractId: contract.id,
        versionNumber,
        content: "Documento " + versionNumber,
      })),
    ),
  );
  const query = vi.spyOn(pg.Client.prototype, "query");
  const first = await listApprovals(
    admin,
    approvalQuery.parse({ pageSize: 2 }),
    new Date("2026-11-10T13:00:00Z"),
  );
  expect(query.mock.calls.length).toBeGreaterThanOrEqual(5);
  expect(query.mock.calls.length).toBeLessThanOrEqual(10);
  const second = await listApprovals(admin, approvalQuery.parse({ page: 2, pageSize: 2 }));
  expect(first).toHaveLength(2);
  expect(second).toHaveLength(1);
  expect(new Set([...first, ...second].map((row) => row.id)).size).toBe(3);
  expect(first[0]).toMatchObject({
    ageSeconds: 3600,
    version: { versionNumber: 2, content: "Documento 2" },
    diff: { previousVersion: 1, contentChanged: true },
  });
  expect(first[0]).not.toHaveProperty("originalRequestedBy");
  expect(await listEligibleRenewals(admin, { page: 1, pageSize: 2 })).toHaveLength(2);
  expect(await listEligibleRenewals(admin, { page: 2, pageSize: 2 })).toHaveLength(1);
});
