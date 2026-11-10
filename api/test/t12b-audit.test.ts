import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import ExcelJS from "exceljs";
import { eq, sql } from "drizzle-orm";
import { buildApp } from "../src/app.js";
import { auditAdmin } from "../src/modules/audit/service.js";
import { verifyAdminAuditChain } from "../src/modules/audit/integrity.js";
import { adminAuditLogs, users, contracts, contractAuditLogs } from "../src/db/schema.js";
import {
  authorization,
  cleanDatabase,
  createUser,
  db,
  pool,
  prepareDatabase,
  signIn,
} from "./helpers.js";

let app: FastifyInstance;
let feed: FastifyInstance;
let headers: ReturnType<typeof authorization>;
let actorId: string;
let targetId: string;
beforeAll(async () => {
  await prepareDatabase();
  app = await buildApp({ logger: false });
  feed = app;
});
beforeEach(async () => {
  await cleanDatabase();
  const admin = await createUser({ role: "admin", name: "Administración" });
  actorId = admin.id;
  headers = authorization((await signIn(app, admin)).token);
  targetId = (await createUser()).id;
});
afterAll(async () => {
  await app?.close();
  await pool.end();
});
const request = (method: "POST" | "PATCH" | "DELETE", suffix: string, payload?: object) =>
  app.inject({ method, url: `/api/v1/users/${targetId}${suffix}`, headers, payload });
async function entries() {
  return db
    .select()
    .from(adminAuditLogs)
    .where(eq(adminAuditLogs.actorId, actorId))
    .orderBy(adminAuditLogs.sequence);
}
async function record(action = "user.updated", label = "Etiqueta única") {
  await db.transaction((tx) =>
    auditAdmin(
      tx,
      { actorId, ip: "192.0.2.1" },
      {
        area: "users",
        action,
        targetType: "user",
        targetId,
        targetLabel: label,
      },
    ),
  );
}

