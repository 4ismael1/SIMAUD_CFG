import type { FastifyInstance } from "fastify";
import { expect } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "./helpers.js";
import { signingFixture as baseSigningFixture } from "./t18-helpers.js";
import { contracts, contractVersions } from "../src/db/schema.js";
import { imageMultipart, validPng } from "./t09b-helpers.js";
let app: FastifyInstance;
export function setApp(instance: FastifyInstance) {
  app = instance;
}
export async function signingFixture(app: FastifyInstance, count: number) {
  const fixture = await baseSigningFixture(app, count);
  await db.insert(contractVersions).values({
    contractId: fixture.contract.id,
    versionNumber: 1,
    content: fixture.contract.content,
    generatedContent: fixture.contract.generatedContent,
    snapshot: { variableDefinitions: [] },
  });
  return fixture;
}

type Headers = { authorization: string };
export function post(
  id: string,
  action: string,
  headers: Headers,
  payload: Record<string, unknown> = {},
) {
  return app.inject({ method: "POST", url: `/api/v1/contracts/${id}/${action}`, headers, payload });
}
export async function current(id: string) {
  return (await db.select().from(contracts).where(eq(contracts.id, id)))[0]!;
}
export async function sign(id: string, headers: Headers) {
  return app.inject({
    method: "POST",
    url: `/api/v1/contracts/${id}/sign`,
    headers: { ...headers, "content-type": "multipart/form-data; boundary=t09b" },
    payload: imageMultipart(validPng(), {
      acceptedDeclaration: "true",
      viewedAt: (await current(id)).updatedAt.toISOString(),
    }),
  });
}
export async function approve(id: string, headers: Headers) {
  expect((await post(id, "submit", headers)).statusCode).toBe(200);
  const approved = await post(id, "approve", headers);
  expect(approved.statusCode, approved.body).toBe(200);
}
