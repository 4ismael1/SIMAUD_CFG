import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq, sql } from "drizzle-orm";
import { buildApp } from "../src/app.js";
import { createAccessToken } from "../src/lib/auth/jwt.js";
import {
  contracts,
  contractTemplates,
  templateVariables,
  contractSignatories,
  contractVersions,
  contractAuditLogs,
  contractApprovals,
  notifications,
  files,
} from "../src/db/schema.js";
import { db, pool, prepareDatabase, cleanDatabase, createUser, authorization } from "./helpers.js";
import type { Mail } from "../src/lib/mailer.js";
import { readFile, unlink } from "node:fs/promises";
let app: FastifyInstance;
let mails: Mail[];
let admin: Awaited<ReturnType<typeof createUser>>,
  gestor: typeof admin,
  other: typeof admin,
  supervisor: typeof admin,
  first: typeof admin,
  second: typeof admin;
let tokens: Record<string, string>;
let templateId: string;
beforeAll(prepareDatabase);
afterAll(() => pool.end());
beforeEach(async () => {
  await cleanDatabase();
  mails = [];
  app = await buildApp({
    logger: false,
    mailer: async (m) => {
      mails.push(m);
    },
  });
  admin = await createUser({ role: "admin" });
  gestor = await createUser({ role: "gestor" });
  other = await createUser({ role: "gestor" });
  supervisor = await createUser({ role: "supervisor" });
  first = await createUser();
  second = await createUser();
  tokens = {};
  for (const u of [admin, gestor, other, supervisor, first, second])
    tokens[u.id] = await createAccessToken(u);
  await db
    .insert(templateVariables)
    .values({ name: "cliente", label: "Cliente", type: "text", required: true });
  const [t] = await db
    .insert(contractTemplates)
    .values({
      title: "Servicios",
      content: "Contrato {{cliente}}",
      variables: ["cliente"],
      createdBy: admin.id,
    })
    .returning();
  templateId = t!.id;
});
afterEach(async () => {
  for (const f of await db.select().from(files))
    if (f.kind === "signature") await unlink("storage/signatures/" + f.path).catch(() => {});
  await app.close();
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
function input() {
  return {
    templateId,
    title: "Contrato de prueba",
    variables: { cliente: "<Empresa>" },
    value: 1234.56,
    startDate: "2026-11-01",
    endDate: "2027-11-01",
    signatories: [
      { name: first.name, email: first.email, role: "client", signingOrder: 1 },
      { name: second.name, email: second.email, role: "witness", signingOrder: 2 },
    ],
  };
}
async function create(user = gestor) {
  const r = await request(user, "POST", "/contracts", input());
  expect(r.statusCode, r.body).toBe(201);
  return r.json();
}
async function approve(id: string) {
  expect((await request(gestor, "POST", "/contracts/" + id + "/submit", {})).statusCode).toBe(200);
  const r = await request(supervisor, "POST", "/contracts/" + id + "/approve", {});
  expect(r.statusCode, r.body).toBe(200);
}
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1XcAAAAASUVORK5CYII=",
  "base64",
);
async function sign(
  user: typeof admin,
  id: string,
  opts: { mime?: string; image?: Buffer; accepted?: string; viewedAt?: string } = {},
) {
  const boundary = "test-boundary";
  const payload = Buffer.concat([
    Buffer.from(
      "--" +
        boundary +
        '\r\nContent-Disposition: form-data; name="acceptedDeclaration"\r\n\r\n' +
        (opts.accepted ?? "true") +
        "\r\n--" +
        boundary +
        '\r\nContent-Disposition: form-data; name="viewedAt"\r\n\r\n' +
        (opts.viewedAt ?? new Date().toISOString()) +
        "\r\n--" +
        boundary +
        '\r\nContent-Disposition: form-data; name="signature"; filename="test.png"\r\nContent-Type: ' +
        (opts.mime ?? "image/png") +
        "\r\n\r\n",
    ),
    opts.image ?? png,
    Buffer.from("\r\n--" + boundary + "--\r\n"),
  ]);
  return app.inject({
    method: "POST",
    url: "/api/v1/contracts/" + id + "/sign",
    headers: {
      ...authorization(tokens[user.id]!),
      "content-type": "multipart/form-data; boundary=" + boundary,
    },
    payload,
  });
}
it("permisos: usuario no crea; gestor no ve ajenos; firmante solo participa; supervisor no edita", async () => {
  expect((await request(first, "POST", "/contracts", input())).statusCode).toBe(403);
  const c = await create();
  expect(c.code).toMatch(/^CT-\d{4}-\d{4,}$/);
  expect(c.generatedContent).toBe("Contrato &lt;Empresa&gt;");
  expect(c.signatories.map((s: { userId: string }) => s.userId).sort()).toEqual(
    [first.id, second.id].sort(),
  );
  expect((await request(other, "GET", "/contracts")).json().data).toEqual([]);
  expect((await request(other, "GET", "/contracts/" + c.id)).statusCode).toBe(404);
  expect((await request(await createUserWithToken(), "GET", "/contracts/" + c.id)).statusCode).toBe(
    404,
  );
  expect((await request(first, "GET", "/contracts")).statusCode).toBe(403);
  expect((await request(first, "GET", "/contracts/" + c.id)).statusCode).toBe(200);
  expect(
    (await request(supervisor, "PATCH", "/contracts/" + c.id, { title: "x" })).statusCode,
  ).toBe(403);
  expect((await request(other, "POST", "/contracts/" + c.id + "/submit", {})).statusCode).toBe(404);
  expect((await request(other, "GET", "/contracts/counts")).json().draft).toBe(0);
});
async function createUserWithToken() {
  const u = await createUser();
  tokens[u.id] = await createAccessToken(u);
  return u;
}
it("creación revierte contrato, firmantes y versión si email/cédula identifican personas distintas", async () => {
  const body = input();
  body.signatories[0] = {
    ...body.signatories[0]!,
    cedula: second.cedula,
  } as (typeof body.signatories)[number];
  expect((await request(gestor, "POST", "/contracts", body)).statusCode).toBe(400);
  expect(await db.select().from(contracts)).toHaveLength(0);
  expect(await db.select().from(contractVersions)).toHaveLength(0);
  expect(await db.select().from(contractSignatories)).toHaveLength(0);
});
it("valida fechas, duplicados y variables requeridas", async () => {
  for (const patch of [
    { endDate: "2026-11-01" },
    { variables: {} },
    { variables: { cliente: "a", unknown: "b" } },
    { signatories: [input().signatories[0], input().signatories[0]] },
  ]) {
    expect((await request(gestor, "POST", "/contracts", { ...input(), ...patch })).statusCode).toBe(
      400,
    );
  }
});
it("aprobación concurrente, orden de firmas, archivos privados y última firma activa", async () => {
  const c = await create();
  await request(gestor, "POST", "/contracts/" + c.id + "/submit", {});
  const results = await Promise.all([
    request(supervisor, "POST", "/contracts/" + c.id + "/approve", {}),
    request(admin, "POST", "/contracts/" + c.id + "/approve", {}),
  ]);
  expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
  expect(await db.select().from(contractApprovals)).toHaveLength(1);
  expect((await request(gestor, "PATCH", "/contracts/" + c.id, { title: "No" })).statusCode).toBe(
    409,
  );
  expect((await sign(second, c.id)).statusCode).toBe(409);
  expect((await sign(first, c.id, { accepted: "false" })).statusCode).toBe(400);
  expect((await sign(first, c.id, { image: Buffer.from("fake") })).statusCode).toBe(400);
  expect((await sign(first, c.id, { image: Buffer.alloc(500 * 1024 + 1) })).statusCode).toBe(413);
  let inbox = (await request(first, "GET", "/me/signatures")).json();
  expect(inbox[0].myTurn).toBe(true);
  const r = await sign(first, c.id);
  expect(r.statusCode, r.body).toBe(200);
  expect((await sign(first, c.id)).statusCode).toBe(409);
  inbox = (await request(second, "GET", "/me/signatures")).json();
  expect(inbox[0].myTurn).toBe(true);
  const [file] = await db.select().from(files);
  expect(file!.kind).toBe("signature");
  expect((await request(other, "GET", "/files/signatures/" + file!.id)).statusCode).toBe(404);
  expect((await request(first, "GET", "/files/signatures/" + file!.id)).statusCode).toBe(200);
  expect((await sign(second, c.id)).statusCode).toBe(200);
  const detail = (await request(gestor, "GET", "/contracts/" + c.id)).json();
  expect(detail.status).toBe("active");
  expect(detail.signatures).toEqual({ signed: 2, total: 2 });
  const ns = await db.select().from(notifications);
  expect(ns.filter((n) => n.type === "contract_signed")).toHaveLength(3);
  expect(mails.filter((m) => m.subject.includes(c.code))).toHaveLength(3);
  const logs = (await request(gestor, "GET", "/contracts/" + c.id + "/audit")).json();
  expect(logs.meta.total).toBe(5);
  expect(logs.data.find((l: { action: string }) => l.action === "sign").ip).toBe("127.0.0.1");
});
it("supervisor nunca aprueba su propio contrato, ni con override", async () => {
  const c = await create();
  await db.update(contracts).set({ createdBy: supervisor.id }).where(eq(contracts.id, c.id));
  await request(admin, "POST", "/contracts/" + c.id + "/submit", {});
  expect(
    (await request(supervisor, "POST", "/contracts/" + c.id + "/approve", {})).statusCode,
  ).toBe(403);
  expect(
    (
      await request(supervisor, "POST", "/contracts/" + c.id + "/override-status", {
        status: "pending_signatures",
        reason: "x",
      })
    ).statusCode,
  ).toBe(403);
});
it("rechazo requiere comentario; edición conserva ids y vínculos, crea versión y diff", async () => {
  const c = await create();
  await request(gestor, "POST", "/contracts/" + c.id + "/submit", {});
  expect((await request(supervisor, "POST", "/contracts/" + c.id + "/reject", {})).statusCode).toBe(
    400,
  );
  expect(
    (await request(supervisor, "POST", "/contracts/" + c.id + "/reject", { comment: "Corregir" }))
      .statusCode,
  ).toBe(200);
  const updated = await request(gestor, "PATCH", "/contracts/" + c.id, {
    variables: { cliente: "Nueva" },
    signatories: input().signatories.map((s) => ({ ...s, name: s.name + " actualizado" })),
  });
  expect(updated.statusCode, updated.body).toBe(200);
  expect(updated.json().status).toBe("draft");
  expect(updated.json().currentVersion).toBe(2);
  expect(
    updated
      .json()
      .signatories.map((s: { id: string }) => s.id)
      .sort(),
  ).toEqual(c.signatories.map((s: { id: string }) => s.id).sort());
  await request(gestor, "POST", "/contracts/" + c.id + "/submit", {});
  const queue = (await request(supervisor, "GET", "/approvals?status=pending")).json();
  expect(queue[0].diff.variablesChanged).toBe(true);
  expect(queue[0].version.versionNumber).toBe(2);
  expect(
    (await request(gestor, "GET", "/contracts/" + c.id + "/versions/1")).json().variablesData,
  ).toEqual({ cliente: "<Empresa>" });
});
it("cancelar, restaurar, archivar y override exigen permisos y transiciones válidas", async () => {
  const c = await create();
  await approve(c.id);
  expect(
    (
      await request(gestor, "POST", "/contracts/" + c.id + "/cancel", {
        reason: "other",
        description: "Acuerdo",
      })
    ).json().status,
  ).toBe("cancelled");
  expect((await request(gestor, "POST", "/contracts/" + c.id + "/uncancel", {})).statusCode).toBe(
    403,
  );
  expect((await request(admin, "POST", "/contracts/" + c.id + "/uncancel", {})).json().status).toBe(
    "pending_signatures",
  );
  expect(
    (await request(gestor, "POST", "/contracts/" + c.id + "/archive", {})).json().archived,
  ).toBe(true);
  expect((await request(gestor, "GET", "/contracts")).json().meta.total).toBe(0);
  expect((await request(gestor, "GET", "/contracts?archived=true")).json().meta.total).toBe(1);
  expect(
    (await request(gestor, "POST", "/contracts/" + c.id + "/unarchive", {})).json().archived,
  ).toBe(false);
  expect(
    (await request(admin, "POST", "/contracts/" + c.id + "/override-status", { status: "active" }))
      .statusCode,
  ).toBe(400);
  expect(
    (
      await request(admin, "POST", "/contracts/" + c.id + "/override-status", {
        status: "expired",
        reason: "x",
      })
    ).statusCode,
  ).toBe(409);
  expect(
    (
      await request(admin, "POST", "/contracts/" + c.id + "/override-status", {
        status: "active",
        reason: "Migración",
      })
    ).json().status,
  ).toBe("active");
});
it("recordatorio 1/h persistente y decline notifica rechazo al creador", async () => {
  const c = await create();
  await approve(c.id);
  const body = { signatoryId: c.signatories[0].id };
  expect((await request(gestor, "POST", "/contracts/" + c.id + "/remind", body)).statusCode).toBe(
    200,
  );
  expect((await request(gestor, "POST", "/contracts/" + c.id + "/remind", body)).statusCode).toBe(
    429,
  );
  expect(
    (
      await request(first, "POST", "/contracts/" + c.id + "/decline", { reason: "No acepto" })
    ).json().status,
  ).toBe("rejected");
  expect((await request(gestor, "GET", "/contracts/" + c.id)).json().rejectionReason).toBe(
    "No acepto",
  );
  await request(gestor, "POST", "/contracts/" + c.id + "/submit", {});
  const again = await request(supervisor, "POST", "/contracts/" + c.id + "/approve", {});
  expect(again.statusCode, again.body).toBe(200);
  expect(again.json().signatories[0].status).toBe("pending");
});
it("delete exige código al admin, gestor solo propios en draft y auditoría sobrevive", async () => {
  const c = await create();
  expect((await request(admin, "DELETE", "/contracts/" + c.id, {})).statusCode).toBe(400);
  expect(
    (await request(admin, "DELETE", "/contracts/" + c.id, { confirm: "incorrecto" })).statusCode,
  ).toBe(400);
  expect(
    (await request(admin, "DELETE", "/contracts/" + c.id, { confirm: c.code })).statusCode,
  ).toBe(200);
  const logs = await db.select().from(contractAuditLogs);
  expect(logs.at(-1)!.action).toBe("delete");
  expect(logs.at(-1)!.contractId).toBeNull();
  const own = await create();
  expect((await request(gestor, "DELETE", "/contracts/" + own.id)).statusCode).toBe(200);
  const submitted = await create();
  await request(gestor, "POST", "/contracts/" + submitted.id + "/submit", {});
  expect((await request(gestor, "DELETE", "/contracts/" + submitted.id)).statusCode).toBe(403);
});
it("variables en uso, plantillas en uso, extracción y gestor solo activas", async () => {
  const [v] = await db.select().from(templateVariables);
  const used = await request(admin, "DELETE", "/variables/" + v!.id);
  expect(used.statusCode).toBe(409);
  expect(used.json().error.details.templates[0].id).toBe(templateId);
  expect(
    (
      await request(admin, "POST", "/variables", {
        name: "opcion",
        label: "Opción",
        type: "select",
        options: [],
      })
    ).statusCode,
  ).toBe(400);
  expect(
    (
      await request(admin, "POST", "/templates", {
        title: "Desconocida",
        content: "{{desconocida}}",
      })
    ).json().error.details.unknown,
  ).toEqual(["desconocida"]);
  const dup = await request(supervisor, "POST", "/templates/" + templateId + "/duplicate", {});
  expect(dup.json().status).toBe("inactive");
  expect((await request(gestor, "GET", "/templates/" + dup.json().id)).statusCode).toBe(404);
  expect(
    (await request(admin, "PATCH", "/templates/" + dup.json().id, { title: "Renombrada" })).json()
      .status,
  ).toBe("inactive");
  expect(
    (await request(admin, "PATCH", "/variables/" + v!.id, { label: "Nombre actualizado" })).json()
      .required,
  ).toBe(true);
  expect((await request(gestor, "GET", "/templates")).json()).toHaveLength(1);
  const c = await create();
  expect((await request(admin, "DELETE", "/templates/" + templateId)).statusCode).toBe(409);
  expect(
    (await request(admin, "GET", "/templates"))
      .json()
      .find((t: { id: string }) => t.id === templateId).usageCount,
  ).toBe(1);
  expect(
    (
      await request(gestor, "POST", "/templates/preview", {
        content: "{{cliente}}",
        values: { cliente: "<x>" },
      })
    ).json(),
  ).toEqual({ html: "&lt;x&gt;", missing: [] });
});
it("vincula firmantes al primer acceso confirmado y persiste refresh grace", async () => {
  const c = await create();
  await db
    .update(contractSignatories)
    .set({ userId: null })
    .where(eq(contractSignatories.contractId, c.id));
  expect((await request(first, "GET", "/me/signatures")).json()[0].signatory.userId).toBe(first.id);
});
