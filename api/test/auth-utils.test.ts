import { describe, it, expect } from "vitest";
import { decodeJwt, SignJWT } from "jose";
import { createAccessToken, verifyAccessToken } from "../src/lib/auth/jwt.js";
import { loadEnv, env } from "../src/config/env.js";
import { registerBody, resetBody } from "../src/modules/auth/schemas.js";
import { patchUserBody } from "../src/modules/users/schemas.js";
describe("validación y JWT", () => {
  it("JWT HS256 dura 15 minutos y contiene sub, role y sesión", async () => {
    const token = await createAccessToken(
      { id: "00000000-0000-4000-8000-000000000001", role: "gestor" },
      "00000000-0000-4000-8000-000000000002",
    );
    const verified = await verifyAccessToken(token);
    expect(verified.sub).toBe("00000000-0000-4000-8000-000000000001");
    expect(verified.role).toBe("gestor");
    expect(verified.sid).toBe("00000000-0000-4000-8000-000000000002");
    expect(verified.exp! - verified.iat!).toBe(900);
    expect(decodeJwt(token).role).toBe("gestor");
  });
  it("JWT rechaza firma ajena, caducidad y algoritmo distinto", async () => {
    const key = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
    const options = { role: "admin" };
    const wrong = await new SignJWT(options)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("simaud-api")
      .setAudience("simaud-web")
      .setExpirationTime("15m")
      .sign(new TextEncoder().encode("a".repeat(32)));
    const expired = await new SignJWT(options)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("simaud-api")
      .setAudience("simaud-web")
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1)
      .sign(key);
    const algorithm = await new SignJWT(options)
      .setProtectedHeader({ alg: "HS384" })
      .setIssuer("simaud-api")
      .setAudience("simaud-web")
      .setExpirationTime("15m")
      .sign(key);
    for (const token of [wrong, expired, algorithm])
      await expect(verifyAccessToken(token)).rejects.toThrow();
  });
  it("registro normaliza email y descarta rol y otros atributos", () => {
    const input = registerBody.parse({
      email: " EXAMPLE@EXAMPLE.COM ",
      password: "Password123",
      name: "Nombre",
      phone: "",
      cedula: "",
      role: "admin",
      isActive: true,
    });
    expect(input.email).toBe("example@example.com");
    expect(input).not.toHaveProperty("role");
    expect(input).not.toHaveProperty("isActive");
  });
  it("contraseñas requieren letra y número, y tokens exactamente 32 bytes hex", () => {
    for (const password of ["abc", "abcdefgh", "12345678"])
      expect(resetBody.safeParse({ token: "a".repeat(64), password }).success).toBe(false);
    expect(resetBody.safeParse({ token: "a".repeat(64), password: "Password123" }).success).toBe(
      true,
    );
    expect(resetBody.safeParse({ token: "bad", password: "Password123" }).success).toBe(false);
  });
  it("parches de usuarios vacíos o con campos sensibles no son válidos", () => {
    expect(patchUserBody.safeParse({}).success).toBe(false);
    expect(patchUserBody.safeParse({ passwordHash: "bad" }).success).toBe(false);
    expect(patchUserBody.safeParse({ role: "admin" }).success).toBe(true);
  });
  it("env informa claves inválidas sin revelar valores", () => {
    const source = {
      DATABASE_URL: "postgresql://user:example@localhost/simaud_dev",
      DATABASE_URL_TEST: "postgresql://user:example@localhost/simaud_test",
      JWT_ACCESS_SECRET: "short-sensitive-secret",
      APP_URL: "http://localhost:5173",
      PORT: "3000",
    };
    expect(() => loadEnv(source)).toThrow("JWT_ACCESS_SECRET");
    try {
      loadEnv(source);
    } catch (error) {
      expect(String(error)).not.toContain(source.JWT_ACCESS_SECRET);
      expect(String(error)).not.toContain(source.DATABASE_URL);
    }
    expect(() =>
      loadEnv({
        ...source,
        JWT_ACCESS_SECRET: "a".repeat(32),
        NODE_ENV: "production",
      }),
    ).toThrow("SMTP_URL");
  });
});
