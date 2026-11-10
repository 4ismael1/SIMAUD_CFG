import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { db, pool } from "../src/db/client.js";
import { prepareDatabase as migrateTestDatabase, cleanDatabase } from "./database.js";
export { cleanDatabase };
import { users, type Role } from "../src/db/schema.js";
import { hashPassword } from "../src/lib/auth/password.js";
import type { Mail } from "../src/lib/mailer.js";
export { db, pool };
export const testPassword = "TestPassword123!";
let passwordHash: string;
export async function prepareDatabase() {
  await migrateTestDatabase();
  passwordHash = await hashPassword(testPassword);
}

export async function createUser(overrides: Partial<typeof users.$inferInsert> = {}) {
  const [user] = await db
    .insert(users)
    .values({
      email: randomUUID() + "@example.com",
      name: "Usuario prueba",
      phone: "8095550000",
      cedula: randomUUID(),
      passwordHash,
      role: "user",
      emailConfirmedAt: new Date(),
      ...overrides,
    })
    .returning();
  return user!;
}
export const authorization = (token: string) => ({
  authorization: "Bearer " + token,
});
export function cookie(response: { headers: Record<string, unknown> }) {
  const value = response.headers["set-cookie"];
  return String(Array.isArray(value) ? value[0] : value).split(";")[0]!;
}
export function mailToken(mails: Mail[], index = mails.length - 1) {
  return new URL(mails[index]!.text.split(" ").at(-1)!).searchParams.get("token")!;
}
export async function signIn(
  app: FastifyInstance,
  user: { email: string },
  password = testPassword,
  ip?: string,
) {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: user.email, password },
    remoteAddress: ip,
  });
  if (response.statusCode !== 200) throw new Error("Login de prueba falló: " + response.body);
  return {
    token: response.json<{ accessToken: string }>().accessToken,
    cookie: cookie(response),
    response,
  };
}