describe("auditoría administrativa", () => {
  it("exige administrador en consulta, exportación y enlaces", async () => {
    for (const role of ["user", "gestor", "supervisor"] as const) {
      const user = await createUser({ role });
      const denied = authorization((await signIn(app, user)).token);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/v1/users",
            headers: denied,
            payload: { password: "No corresponde" },
          })
        ).statusCode,
      ).toBe(403);
      for (const url of ["/audit", "/audit/export?format=csv"]) {
        expect((await feed.inject({ url: "/api/v1" + url, headers: denied })).statusCode).toBe(403);
      }
      for (const action of ["password-reset", "resend-invite"]) {
        expect(
          (
            await app.inject({
              method: "POST",
              url: `/api/v1/users/${targetId}/${action}`,
              headers: denied,
            })
          ).statusCode,
        ).toBe(403);
      }
    }
    expect((await feed.inject({ url: "/api/v1/audit" })).statusCode).toBe(401);
  });

  it("audita edición, rol, actividad y baja sin copiar datos personales", async () => {
    expect(
      (
        await request("PATCH", "", {
          name: "Nombre nuevo",
          phone: "8095551234",
          role: "gestor",
          isActive: false,
        })
      ).statusCode,
    ).toBe(200);
    expect((await request("PATCH", "", { isActive: true })).statusCode).toBe(200);
    expect((await request("DELETE", "")).statusCode).toBe(200);
    const logs = await entries();
    expect(logs.map((entry) => entry.action).sort()).toEqual(
      [
        "user.updated",
        "user.role_changed",
        "user.deactivated",
        "user.activated",
        "user.deleted",
      ].sort(),
    );
    expect(JSON.stringify(logs.map((entry) => entry.details))).not.toContain("8095551234");
    expect(logs.every((entry) => entry.actorName === "Administración" && entry.ip)).toBe(true);
    await db.delete(users).where(eq(users.id, targetId));
    expect(await entries()).toHaveLength(5);
  });

  it("encadena inserciones concurrentes y conserva la cabecera tras rollback", async () => {
    await Promise.all(Array.from({ length: 6 }, () => record()));
    await expect(
      db.transaction(async (tx) => {
        await auditAdmin(
          tx,
          { actorId },
          {
            area: "users",
            action: "rollback",
            targetType: "user",
            targetId,
            targetLabel: "Prueba",
          },
        );
        throw new Error("rollback esperado");
      }),
    ).rejects.toThrow("rollback esperado");
    const result = await db.execute<{ valid: boolean }>(sql`
      select bool_and(entry_hash=t12b_audit_hash(to_jsonb(l))) as valid from admin_audit_logs l
    `);
    expect(result.rows[0]!.valid).toBe(true);
    const chain = await db.execute<{ valid: boolean }>(sql`
      select bool_and(previous_hash is not distinct from previous and sequence=expected) as valid
      from (select *, lag(entry_hash) over(order by sequence) previous,
        row_number() over(order by sequence) expected from admin_audit_logs) ordered
    `);
    expect(chain.rows[0]!.valid).toBe(true);
    const head = await db.execute<{ valid: boolean }>(sql`
      select h.entry_hash=l.entry_hash and h.sequence=l.sequence as valid
      from admin_audit_head h join admin_audit_logs l on l.sequence=h.sequence
    `);
    expect(head.rows[0]!.valid).toBe(true);
    expect(await entries()).toHaveLength(6);
  });

  it("rechaza modificaciones y borrados de auditoría sin rutas de escritura", async () => {
    await record();
    const [entry] = await entries();
    await expect(
      db.update(adminAuditLogs).set({ action: "alterada" }).where(eq(adminAuditLogs.id, entry!.id)),
    ).rejects.toThrow();
    await expect(
      db.delete(adminAuditLogs).where(eq(adminAuditLogs.id, entry!.id)),
    ).rejects.toThrow();
    expect(
      (await feed.inject({ method: "DELETE", url: `/api/v1/audit/${entry!.id}`, headers }))
        .statusCode,
    ).toBe(404);
    expect((await entries())[0]!.action).toBe("user.updated");
  });

  it("detecta manipulación, huecos y eliminación de cola frente a la cabecera", async () => {
    await record();
    await record();
    expect(await verifyAdminAuditChain()).toBe(true);
    const [entry] = await entries();
    for (const operation of [
      sql`update admin_audit_logs set action='alterada' where id=${entry!.id}`,
      sql`delete from admin_audit_logs where id=${entry!.id}`,
      sql`delete from admin_audit_logs where sequence=(select max(sequence) from admin_audit_logs)`,
    ]) {
      await expect(
        db.transaction(async (tx) => {
          await tx.execute(sql`alter table admin_audit_logs disable trigger t12b_immutable_audit`);
          await tx.execute(operation);
          expect(await verifyAdminAuditChain(tx)).toBe(false);
          throw new Error("rollback de manipulación simulada");
        }),
      ).rejects.toThrow("rollback de manipulación simulada");
    }
    expect(await verifyAdminAuditChain()).toBe(true);
  });

  it("interpreta los días completos en Santo Domingo con límites inclusivos", async () => {
    await db.insert(adminAuditLogs).values([
      {
        actorId,
        actorName: "Prueba",
        area: "users",
        action: "user.updated",
        targetType: "user",
        targetLabel: "Anterior",
        at: new Date("2026-11-10T03:59:59.999Z"),
      },
      {
        actorId,
        actorName: "Prueba",
        area: "users",
        action: "user.updated",
        targetType: "user",
        targetLabel: "Inicio",
        at: new Date("2026-11-10T04:00:00Z"),
      },
      {
        actorId,
        actorName: "Prueba",
        area: "users",
        action: "user.updated",
        targetType: "user",
        targetLabel: "Fin",
        at: new Date("2026-11-11T03:59:59.999Z"),
      },
      {
        actorId,
        actorName: "Prueba",
        area: "users",
        action: "user.updated",
        targetType: "user",
        targetLabel: "Siguiente",
        at: new Date("2026-11-11T04:00:00Z"),
      },
    ]);
    const response = await feed.inject({
      url: `/api/v1/audit?actorId=${actorId}&from=2026-11-10&to=2026-11-10`,
      headers,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.map((entry: { targetLabel: string }) => entry.targetLabel)).toEqual(
      ["Fin", "Inicio"],
    );
  });

  it("unifica contratos y administración, filtra y pagina sin exponer detalles", async () => {
    await record("user.created", "Etiqueta única %");
    const [contract] = await db
      .insert(contracts)
      .values({ title: "Contrato único", content: "privado", createdBy: actorId })
      .returning();
    await db.insert(contractAuditLogs).values({
      contractId: contract!.id,
      action: "create",
      entityType: "contract",
      entityId: contract!.id,
      userId: actorId,
      oldValues: { title: contract!.title, code: contract!.code },
      newValues: { token: "secreto-ficticio", email: "privado@example.com" },
    });
    const query = async (params: string) =>
      feed.inject({ url: `/api/v1/audit?actorId=${actorId}&${params}`, headers });
    const all = (await query("pageSize=1")).json();
    expect(all.meta.total).toBe(2);
    expect(all.data).toHaveLength(1);
    expect((await query("pageSize=1&page=2")).json().data[0].id).not.toBe(all.data[0].id);
    expect((await query("area=users&action=user.created&q=%25")).json().meta.total).toBe(1);
    expect(
      (await query(`contractId=${contract!.id}&q=${contract!.code}`)).json().data[0].source,
    ).toBe("contract");
    expect((await query("from=2099-01-01T00:00:00Z")).json().meta.total).toBe(0);
    expect((await query("to=2000-01-01T00:00:00Z")).json().meta.total).toBe(0);
    expect((await query("from=2099-01-01T00:00:00Z&to=2000-01-01T00:00:00Z")).statusCode).toBe(400);
    const response = await query("pageSize=100");
    expect(response.body).not.toMatch(
      /secreto-ficticio|privado@example.com|192\.0\.2\.1|passwordHash|previousHash/,
    );
    expect(response.headers["cache-control"]).toBe("private, no-store");
    await db.delete(contracts).where(eq(contracts.id, contract!.id));
    const deleted = await query(`contractId=${contract!.id}&q=${contract!.code}`);
    expect(deleted.json().data[0]).toMatchObject({
      contractCode: contract!.code,
      targetLabel: contract!.title,
    });
  });

  it("exporta los mismos filtros a CSV y XLSX y neutraliza fórmulas", async () => {
    await record("user.updated", "=HYPERLINK(1)");
    const base = `/api/v1/audit/export?actorId=${actorId}&area=users&format=`;
    const csv = await feed.inject({ url: base + "csv", headers });
    expect(csv.statusCode).toBe(200);
    expect(csv.body).toContain("'=HYPERLINK(1)");
    const xlsx = await feed.inject({ url: base + "xlsx", headers });
    expect(xlsx.statusCode).toBe(200);
    expect(xlsx.rawPayload.subarray(0, 2).toString()).toBe("PK");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(xlsx.rawPayload as unknown as ExcelJS.Buffer);
    const sheet = workbook.worksheets[0]!;
    expect(sheet.rowCount).toBe(2);
    expect(sheet.getRow(2).getCell(10).value).toBe("=HYPERLINK(1)");
    expect(sheet.getRow(1).values).not.toContain("ip");
    expect((await feed.inject({ url: base + "pdf", headers })).statusCode).toBe(400);
  });
});
