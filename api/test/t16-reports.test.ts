import { barrier } from "./t16-barrier.js";
import { beforeAll, beforeEach, afterAll, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { sql } from "drizzle-orm";
import { prepareDatabase, cleanDatabase, db, pool, createUser } from "./helpers.js";
import { contractFixture } from "./t09b-helpers.js";
import { contracts, contractApprovals } from "../src/db/schema.js";
import { reportsOverview } from "../src/modules/reports/overview.js";
import { overviewSchema } from "../src/modules/reports/overview-schema.js";
import { contractReport, userReport, approvalReport } from "../src/modules/reports/service.js";
import { exportReport, exportReportTables } from "../src/modules/reports/export.js";
import { exportOverview } from "../src/modules/reports/overview-export.js";
import { overviewRanges, periods } from "../src/modules/reports/overview-periods.js";
import { daysUntil } from "../src/lib/dates.js";
import { withExportCapacity, withReportRead } from "../src/modules/reports/limits.js";

beforeAll(prepareDatabase);
beforeEach(cleanDatabase);
afterAll(() => pool.end());

it("conserva centavos de sumas grandes y medias redondeadas en JSON, CSV y XLSX", async () => {
  const admin = await createUser({ role: "admin" });
  await db.insert(contracts).values(
    Array.from({ length: 101 }, () => ({
      title: "Importe exacto",
      content: "Documento",
      createdBy: admin.id,
      contractValue: "9999999999999.99",
      createdAt: new Date("2026-11-10T12:00:00Z"),
    })),
  );
  const overview = await reportsOverview(
    admin,
    overviewSchema.parse({ from: "2026-11-01", to: "2026-11-30" }),
  );
  const exact = "1009999999999998.99";
  expect(overview.kpis.totalValue!.value).toBe(exact);
  expect(overview.kpis.averageValue!.value).toBe("9999999999999.99");
  expect(overview.timeline[0]!.value).toBe(exact);
  expect(overview.byManager[0]!.value).toBe(exact);
  expect(overview.byTemplate[0]!.value).toBe(exact);
  expect((await exportOverview(overview, "csv")).toString()).toContain(exact);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await exportOverview(overview, "xlsx")) as unknown as ExcelJS.Buffer);
  expect(workbook.getWorksheet("Gestores")!.getRow(2).values).toContain(exact);
  const legacy = await contractReport(admin, {});
  expect(legacy.totals.value).toBe(exact);
  const legacyBook = new ExcelJS.Workbook();
  await legacyBook.xlsx.load(
    (await exportReport(legacy, "xlsx", "Contratos")) as unknown as ExcelJS.Buffer,
  );
  expect(legacyBook.worksheets[0]!.getRow(2).values).toContain(exact);
});

it("rechaza rangos, filas, celdas y bytes excesivos antes de construir la exportación", async () => {
  expect(() => overviewRanges({ from: "0001-01-01", to: "9999-12-31" })).toThrow("3660");
  expect(() => periods({ from: "0001-01-01", to: "9999-12-31" }, "week")).toThrow("3660");
  await expect(
    exportReportTables(
      { rows: { rows: Array.from({ length: 10001 }, () => ({ value: "1.00" })), totals: {} } },
      "csv",
      "Reporte",
    ),
  ).rejects.toMatchObject({ statusCode: 400 });
  await expect(
    exportReportTables(
      {
        cells: {
          rows: Array.from({ length: 1000 }, () =>
            Object.fromEntries(Array.from({ length: 101 }, (_, index) => [String(index), "dato"])),
          ),
          totals: {},
        },
      },
      "xlsx",
      "Reporte",
    ),
  ).rejects.toMatchObject({ statusCode: 400 });
  await expect(
    exportReportTables(
      { bytes: { rows: [{ text: "x".repeat(5 * 1024 * 1024) }], totals: {} } },
      "csv",
      "Reporte",
    ),
  ).rejects.toMatchObject({ statusCode: 400 });
});

