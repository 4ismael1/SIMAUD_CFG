import { beforeAll, beforeEach, afterEach, afterAll, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import ExcelJS from "exceljs";
import { eq } from "drizzle-orm";
import { prepareDatabase, cleanDatabase, db, pool } from "./helpers.js";
import { testApp, loginUser, contractFixture } from "./t09b-helpers.js";
import {
  contractTemplates,
  contractApprovals,
  contractSignatories,
  contractCancellations,
  users,
} from "../src/db/schema.js";
import type { ReportsOverview } from "../src/modules/reports/overview.js";

let app: FastifyInstance;
let admin: Awaited<ReturnType<typeof loginUser>>;
let gestor: typeof admin;
let other: typeof admin;
let supervisor: typeof admin;
let signer: typeof admin;
let templateId: string;
const range = "from=2026-11-01&to=2026-11-30";
beforeAll(prepareDatabase);
afterAll(() => pool.end());
beforeEach(async () => {
  await cleanDatabase();
  app = await testApp();
  admin = await loginUser(app, { role: "admin", name: "Admin" });
  gestor = await loginUser(app, { role: "gestor", name: "Gestor propio" });
  other = await loginUser(app, { role: "gestor", name: "Gestor ajeno" });
  supervisor = await loginUser(app, { role: "supervisor", name: "Supervisión" });
  signer = await loginUser(app);
  await db.update(users).set({ createdAt: new Date("2026-10-10T12:00:00Z") });
  const [template] = await db
    .insert(contractTemplates)
    .values({ title: "Servicios", content: "Documento" })
    .returning();
  templateId = template!.id;
});
afterEach(() => app.close());

async function getOverview(query = range, actor = admin) {
  const response = await app.inject({
    url: "/api/v1/reports/overview?" + query,
    headers: actor.headers,
  });
  expect(response.statusCode, response.body).toBe(200);
  return response.json<ReportsOverview>();
}

async function datedContract(
  creator: string,
  date: string,
  value: string | null,
  status: "active" | "draft" = "active",
) {
  return contractFixture(creator, {
    createdAt: new Date(date),
    contractValue: value,
    templateId,
    status,
  });
}

it("calcula totales, decisiones, activaciones y comparación sin multiplicar contratos por firmantes", async () => {
  const current = await datedContract(gestor.user.id, "2026-11-01T04:00:00Z", "100.25");
  await datedContract(gestor.user.id, "2026-12-01T03:59:59Z", "200.50");
  await datedContract(other.user.id, "2026-11-20T12:00:00Z", null, "draft");
  await datedContract(gestor.user.id, "2026-10-02T04:00:00Z", "50.00");
  await datedContract(gestor.user.id, "2026-12-01T04:00:00Z", "999.00");
  await db.insert(contractSignatories).values(
    [1, 2].map((order) => ({
      contractId: current.id,
      name: "Firmante " + order,
      email: `signer${order}@example.com`,
      role: "client" as const,
      signingOrder: order,
      status: "signed" as const,
      signedAt: new Date(order === 1 ? "2026-11-05T12:00:00Z" : "2026-11-07T12:00:00Z"),
    })),
  );
  await db.insert(contractApprovals).values([
    {
      contractId: current.id,
      versionNumber: 1,
      status: "approved",
      requestedAt: new Date("2026-11-01T12:00:00Z"),
      reviewedAt: new Date("2026-11-03T12:00:00Z"),
      reviewedBy: supervisor.user.id,
    },
    {
      contractId: current.id,
      versionNumber: 1,
      status: "rejected",
      requestedAt: new Date("2026-10-30T12:00:00Z"),
      reviewedAt: new Date("2026-11-01T12:00:00Z"),
      reviewedBy: supervisor.user.id,
    },
    { contractId: current.id, versionNumber: 2, requestedAt: new Date("2026-11-08T12:00:00Z") },
  ]);
  await db.insert(contractCancellations).values({
    contractId: current.id,
    reason: "other",
    description: "Prueba",
    status: "approved",
    approvedAt: new Date("2026-11-20T12:00:00Z"),
  });
  const overview = await getOverview();
  expect(overview.previousRange).toEqual({ from: "2026-10-02", to: "2026-10-31" });
  expect(overview.kpis.created).toEqual({ value: 3, previous: 1 });
  expect(overview.kpis.totalValue).toEqual({ value: 300.75, previous: 50 });
  expect(overview.kpis.averageValue).toEqual({ value: 150.375, previous: 50 });
  expect(overview.kpis.activated).toEqual({ value: 1, previous: 0 });
  expect(overview.kpis.cancelled?.value).toBe(1);
  expect(overview.kpis.approvalRate).toEqual({ value: 0.5, previous: null });
  expect(overview.kpis.avgApprovalDays?.value).toBe(2);
  expect(overview.kpis.avgSigningDays?.value).toBe(4);
  expect(overview.approvals).toMatchObject({ decided: 2, approved: 1, returned: 1, pending: 1 });
  expect(overview.approvals.bySupervisor[0]).toMatchObject({
    supervisorId: supervisor.user.id,
    name: "Supervisión",
    decided: 2,
    avgResponseDays: 2,
  });
  expect(overview.byManager.find((row) => row.managerId === gestor.user.id)).toMatchObject({
    count: 2,
    value: 300.75,
    activated: 1,
    approvalRate: 0.5,
    avgApprovalDays: 2,
  });
  expect(overview.timeline[0]).toMatchObject({
    period: "2026-11",
    label: "nov 2026",
    created: 3,
    activated: 1,
    value: 300.75,
    previousCreated: 1,
    previousValue: 50,
  });
  expect(overview.byTemplate).toEqual([
    { templateId, label: "Servicios", count: 3, value: 300.75 },
  ]);
  expect(overview.byStatus.find((row) => row.status === "active")).toMatchObject({
    count: 2,
    value: 300.75,
  });
  expect(overview.topContracts.map((row) => row.contractValue)).toEqual([200.5, 100.25]);
});

it("filtra conjuntamente estado, plantilla y gestor; users ignora esos filtros y solo se entrega al admin", async () => {
  await datedContract(gestor.user.id, "2026-11-10T12:00:00Z", "50000", "draft");
  await datedContract(other.user.id, "2026-11-10T12:00:00Z", "250000");
  await db
    .update(users)
    .set({ createdAt: new Date("2026-11-02T12:00:00Z") })
    .where(eq(users.id, signer.user.id));
  const query =
    range + `&status=draft,rejected&templateId=${templateId}&managerId=${gestor.user.id}`;
  const overview = await getOverview(query);
  expect(overview.kpis.created?.value).toBe(1);
  expect(overview.byManager).toHaveLength(1);
  expect(overview.valueRanges[1]).toMatchObject({ count: 1, value: 50000 });
  expect("users" in overview && overview.users).toMatchObject({ total: 5, active: 5 });
  expect("users" in overview && overview.users.newInRange).toEqual({ value: 1, previous: 4 });
  expect("users" in overview && overview.users.registrations).toEqual([
    { period: "2026-11", label: "nov 2026", count: 1 },
  ]);
  const supervisorOverview = await getOverview(query, supervisor);
  expect(supervisorOverview).not.toHaveProperty("users");
  const own = await getOverview(range + "&managerId=" + other.user.id, gestor);
  expect(own.kpis.created?.value).toBe(1);
  expect(own.byManager.map((row) => row.managerId)).toEqual([gestor.user.id]);
  expect(own).not.toHaveProperty("users");
  expect(
    (await app.inject({ url: "/api/v1/reports/overview", headers: signer.headers })).statusCode,
  ).toBe(403);
});

it.each(["week", "month", "quarter", "year"])(
  "incluye períodos vacíos para %s y valores null sin decisiones",
  async (granularity) => {
    const overview = await getOverview("from=2026-01-01&to=2026-12-31&granularity=" + granularity);
    expect(overview.timeline.length).toBeGreaterThan(0);
    expect(overview.timeline.every((point) => point.created === 0 && point.value === 0)).toBe(true);
    expect(overview.timeline.map((point) => point.period)).toEqual(
      overview.timeline.map((point) => point.period).sort(),
    );
    expect(overview.kpis.averageValue?.value).toBeNull();
    expect(overview.kpis.approvalRate?.value).toBeNull();
    expect(overview.kpis.avgApprovalDays?.value).toBeNull();
    expect(overview.kpis.avgSigningDays?.value).toBeNull();
  },
);

it("aplica los límites exactos de bandas, excluye importes nulos y limita el top a diez", async () => {
  for (const value of [
    "0",
    "49999.99",
    "50000",
    "249999.99",
    "250000",
    "999999.99",
    "1000000",
    "4999999.99",
    "5000000",
    "9000000",
    "9999999",
    null,
  ])
    await datedContract(gestor.user.id, "2026-11-10T12:00:00Z", value);
  const overview = await getOverview();
  expect(overview.valueRanges.map((row) => row.count)).toEqual([2, 2, 2, 3, 2]);
  expect(overview.topContracts).toHaveLength(10);
  expect(overview.topContracts[0]?.contractValue).toBe(9999999);
});

it("exporta resumen y todas las tablas como CSV, XLSX y PDF con el mismo alcance", async () => {
  await datedContract(gestor.user.id, "2026-11-10T12:00:00Z", "123.45");
  await datedContract(other.user.id, "2026-11-10T12:00:00Z", "987654.32");
  for (const format of ["csv", "xlsx", "pdf"]) {
    const response = await app.inject({
      url: `/api/v1/reports/overview/export?${range}&format=${format}`,
      headers: gestor.headers,
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.headers["content-disposition"]).toContain("overview." + format);
    if (format === "csv") {
      expect(response.body).toContain("123.45");
      expect(response.body).not.toContain("987654.32");
      expect(response.body).not.toContain('"Usuarios"');
    }
    if (format === "xlsx") {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(response.rawPayload as unknown as ExcelJS.Buffer);
      expect(workbook.worksheets).toHaveLength(10);
      expect(workbook.getWorksheet("Gestores")?.getRow(2).values).toContain(123.45);
    }
    if (format === "pdf") expect(response.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
  }
  const response = await app.inject({
    url: `/api/v1/reports/overview/export?${range}&format=xlsx`,
    headers: admin.headers,
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(response.rawPayload as unknown as ExcelJS.Buffer);
  expect(workbook.worksheets).toHaveLength(13);
});

it("ofrece filtros sin datos personales y limita los gestores a su propia identidad", async () => {
  const response = await app.inject({ url: "/api/v1/reports/filters", headers: gestor.headers });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({
    managers: [{ id: gestor.user.id, name: gestor.user.name }],
    templates: [{ id: templateId, title: "Servicios" }],
  });
  const staff = await app.inject({ url: "/api/v1/reports/filters", headers: supervisor.headers });
  expect(staff.json().managers).toHaveLength(3);
  expect(staff.body).not.toContain("email");
  expect(
    (await app.inject({ url: "/api/v1/reports/filters", headers: signer.headers })).statusCode,
  ).toBe(403);
});

it.each([
  "from=2026-11-31",
  "from=2026-12-01&to=2026-11-01",
  "status=unknown",
  "granularity=day",
  "managerId=bad",
  "format=exe",
])("rechaza filtros inválidos: %s", async (query) => {
  expect(
    (await app.inject({ url: "/api/v1/reports/overview?" + query, headers: admin.headers }))
      .statusCode,
  ).toBe(400);
});
