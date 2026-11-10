import { beforeAll, beforeEach, afterEach, afterAll, it, expect } from "vitest";
import type { FastifyInstance } from "fastify";
import { createHash, randomUUID } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import { eq, sql } from "drizzle-orm";
import { buildApp } from "../src/app.js";
import { createAccessToken } from "../src/lib/auth/jwt.js";
import { eventBus, afterCommit } from "../src/lib/events.js";
import { runJob, santoDomingoDate } from "../src/jobs/index.js";
import { renewalPriority } from "../src/modules/renewals/routes.js";
import {
  contracts,
  contractSignatories,
  contractRenewals,
  contractTemplates,
  contractVersions,
  contractApprovals,
  notifications,
  users,
  jobRuns,
  files,
  authTokens,
  refreshTokens,
} from "../src/db/schema.js";
import { prepareDatabase, cleanDatabase, db, pool, createUser, authorization } from "./helpers.js";
let app: FastifyInstance;
let admin: Awaited<ReturnType<typeof createUser>>,
  supervisor: typeof admin,
  gestor: typeof admin,
  other: typeof admin,
  signer: typeof admin;
let tokens: Record<string, string>;
let templateId: string;
let mails: { to: string; subject: string; text: string }[];
beforeAll(prepareDatabase);
afterAll(() => pool.end());
beforeEach(async () => {
  await cleanDatabase();
  mails = [];
  app = await buildApp({
    logger: false,
    mailer: async (mail) => {
      mails.push(mail);
    },
  });
  admin = await createUser({ role: "admin" });
  supervisor = await createUser({ role: "supervisor" });
  gestor = await createUser({ role: "gestor" });
  other = await createUser({ role: "gestor" });
  signer = await createUser();
  tokens = {};
  for (const user of [admin, supervisor, gestor, other, signer])
    tokens[user.id] = await createAccessToken(user);
  const [template] = await db
    .insert(contractTemplates)
    .values({ title: "Plantilla", content: "Contrato **de prueba**", variables: [] })
    .returning();
  templateId = template!.id;
});
afterEach(async () => {
  await app.close();
  for (const contract of await db.select().from(contracts))
    if (contract.signedPdfPath)
      await unlink("storage/contracts/" + contract.signedPdfPath).catch(() => {});
  for (const file of await db.select().from(files))
    if (file.kind === "signature") await unlink("storage/signatures/" + file.path).catch(() => {});
});
function request(
  user: typeof admin,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  url: string,
  payload?: object,
) {
  return app.inject({
    method,
    url: "/api/v1" + url,
    headers: authorization(tokens[user.id]!),
    ...(payload ? { payload } : {}),
  });
}
async function contract(overrides: Partial<typeof contracts.$inferInsert> = {}) {
  const [created] = await db
    .insert(contracts)
    .values({
      title: "Contrato propio",
      content: "Contrato **de prueba**",
      generatedContent: "Contrato **de prueba**",
      templateId,
      createdBy: gestor.id,
      status: "active",
      contractValue: "1250.25",
      startDate: "2030-01-01",
      endDate: "2030-06-30",
      ...overrides,
    })
    .returning();
  await db.insert(contractSignatories).values({
    contractId: created!.id,
    name: signer.name,
    email: signer.email,
    userId: signer.id,
    role: "client",
    signingOrder: 1,
  });
  return created!;
}
async function renewal(contractId: string, user = signer) {
  const result = await request(user, "POST", "/renewals", {
    contractId,
    proposedStartDate: "2030-07-01",
    proposedEndDate: "2031-07-01",
    proposedValue: "1500.30",
    reason: "Continuidad del servicio",
  });
  expect(result.statusCode, result.body).toBe(201);
  return result.json();
}
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1XcAAAAASUVORK5CYII=",
  "base64",
);
async function sign(id: string) {
  const boundary = "lifecycle-sign";
  const payload = Buffer.concat([
    Buffer.from(
      "--" +
        boundary +
        '\r\nContent-Disposition: form-data; name="acceptedDeclaration"\r\n\r\ntrue\r\n--' +
        boundary +
        '\r\nContent-Disposition: form-data; name="viewedAt"\r\n\r\n' +
        new Date().toISOString() +
        "\r\n--" +
        boundary +
        '\r\nContent-Disposition: form-data; name="signature"; filename="signature.png"\r\nContent-Type: image/png\r\n\r\n',
    ),
    png,
    Buffer.from("\r\n--" + boundary + "--\r\n"),
  ]);
  return app.inject({
    method: "POST",
    url: "/api/v1/contracts/" + id + "/sign",
    headers: {
      ...authorization(tokens[signer.id]!),
      "content-type": "multipart/form-data; boundary=" + boundary,
    },
    payload,
  });
}
it("aprueba una vez bajo concurrencia; activa hijo, renueva padre y conserva PDF final", async () => {
  const original = await contract();
  const pending = await renewal(original.id);
  const results = await Promise.all([
    request(supervisor, "POST", "/renewals/" + pending.id + "/approve", {}),
    request(admin, "POST", "/renewals/" + pending.id + "/approve", {}),
  ]);
  expect(results.map((result) => result.statusCode).sort()).toEqual([200, 409]);
  const children = await db
    .select()
    .from(contracts)
    .where(eq(contracts.parentContractId, original.id));
  expect(children).toHaveLength(1);
  const child = children[0]!;
  expect(child.status).toBe("draft");
  expect(child.contractValue).toBe("1500.30");
  expect((await db.select().from(contracts).where(eq(contracts.id, original.id)))[0]!.status).toBe(
    "active",
  );
  await db
    .update(contracts)
    .set({ status: "pending_signatures" })
    .where(eq(contracts.id, child.id));
  const result = await sign(child.id);
  expect(result.statusCode, result.body).toBe(200);
  expect((await db.select().from(contracts).where(eq(contracts.id, original.id)))[0]!.status).toBe(
    "renewed",
  );
  const [signed] = await db.select().from(contracts).where(eq(contracts.id, child.id));
  const bytes = await readFile("storage/contracts/" + signed!.signedPdfPath);
  expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(signed!.signedPdfSha256);
  const download = await request(signer, "GET", "/contracts/" + child.id + "/pdf?final=true");
  expect(download.rawPayload).toEqual(bytes);
  expect(
    (await request(other, "GET", "/contracts/" + child.id + "/pdf?final=true")).statusCode,
  ).toBe(404);
});
it("renovaciones filtran pertenencia, fechas, pendientes y variación decimal", async () => {
  const own = await contract();
  const foreign = await contract({ createdBy: other.id, title: "Ajeno" });
  expect(
    (await request(gestor, "GET", "/renewals/eligible"))
      .json()
      .map((row: { id: string }) => row.id),
  ).toEqual([own.id]);
  expect(
    (
      await request(gestor, "POST", "/renewals", {
        contractId: own.id,
        proposedStartDate: "2029-01-01",
        proposedEndDate: "2031-01-01",
        proposedValue: "1",
        reason: "Prueba",
      })
    ).statusCode,
  ).toBe(400);
  const pending = await renewal(own.id);
  expect(
    (
      await request(signer, "POST", "/renewals", {
        contractId: own.id,
        proposedStartDate: "2030-07-01",
        proposedEndDate: "2031-07-01",
        proposedValue: "1",
        reason: "Otra",
      })
    ).statusCode,
  ).toBe(409);
  const rows = (await request(gestor, "GET", "/renewals")).json().data;
  expect(rows).toHaveLength(1);
  expect(rows[0].currentValue).toBe("1250.25");
  expect(rows[0].variationPercent).toBe("20.00");
  expect((await request(other, "GET", "/renewals")).json().data).toEqual([]);
  expect(
    (await request(other, "POST", "/renewals/" + pending.id + "/approve", {})).statusCode,
  ).toBe(403);
  expect(
    (await request(gestor, "POST", "/renewals/" + pending.id + "/cancel", {})).statusCode,
  ).toBe(403);
  expect(
    (await request(signer, "POST", "/renewals/" + pending.id + "/cancel", {})).statusCode,
  ).toBe(200);
  expect(
    (await request(signer, "POST", "/renewals/" + pending.id + "/cancel", {})).statusCode,
  ).toBe(409);
  expect(foreign.id).not.toBe(own.id);
});
it("rechazo exige respuesta y solo procesadores autorizados", async () => {
  const own = await contract();
  const pending = await renewal(own.id);
  expect(
    (await request(supervisor, "POST", "/renewals/" + pending.id + "/reject", {})).statusCode,
  ).toBe(400);
  expect(
    (await request(signer, "POST", "/renewals/" + pending.id + "/reject", { response: "No" }))
      .statusCode,
  ).toBe(403);
  const rejected = await request(gestor, "POST", "/renewals/" + pending.id + "/reject", {
    response: "No procede",
  });
  expect(rejected.statusCode, rejected.body).toBe(200);
  expect(rejected.json().status).toBe("rejected");
});
it("jobs calculan estados con fecha simulada y auditan system sin duplicar", async () => {
  const expired = await contract({ endDate: "2030-06-09" });
  const expiring = await contract({ endDate: "2030-06-30" });
  const distant = await contract({ endDate: "2030-12-31" });
  const run = await runJob("contract-status", async () => {}, new Date("2030-06-10T12:00:00Z"));
  expect(run).toMatchObject({ summary: { changed: 2 } });
  const state = Object.fromEntries(
    (await db.select().from(contracts)).map((row) => [row.id, row.status]),
  );
  expect(state[expired.id]).toBe("expired");
  expect(state[expiring.id]).toBe("expiring_soon");
  expect(state[distant.id]).toBe("active");
  expect(
    await runJob("contract-status", async () => {}, new Date("2030-06-10T12:00:00Z")),
  ).toMatchObject({ summary: { changed: 0 } });
  expect((await db.select().from(jobRuns)).every((row) => row.ok)).toBe(true);
  expect(santoDomingoDate(new Date("2030-06-10T02:00:00Z"))).toBe("2030-06-09");
});
it("avisos deduplicados incluso tras borrar notificación; respeta emailOnExpiry", async () => {
  await contract({ endDate: "2030-06-17" });
  await request(signer, "PATCH", "/me/notification-preferences", { emailOnExpiry: false });
  const now = new Date("2030-06-10T12:00:00Z");
  expect(
    await runJob(
      "expiry-notifications",
      async (mail) => {
        mails.push(mail);
      },
      now,
    ),
  ).toMatchObject({ summary: { sent: 4 } });
  expect(mails.map((mail) => mail.to)).not.toContain(signer.email);
  await db.delete(notifications);
  expect(await runJob("expiry-notifications", async () => {}, now)).toMatchObject({
    summary: { sent: 0 },
  });
});
it("lock de job impide ejecución y administra ajustes con permisos", async () => {
  const connection = await pool.connect();
  try {
    await connection.query("select pg_advisory_lock(30300)");
    expect(await runJob("contract-status", async () => {})).toMatchObject({
      skipped: true,
      reason: "locked",
    });
  } finally {
    await connection.query("select pg_advisory_unlock(30300)");
    connection.release();
  }
  expect((await request(gestor, "GET", "/system/jobs")).statusCode).toBe(403);
  expect((await request(admin, "GET", "/system/jobs")).json()).toHaveLength(3);
  expect(
    (
      await request(admin, "PATCH", "/system/settings", {
        expiryWarningDays: 10,
        expiryNotificationDays: [10, 5],
      })
    ).statusCode,
  ).toBe(200);
  expect(
    (await request(admin, "PATCH", "/system/settings", { expiryNotificationDays: [7, 7] }))
      .statusCode,
  ).toBe(400);
  expect((await request(gestor, "POST", "/system/jobs/cleanup/run", {})).statusCode).toBe(403);
});
it("cleanup elimina leídas antiguas y tokens vencidos conservando recientes", async () => {
  await db.insert(notifications).values([
    {
      userId: signer.id,
      type: "contract_signed",
      title: "Vieja",
      message: "Vieja",
      readAt: new Date("2029-01-01"),
    },
    { userId: signer.id, type: "contract_signed", title: "No leída", message: "Actual" },
  ]);
  await db.insert(authTokens).values({
    userId: signer.id,
    type: "password_reset",
    tokenHash: "expired",
    expiresAt: new Date("2029-01-01"),
  });
  await db.insert(refreshTokens).values({
    userId: signer.id,
    tokenHash: "expired",
    familyId: randomUUID(),
    expiresAt: new Date("2029-01-01"),
  });
  expect(await runJob("cleanup", async () => {}, new Date("2030-06-10T12:00:00Z"))).toMatchObject({
    summary: { notifications: 1, authTokens: 1, refreshTokens: 1 },
  });
  expect(await db.select().from(notifications)).toHaveLength(1);
});
it("notificaciones propias, enlaces, contador y preferencias parciales", async () => {
  const own = await contract();
  await renewal(own.id);
  const list = await request(gestor, "GET", "/notifications?unread=true");
  expect(list.json().data[0].link).toBe("/renovaciones");
  const id = list.json().data[0].id;
  expect((await request(other, "POST", "/notifications/" + id + "/read", {})).statusCode).toBe(404);
  expect((await request(gestor, "POST", "/notifications/" + id + "/read", {})).statusCode).toBe(
    200,
  );
  expect((await request(gestor, "GET", "/notifications/unread-count")).json().count).toBe(0);
  expect((await request(gestor, "DELETE", "/notifications/" + id)).statusCode).toBe(200);
  expect(
    (
      await request(signer, "PATCH", "/me/notification-preferences", {
        emailOnSignatureRequired: false,
      })
    ).json(),
  ).toEqual({ emailOnSignatureRequired: false, emailOnApprovalResult: true, emailOnExpiry: true });
  expect((await request(signer, "POST", "/notifications/read-all", {})).statusCode).toBe(200);
});
it("bus no publica efectos de rollback y sí cambios de rol confirmados", async () => {
  const received: unknown[] = [];
  const unsubscribe = eventBus.subscribe(signer.id, (event) => received.push(event));
  try {
    await expect(
      db.transaction(async (tx) => {
        afterCommit(tx, () => eventBus.publish(signer.id, { type: "notification", data: {} }));
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(received).toEqual([]);
    expect(
      (await request(admin, "PATCH", "/users/" + signer.id, { role: "gestor" })).statusCode,
    ).toBe(200);
    expect(received).toContainEqual({ type: "role-changed", data: { role: "gestor" } });
  } finally {
    unsubscribe();
  }
});
it("SSE consume ticket una vez y recibe notification después de firmar", async () => {
  const own = await contract({ status: "pending_signatures" });
  const address = await app.listen({ port: 0, host: "127.0.0.1" });
  const ticket = (await request(gestor, "POST", "/events/ticket", {})).json().ticket;
  const abort = new AbortController();
  const response = await fetch(address + "/api/v1/events?token=" + ticket, {
    signal: abort.signal,
  });
  expect(response.headers.get("content-type")).toContain("text/event-stream");
  const reader = response.body!.getReader();
  let text = "";
  try {
    text += new TextDecoder().decode((await reader.read()).value);
    expect(text).toContain("event: unread-count");
    expect((await app.inject({ url: "/api/v1/events?token=" + ticket })).statusCode).toBe(401);
    const signed = await sign(own.id);
    expect(signed.statusCode, signed.body).toBe(200);
    const deadline = Date.now() + 5000;
    while (!text.includes("event: notification") && Date.now() < deadline) {
      const chunk = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("SSE timeout")), 5000)),
      ]);
      text += new TextDecoder().decode(chunk.value);
    }
    expect(text).toContain('"type":"contract_signed"');
  } finally {
    abort.abort();
    await reader.cancel().catch(() => {});
  }
});
it("dashboard tiene forma por rol, tendencias y aislamiento del gestor", async () => {
  await contract();
  await contract({ createdBy: other.id, title: "Dato ajeno", contractValue: "999999.99" });
  for (const user of [admin, supervisor, gestor, signer]) {
    const result = await request(user, "GET", "/dashboard");
    expect(result.statusCode, result.body).toBe(200);
    const body = result.json();
    if (user.role === "admin") {
      expect(body.kpis.activeValue.value).toBe("1001250.24");
      expect(body.kpis.activeValue.trend).toHaveLength(6);
      expect(body.monthly).toHaveLength(6);
      expect(body.attention).toHaveProperty("urgentRenewals");
    }
    if (user.role === "supervisor") {
      expect(body.kpis).toHaveProperty("returnRate");
      expect(body.queue).toEqual([]);
      expect(body.templateUsage[0].count).toBe(2);
    }
    if (user.role === "gestor") {
      expect(body.kpis.myValue).toBe("1250.25");
      expect(JSON.stringify(body)).not.toContain("Dato ajeno");
      expect(body.recent).toHaveLength(1);
    }
    if (user.role === "user")
      expect(Object.keys(body).sort()).toEqual(["myTurn", "signed", "waitingOthers"]);
  }
  expect((await request(admin, "GET", "/dashboard?months=12")).json().monthly).toHaveLength(12);
  expect((await request(admin, "GET", "/dashboard?role=admin")).statusCode).toBe(400);
});
it("reportes respetan permisos, filtros y agrupaciones", async () => {
  const own = await contract();
  await contract({ createdBy: other.id, contractValue: "999999.99" });
  expect(
    (await request(gestor, "GET", "/reports/contracts?groupBy=manager")).json().totals.value,
  ).toBe("1250.25");
  expect(
    (await request(gestor, "GET", "/reports/contracts?managerId=" + other.id)).json().rows,
  ).toEqual([]);
  expect((await request(signer, "GET", "/reports/contracts")).statusCode).toBe(403);
  expect((await request(supervisor, "GET", "/reports/users")).statusCode).toBe(403);
  expect((await request(gestor, "GET", "/reports/users/export?format=csv")).statusCode).toBe(403);
  expect(
    (await request(admin, "GET", "/reports/users?groupBy=activity")).json().rows.length,
  ).toBeGreaterThan(0);
  expect(
    (await request(admin, "GET", "/reports/contracts?from=2030-12-31&to=2030-01-01")).statusCode,
  ).toBe(400);
  await db.insert(contractApprovals).values({
    contractId: own.id,
    versionNumber: 1,
    requestedBy: gestor.id,
    status: "rejected",
    requestedAt: new Date("2030-01-01"),
    reviewedAt: new Date("2030-01-03"),
    reviewedBy: supervisor.id,
  });
  const report = await request(gestor, "GET", "/reports/approvals?from=2030-01-01&to=2030-02-01");
  expect(report.statusCode, report.body).toBe(200);
  expect(report.json().byManager[0].avgApprovalDays).toBe("2.00");
  expect(report.json().bySupervisor[0].returnRate).toBe("100.00");
});
it("exporta CSV BOM y XLSX reabribles, PDF real y descarga protegida", async () => {
  await contract();
  const csv = await request(admin, "GET", "/reports/contracts/export?format=csv");
  expect(csv.statusCode, csv.body).toBe(200);
  expect(csv.rawPayload.subarray(0, 3)).toEqual(Buffer.from([239, 187, 191]));
  const csvBook = new ExcelJS.Workbook();
  const csvSheet = await csvBook.csv.read(Readable.from(csv.rawPayload.subarray(3)), {
    parserOptions: { delimiter: ";" },
  });
  expect(csvSheet.getRow(2).getCell(4).value).toBe(1250.25);
  const xlsx = await request(admin, "GET", "/reports/contracts/export?format=xlsx");
  expect(xlsx.statusCode, xlsx.body).toBe(200);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(xlsx.rawPayload as never);
  expect(workbook.worksheets[0]!.getRow(2).getCell(4).value).toBe(1250.25);
  expect(workbook.worksheets[0]!.getColumn(4).numFmt).toContain("RD$");
  const pdf = await request(admin, "GET", "/reports/contracts/export?format=pdf");
  expect(pdf.statusCode, pdf.body).toBe(200);
  expect(pdf.rawPayload.subarray(0, 4).toString()).toBe("%PDF");
  expect(pdf.headers["content-disposition"]).toContain("attachment");
});
it.each([
  [15, "urgent"],
  [16, "high"],
  [30, "high"],
  [31, "medium"],
  [60, "medium"],
  [61, "low"],
  [-1, "urgent"],
])("prioridad de %s días es %s", (days, expected) => {
  expect(renewalPriority(Number(days))).toBe(expected);
});
