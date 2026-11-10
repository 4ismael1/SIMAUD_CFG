import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "./helpers.js";
import { contractFixture, imageMultipart, loginUser, validPng } from "./t09b-helpers.js";
import { contracts, contractSignatories } from "../src/db/schema.js";

export async function signingFixture(app: FastifyInstance, count = 3) {
  const admin = await loginUser(app, { role: "admin", name: "Administradora ajena" });
  const actors: Awaited<ReturnType<typeof loginUser>>[] = [];
  for (let index = 0; index < count; index++)
    actors.push(await loginUser(app, { name: `Firmante ${index}` }));
  const contract = await contractFixture(admin.user.id);
  await db.insert(contractSignatories).values(
    actors.map((actor, index) => ({
      contractId: contract.id,
      userId: actor.user.id,
      name: actor.user.name,
      email: actor.user.email,
      cedula: actor.user.cedula,
      role: "client" as const,
      signingOrder: index + 1,
    })),
  );
  const sign = async (index: number, fields: Record<string, string> = {}, image = validPng()) => {
    const [current] = await db.select().from(contracts).where(eq(contracts.id, contract.id));
    return app.inject({
      method: "POST",
      url: `/api/v1/contracts/${contract.id}/sign`,
      headers: { ...actors[index]!.headers, "content-type": "multipart/form-data; boundary=t09b" },
      payload: imageMultipart(image, {
        acceptedDeclaration: "true",
        viewedAt: current!.updatedAt.toISOString(),
        ...fields,
      }),
    });
  };
  const adjust = (index: number, placement = { x: 0.9, y: 0.1, scale: 0.5 }) =>
    app.inject({
      method: "PATCH",
      url: `/api/v1/contracts/${contract.id}/signatures/me/placement`,
      headers: actors[index]!.headers,
      payload: { placement },
    });
  const current = async () =>
    (await db.select().from(contracts).where(eq(contracts.id, contract.id)))[0]!;
  const seal = async () => {
    for (let index = 0; index < count; index++) {
      const response = await sign(index);
      if (response.statusCode !== 200) throw new Error(response.body);
    }
    return current();
  };
  return { admin, actors, contract, sign, adjust, current, seal };
}
