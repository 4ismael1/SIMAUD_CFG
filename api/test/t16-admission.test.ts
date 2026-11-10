import { barrier } from "./t16-barrier.js";
import { beforeAll, beforeEach, afterEach, afterAll, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { prepareDatabase, cleanDatabase, pool } from "./helpers.js";
import { testApp, loginUser, validPng, imageMultipart } from "./t09b-helpers.js";
import { AdmissionQueue } from "../src/lib/admission-queue.js";
import { withStorageMutation } from "../src/lib/storage.js";
import * as png from "../src/lib/storage-png.js";

let app: FastifyInstance;
beforeAll(prepareDatabase);
beforeEach(async () => {
  await cleanDatabase();
  app = await testApp();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await app.close();
});
afterAll(() => pool.end());

it("no decodifica el logo sin sesión, sin rol ni tras agotar el presupuesto temprano", async () => {
  const admin = await loginUser(app, { role: "admin" });
  const user = await loginUser(app);
  const patch = {
    institution: {
      name: "SIMAUD",
      rnc: "",
      address: "",
      logo: "data:image/png;base64," + validPng().toString("base64"),
    },
  };
  const decode = vi.spyOn(png, "sanitizePng");
  const change = (headers = {}, ip = "127.0.0.10") =>
    app.inject({
      method: "PATCH",
      url: "/api/v1/system/settings",
      headers,
      payload: patch,
      remoteAddress: ip,
    });
  expect((await change()).statusCode).toBe(401);
  expect((await change(user.headers)).statusCode).toBe(403);
  for (let index = 0; index < 100; index++)
    await app.inject({ url: "/api/v1/health", remoteAddress: "127.0.0.11" });
  expect((await change(admin.headers, "127.0.0.11")).statusCode).toBe(429);
  expect(decode).not.toHaveBeenCalled();
  expect((await change(admin.headers, "127.0.0.12")).statusCode).toBe(200);
  expect(decode).toHaveBeenCalledOnce();
});

it("la cola tiene capacidad finita y retirar una espera abortada libera inmediatamente su plaza", async () => {
  const queue = new AdmissionQueue(2);
  const release = await queue.acquire();
  const controller = new AbortController();
  const cancelled = queue.acquire(controller.signal);
  const rejected = expect(cancelled).rejects.toMatchObject({ statusCode: 409 });
  await expect(queue.acquire()).rejects.toMatchObject({ statusCode: 503 });
  controller.abort();
  await rejected;
  expect(queue.size).toBe(1);
  const pending = queue.acquire();
  release();
  (await pending)();
  expect(queue.size).toBe(0);
});

it("un proveedor detenido acota mutaciones y nunca ejecuta el trabajo que se abortó en espera", async () => {
  const actor = await loginUser(app);
  const entered = barrier();
  const resume = barrier();
  const first = withStorageMutation(async () => {
    entered.resolve();
    await resume.promise;
  });
  await entered.promise;
  const controller = new AbortController();
  const operation = vi.fn(async () => undefined);
  const aborted = withStorageMutation(operation, controller.signal);
  const cancelled = expect(aborted).rejects.toMatchObject({ statusCode: 409 });
  const waiting = Array.from({ length: 6 }, () => withStorageMutation(async () => undefined));
  try {
    const decoder = vi.spyOn(png, "sanitizePng");
    const upload = await app.inject({
      method: "PUT",
      url: "/api/v1/me/avatar",
      headers: { ...actor.headers, "content-type": "multipart/form-data; boundary=t09b" },
      payload: imageMultipart(validPng(), {}, "avatar"),
    });
    expect(upload.statusCode).toBe(503);
    expect(upload.headers["retry-after"]).toBeDefined();
    expect(decoder).not.toHaveBeenCalled();
    await expect(withStorageMutation(async () => undefined)).rejects.toMatchObject({
      statusCode: 503,
    });
    controller.abort();
    await cancelled;
    expect(operation).not.toHaveBeenCalled();
  } finally {
    resume.resolve();
    await Promise.all([first, ...waiting]);
  }
});
