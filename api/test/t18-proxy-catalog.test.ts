import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { cleanDatabase, db, pool, prepareDatabase } from "./helpers.js";
import { testApp, imageMultipart, validPng } from "./t09b-helpers.js";
import { signingFixture } from "./t18-helpers.js";
import { env } from "../src/config/env.js";
import { signatureEvidence, contractTemplates } from "../src/db/schema.js";
import { formatVariable } from "../src/lib/render-template.js";
import { formatCedula } from "../src/lib/validation/format-cedula.js";
import { warnMissingTrustProxy } from "../src/lib/client-ip.js";

beforeAll(prepareDatabase);
beforeEach(cleanDatabase);
afterAll(() => pool.end());

it("avisa al arrancar en producción sin TRUST_PROXY y respeta una configuración explícita", () => {
  const messages: string[] = [];
  const logger = { warn: (message: string) => messages.push(message) };
  warnMissingTrustProxy("production", undefined, logger);
  warnMissingTrustProxy("production", "1", logger);
  warnMissingTrustProxy("development", undefined, logger);
  expect(messages).toHaveLength(1);
  expect(messages[0]).toContain("TRUST_PROXY");
});

for (const scenario of [
  {
    hops: false as const,
    remote: "::ffff:198.51.100.20",
    forwarded: "203.0.113.99",
    expected: "198.51.100.20",
  },
  {
    hops: 1,
    remote: "127.0.0.1",
    forwarded: "203.0.113.99, ::ffff:198.51.100.20",
    expected: "198.51.100.20",
  },
  {
    hops: 2,
    remote: "127.0.0.1",
    forwarded: "203.0.113.99, 198.51.100.20, 10.0.0.1",
    expected: "198.51.100.20",
  },
])
  it(`registra IP real con TRUST_PROXY=${scenario.hops} e ignora prefijos XFF falsificados`, async () => {
    const original = env.TRUST_PROXY;
    env.TRUST_PROXY = scenario.hops;
    const app = await testApp();
    try {
      const fixture = await signingFixture(app, 2);
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/contracts/${fixture.contract.id}/sign`,
        headers: {
          ...fixture.actors[0]!.headers,
          "x-forwarded-for": scenario.forwarded,
          "content-type": "multipart/form-data; boundary=t09b",
        },
        remoteAddress: scenario.remote,
        payload: imageMultipart(validPng(), {
          acceptedDeclaration: "true",
          viewedAt: fixture.contract.updatedAt.toISOString(),
        }),
      });
      expect(response.statusCode, response.body).toBe(200);
      expect((await db.select().from(signatureEvidence))[0]!.payload.ip).toBe(scenario.expected);
    } finally {
      env.TRUST_PROXY = original;
      await app.close();
    }
  });

it("busca comodines de catálogo literalmente, avisa de bloque de firmas y rechaza entradas desconocidas", async () => {
  const app = await testApp();
  try {
    const fixture = await signingFixture(app, 1);
    const [plain, rich] = await db
      .insert(contractTemplates)
      .values([
        { title: "Plantilla_%literal", content: "Firma ____", status: "active" },
        {
          title: "Plantilla normal",
          contentFormat: "rich-v2",
          content: JSON.stringify({
            type: "doc",
            content: [
              { type: "signatures", content: [{ type: "signatureSlot", attrs: { label: "" } }] },
            ],
          }),
          status: "active",
        },
      ])
      .returning();
    const get = (url: string) =>
      app.inject({ url: "/api/v1" + url, headers: fixture.admin.headers });
    expect(
      (await get("/templates?q=" + encodeURIComponent("_%")))
        .json()
        .map((row: { id: string }) => row.id),
    ).toEqual([plain!.id]);
    expect((await get("/templates/" + plain!.id)).json().hasSignatureBlock).toBe(false);
    expect((await get("/templates/" + rich!.id)).json().hasSignatureBlock).toBe(true);
    expect((await get("/templates?extra=1")).statusCode).toBe(400);
    expect((await get("/templates?q=" + "a".repeat(201))).statusCode).toBe(400);
    expect((await get("/variables?extra=1")).statusCode).toBe(400);
    expect((await get("/templates/" + plain!.id + "?extra=1")).statusCode).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/templates/preview",
          headers: fixture.admin.headers,
          payload: { content: "Texto", values: {}, extra: true },
        })
      ).statusCode,
    ).toBe(400);
  } finally {
    await app.close();
  }
});

it("formatea las cédulas guardadas con o sin separadores al renderizar variables", () => {
  for (const value of ["00112345673", "001-1234567-3"]) {
    expect(formatCedula(value)).toBe("001-1234567-3");
    expect(formatVariable(value, { name: "documento", type: "cedula" }, "documento")).toBe(
      "001-1234567-3",
    );
    expect(formatVariable(value, undefined, "cliente_cedula")).toBe("001-1234567-3");
  }
});