it("limita la concurrencia de lecturas y exportaciones y libera plazas tras fallos", async () => {
  const entered = [barrier(), barrier()];
  const resume = barrier();
  const jobs = entered.map((barrier) =>
    withExportCapacity(async () => {
      barrier.resolve();
      await resume.promise;
    }),
  );
  await Promise.all(entered.map((barrier) => barrier.promise));
  try {
    await expect(withExportCapacity(async () => undefined)).rejects.toMatchObject({
      statusCode: 503,
    });
  } finally {
    resume.resolve();
    await Promise.all(jobs);
  }
  const readEntered = [barrier(), barrier()];
  const readResume = barrier();
  const reads = readEntered.map((barrier) =>
    withReportRead(async (tx) => {
      const timeout = await tx.execute<{ statement_timeout: string }>(sql`show statement_timeout`);
      expect(timeout.rows[0]!.statement_timeout).toBe("10s");
      barrier.resolve();
      await readResume.promise;
    }),
  );
  await Promise.all(readEntered.map((barrier) => barrier.promise));
  try {
    await expect(withReportRead(async () => undefined)).rejects.toMatchObject({ statusCode: 503 });
  } finally {
    readResume.resolve();
    await Promise.all(reads);
  }
  await expect(
    withExportCapacity(async () => {
      throw new Error("Synthetic failure");
    }),
  ).rejects.toThrow();
  await expect(withExportCapacity(async () => true)).resolves.toBe(true);
});

async function setTimeZone(zone: string) {
  const clients = await Promise.all(Array.from({ length: 10 }, () => pool.connect()));
  try {
    await Promise.all(
      clients.map((client) => client.query("select set_config('TimeZone', $1, false)", [zone])),
    );
  } finally {
    clients.forEach((client) => client.release());
  }
}

it("los tres reportes antiguos usan medianoche local con sesiones UTC y Tokyo", async () => {
  const admin = await createUser({ role: "admin", createdAt: new Date("2026-01-01T12:00:00Z") });
  const boundaries = [
    "2026-11-01T03:59:59Z",
    "2026-11-01T04:00:00Z",
    "2026-12-01T03:59:59Z",
    "2026-12-01T04:00:00Z",
  ];
  for (const timestamp of boundaries) {
    await createUser({ createdAt: new Date(timestamp) });
    const contract = await contractFixture(admin.id, { createdAt: new Date(timestamp) });
    await db.insert(contractApprovals).values({
      contractId: contract.id,
      versionNumber: 1,
      status: "approved",
      requestedAt: new Date("2026-10-01T12:00:00Z"),
      reviewedAt: new Date(timestamp),
      reviewedBy: admin.id,
    });
  }
  try {
    for (const zone of ["UTC", "Asia/Tokyo"]) {
      await setTimeZone(zone);
      const range = { from: "2026-11-01", to: "2026-11-30" };
      expect((await contractReport(admin, range)).totals.count).toBe(2);
      expect((await userReport(admin, range)).totals.count).toBe(2);
      expect((await approvalReport(admin, range)).totals.count).toBe(2);
    }
  } finally {
    await setTimeZone("UTC");
  }
});

it("daysToExpiry cambia a medianoche de Santo Domingo al cruzar mes y año", () => {
  expect(daysUntil("2027-01-01", new Date("2027-01-01T01:00:00Z"))).toBe(1);
  expect(daysUntil("2027-01-01", new Date("2027-01-01T03:59:59Z"))).toBe(1);
  expect(daysUntil("2027-01-01", new Date("2027-01-01T04:00:00Z"))).toBe(0);
  expect(daysUntil("2026-12-01", new Date("2026-12-01T00:00:00Z"))).toBe(1);
  expect(daysUntil(null)).toBeNull();
});

it("la búsqueda pública por hash usa el índice parcial con volumen sintético", async () => {
  await db.execute(sql`insert into contracts (title, content, signed_pdf_sha256)
    select 'Contrato sintético', 'Documento', md5(value::text) || md5(value::text)
    from generate_series(1, 5000) value`);
  await db.execute(sql`analyze contracts`);
  const plan = await db.execute(
    sql`explain (format json) select id from contracts where signed_pdf_sha256 = ${"a".repeat(64)}`,
  );
  expect(JSON.stringify(plan.rows)).toContain("contracts_signed_pdf_hash_idx");
});
