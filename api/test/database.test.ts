import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, pool, prepareDatabase, cleanDatabase } from "./database.js";
import { audit } from "../src/lib/audit.js";
import { seedSql } from "../src/db/seed-data.js";
import {
  contractAuditLogs,
  contracts,
  contractTemplates,
  notifications,
  templateVariables,
  users,
} from "../src/db/schema.js";
beforeAll(prepareDatabase);
beforeEach(cleanDatabase);
afterAll(() => pool.end());
it("migra las 25 tablas y define un único estado de contrato", async () => {
  const tables = await db.execute<{ table_name: string }>(
    sql`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE'`,
  );
  expect(tables.rows.map((t) => t.table_name).sort()).toEqual(
    [
      "users",
      "refresh_tokens",
      "auth_tokens",
      "auth_request_budgets",
      "template_variables",
      "contract_templates",
      "contracts",
      "contract_signatories",
      "contract_signatory_binding_review",
      "contract_versions",
      "contract_approvals",
      "contract_audit_logs",
      "contract_renewals",
      "contract_cancellations",
      "notifications",
      "files",
      "expiry_deliveries",
      "job_runs",
      "storage_migration_objects",
      "signature_evidence",
      "storage_migration_failures",
      "settings",
      "email_outbox",
      // T12b: administrative audit log and its chain head.
      "admin_audit_logs",
      "admin_audit_head",
    ].sort(),
  );
  const columns = await db.execute<{ column_name: string }>(
    sql`select column_name from information_schema.columns where table_name='contracts'`,
  );
  expect(
    columns.rows
      .filter((c) => ["status", "actual_status", "approval_status"].includes(c.column_name))
      .map((c) => c.column_name),
  ).toEqual(["status"]);
  expect(columns.rows.map((c) => c.column_name)).toContain("previous_status");
});
it("seed de variables y plantilla es idempotente y conserva las 10 variables de referencia", async () => {
  await db.execute(sql.raw(seedSql));
  await db.execute(sql.raw(seedSql));
  const variables = await db.select().from(templateVariables);
  expect(variables).toHaveLength(10);
  expect(variables.find((v) => v.name === "forma_pago")!.options).toEqual([
    "Mensual",
    "Quincenal",
    "Por hitos",
    "Al finalizar",
    "Mixto",
  ]);
  const templates = await db.select().from(contractTemplates);
  expect(templates).toHaveLength(1);
  expect(templates[0]!.variables).toHaveLength(10);
  expect(templates[0]!.content).toContain("{{cliente_nombre}}");
});
it("email case-insensitive y cédula parcial son restricciones de PostgreSQL", async () => {
  await db.insert(users).values({
    email: "first@example.com",
    passwordHash: "unused",
    name: "Primero",
  });
  await db.insert(users).values({
    email: "second@example.com",
    passwordHash: "unused",
    name: "Segundo",
  });
  await expect(
    db.insert(users).values({
      email: "FIRST@example.com",
      passwordHash: "unused",
      name: "Duplicado",
    }),
  ).rejects.toThrow();
  await db.insert(users).values({
    email: "cedula@example.com",
    passwordHash: "unused",
    name: "Cédula",
    cedula: "001",
  });
  await expect(
    db.insert(users).values({
      email: "cedula2@example.com",
      passwordHash: "unused",
      name: "Cédula",
      cedula: "001",
    }),
  ).rejects.toThrow();
});
it("borrado físico de usuario conserva contratos; auditoría permite entidad sin contrato", async () => {
  const [user] = await db
    .insert(users)
    .values({
      email: "owner@example.com",
      passwordHash: "unused",
      name: "Propietario",
    })
    .returning();
  const [contract] = await db
    .insert(contracts)
    .values({ title: "Contrato", content: "contenido", createdBy: user!.id })
    .returning();
  await db.transaction(async (tx) => {
    await audit(tx, {
      userId: user!.id,
      action: "created",
      entityType: "contract",
      entityId: contract!.id,
      contractId: contract!.id,
      newValues: { title: "Contrato" },
    });
  });
  await db.delete(users).where(eq(users.id, user!.id));
  expect((await db.select().from(contracts))[0]!.createdBy).toBeNull();
  expect(await db.select().from(contractAuditLogs)).toHaveLength(1);
  await db.transaction(async (tx) => {
    await audit(tx, {
      action: "created",
      entityType: "template",
      entityId: contract!.id,
    });
  });
  expect(await db.select().from(contractAuditLogs)).toHaveLength(2);
});
it("CHECK de notificaciones acepta tipos nuevos y rechaza desconocidos", async () => {
  const [user] = await db
    .insert(users)
    .values({
      email: "notify@example.com",
      passwordHash: "unused",
      name: "Avisos",
    })
    .returning();
  for (const type of ["approval_result", "signature_required", "contract_signed"])
    await db
      .insert(notifications)
      .values({ userId: user!.id, type, title: "Aviso", message: "Mensaje" });
  await expect(
    db.insert(notifications).values({
      userId: user!.id,
      type: "unknown",
      title: "Aviso",
      message: "Mensaje",
    }),
  ).rejects.toThrow();
});
