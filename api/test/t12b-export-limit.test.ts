import { afterAll, beforeAll, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { buildApp } from "../src/app.js";
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
beforeAll(async () => {
  await prepareDatabase();
  await cleanDatabase();
  app = await buildApp({ logger: false });
});
afterAll(async () => {
  await app?.close();
  await pool.end();
});

it("rechaza una exportación de más de diez mil entradas y permite acotarla sin truncar", async () => {
  const actor = await createUser({ role: "admin" });
  const headers = authorization((await signIn(app, actor)).token);
  await db.execute(sql`
    insert into admin_audit_logs(actor_id, actor_name, area, action, target_type, target_label)
    select ${actor.id}::uuid, 'Prueba de volumen', 'users',
      case when series=1 then 'user.created' else 'user.updated' end,
      'user', 'Destino de prueba' from generate_series(1, 10001) series
  `);
  for (const format of ["csv", "xlsx"]) {
    const url = `/api/v1/audit/export?actorId=${actor.id}&format=${format}`;
    const excessive = await app.inject({ url, headers });
    expect(excessive.statusCode).toBe(400);
    expect(excessive.json().error.message).toContain("10 000");
    expect((await app.inject({ url: url + "&action=user.created", headers })).statusCode).toBe(200);
  }
  const page = await app.inject({ url: `/api/v1/audit?actorId=${actor.id}`, headers });
  expect(page.json().meta.total).toBe(10001);
  expect(page.json().data).toHaveLength(20);
});
