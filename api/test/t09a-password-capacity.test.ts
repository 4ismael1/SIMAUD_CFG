import { afterEach, expect, it, vi } from "vitest";
import argon2 from "argon2";
import { hashPassword, verifyPassword } from "../src/lib/auth/password.js";
import { concurrencyLimit } from "../src/lib/auth/concurrency.js";
afterEach(() => vi.restoreAllMocks());

it("hash y verificación comparten máximo de cuatro trabajos Argon2 simultáneos", async () => {
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.spyOn(argon2, "hash").mockImplementation(async () => {
    await blocked;
    return "hash";
  });
  vi.spyOn(argon2, "verify").mockImplementation(async () => {
    await blocked;
    return true;
  });
  const running = [
    hashPassword("one"),
    hashPassword("two"),
    verifyPassword("hash", "three"),
    verifyPassword("hash", "four"),
  ];
  try {
    await expect(hashPassword("fifth")).rejects.toMatchObject({
      statusCode: 503,
      code: "RATE_LIMITED",
    });
    await expect(verifyPassword("hash", "sixth")).rejects.toMatchObject({ statusCode: 503 });
    expect(argon2.hash).toHaveBeenCalledTimes(2);
    expect(argon2.verify).toHaveBeenCalledTimes(2);
  } finally {
    release();
    await Promise.all(running);
  }
  await expect(hashPassword("next")).resolves.toBe("hash");
});

it("el semáforo libera capacidad también cuando Argon2 falla", async () => {
  const run = concurrencyLimit(1);
  await expect(
    run(async () => {
      throw new Error("fallo controlado");
    }),
  ).rejects.toThrow("fallo controlado");
  await expect(run(async () => "ok")).resolves.toBe("ok");
});
