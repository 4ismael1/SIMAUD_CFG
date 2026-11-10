import type { FastifyInstance } from "fastify";
import type { z } from "zod";
import { createUser } from "./helpers.js";
import { loginUser } from "./t09b-helpers.js";
import type { contractInput } from "../src/modules/contracts/schemas.js";
import type { RichDoc } from "../src/lib/rich-doc/types.js";

export const parties = ["arrendador", "arrendatario", "fiador"];
export const labels = ["EL ARRENDADOR", "EL ARRENDATARIO", "EL FIADOR"];
export function partyDocument(prefixes = parties): RichDoc {
  return {
    type: "doc",
    content: [
      ...prefixes.map((party) => ({
        type: "paragraph",
        content: ["nombre", "cedula", "email", "telefono", "cargo"].flatMap((suffix) => [
          { type: "variable", attrs: { name: `${party}_${suffix}` } },
          { type: "text", text: " | " },
        ]),
      })),
      {
        type: "signatures",
        attrs: { columns: 3 },
        content: prefixes.map((party, index) => ({
          type: "signatureSlot",
          attrs: { label: labels[index]!, party },
        })),
      },
    ],
  };
}

export async function roleFixture(app: FastifyInstance, prefixes = parties) {
  const admin = await loginUser(app, { role: "admin" });
  const people = [];
  for (let index = 0; index < 4; index++)
    people.push(
      await createUser({
        name: `Persona ${["Uno", "Dos", "Tres", "Cuatro"][index]}`,
        position: `Cargo ${index}`,
      }),
    );
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/templates",
    headers: admin.headers,
    payload: { title: "Arrendamiento", contentFormat: "rich-v2", content: partyDocument(prefixes) },
  });
  expectCreated(response);
  const input: z.infer<typeof contractInput> = {
    templateId: response.json<{ id: string }>().id,
    title: "Contrato por casillas",
    variables: {},
    value: "100.00",
    startDate: "2026-11-01",
    endDate: "2027-11-01",
    signatories: people.map((person, index) => ({
      name: person.name,
      email: person.email,
      phone: person.phone,
      cedula: person.cedula,
      slotIndex: index < 3 ? index : null,
      ...(index === 3 ? { role: "witness" as const } : {}),
    })),
  };
  const create = (body: object = input) =>
    app.inject({ method: "POST", url: "/api/v1/contracts", headers: admin.headers, payload: body });
  return { admin, people, input, create };
}

function expectCreated(response: { statusCode: number; body: string }) {
  if (response.statusCode !== 201) throw new Error(response.body);
}
