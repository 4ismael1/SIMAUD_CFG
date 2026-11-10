import { buildApp } from "../src/app.js";
import { contracts } from "../src/db/schema.js";
import { db, createUser, authorization, signIn } from "./helpers.js";
export { validPng } from "./image-fixtures.js";
import type { FastifyInstance } from "fastify";

export const testApp = () => buildApp({ logger: false, mailer: async () => undefined });

export async function contractFixture(
  creator: string,
  overrides: Partial<typeof contracts.$inferInsert> = {},
) {
  const [contract] = await db
    .insert(contracts)
    .values({
      title: "Contrato seguridad",
      content: "Documento",
      generatedContent: "Documento",
      createdBy: creator,
      status: "pending_signatures",
      contractValue: "100.00",
      startDate: "2026-11-01",
      endDate: "2027-11-01",
      ...overrides,
    })
    .returning();
  return contract!;
}

export async function loginUser(
  app: FastifyInstance,
  overrides: Parameters<typeof createUser>[0] = {},
) {
  const user = await createUser(overrides);
  const login = await signIn(app, user);
  return { user, headers: authorization(login.token) };
}

export function imageMultipart(
  data: Buffer,
  fields: Record<string, string> = {},
  fieldname = "signature",
  mime = "image/png",
) {
  const parts = Object.entries(fields).map(([name, value]) =>
    Buffer.from(`--t09b\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`),
  );
  return Buffer.concat([
    ...parts,
    Buffer.from(
      `--t09b\r\nContent-Disposition: form-data; name="${fieldname}"; filename="image.png"\r\nContent-Type: ${mime}\r\n\r\n`,
    ),
    data,
    Buffer.from("\r\n--t09b--\r\n"),
  ]);
}
