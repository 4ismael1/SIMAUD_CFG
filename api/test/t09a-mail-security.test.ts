import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { emailOutbox } from "../src/db/schema.js";
import { enqueueMail } from "../src/lib/mail/outbox.js";
import { decryptPayload, encryptPayload, payloadContext } from "../src/lib/mail/payload.js";
import { MailDeliveryError } from "../src/lib/mail/transport.js";
import { dispatchEmails } from "../src/jobs/email-dispatch.js";
import { loadEnv } from "../src/config/env.js";
import { cleanDatabase, db, pool, prepareDatabase } from "./helpers.js";

beforeAll(prepareDatabase);
beforeEach(cleanDatabase);
afterAll(() => pool.end());
const secret = "test-token-that-must-never-be-persisted-in-clear";
const now = new Date("2040-01-01T12:00:00Z");
const expiry = new Date("2040-01-01T13:00:00Z");
const row = async () => (await db.select().from(emailOutbox))[0]!;
const queue = () =>
  db.transaction((tx) =>
    enqueueMail(
      tx,
      "user@example.com",
      "Recuperación",
      "password_reset",
      { name: "Persona", token: secret },
      expiry,
    ),
  );
async function expectScrubbed() {
  const mail = await row();
  expect(mail.payload).toEqual({});
  expect(mail.encryptedPayload).toBeNull();
  expect(JSON.stringify(mail)).not.toContain(secret);
}

it("AES-GCM conserva el secreto solo cifrado y reconstruye el enlace al enviar", async () => {
  await queue();
  const mail = await row();
  expect(mail.payload).toEqual({});
  expect(mail.expiresAt).toEqual(expiry);
  expect(typeof mail.encryptedPayload).toBe("string");
  expect(JSON.stringify(mail)).not.toContain(secret);
  expect(
    decryptPayload(mail.encryptedPayload!, payloadContext(mail.to, mail.template)).token === secret,
  ).toBe(true);
  let delivered = false;
  await dispatchEmails(async (message) => {
    delivered = message.text.includes(encodeURIComponent(secret));
    return { id: "provider-id" };
  }, now);
  expect(delivered).toBe(true);
  expect((await row()).status).toBe("sent");
  await expectScrubbed();
});

it("el cifrado usa nonces distintos y detecta alteración o cambio de destinatario", () => {
  const context = payloadContext("user@example.com", "password_reset");
  const first = encryptPayload({ token: secret }, context);
  const second = encryptPayload({ token: secret }, context);
  expect(first === second).toBe(false);
  expect(() =>
    decryptPayload(first, payloadContext("other@example.com", "password_reset")),
  ).toThrow();
  const envelope = JSON.parse(first) as { data: string };
  envelope.data = Buffer.from("alterado").toString("base64");
  expect(() => decryptPayload(JSON.stringify(envelope), context)).toThrow();
});

it("un fallo temporal conserva solo cifrado; el terminal limpia ambos payloads y errores", async () => {
  await queue();
  await dispatchEmails(async () => {
    throw new Error(secret);
  }, now);
  const pending = await row();
  expect(pending.status).toBe("pending");
  expect(pending.encryptedPayload !== null).toBe(true);
  expect(JSON.stringify(pending)).not.toContain(secret);
  await dispatchEmails(async () => {
    throw new MailDeliveryError(false, secret);
  }, pending.nextAttemptAt);
  expect((await row()).status).toBe("failed");
  await expectScrubbed();
});

it("el sexto fallo temporal limpia el secreto cifrado", async () => {
  await queue();
  let clock = now;
  for (let attempt = 0; attempt < 6; attempt++) {
    await dispatchEmails(async () => {
      throw new Error(secret);
    }, clock);
    clock = (await row()).nextAttemptAt;
  }
  expect((await row()).status).toBe("failed");
  expect((await row()).attempts).toBe(6);
  await expectScrubbed();
});

it("el job purga expirados incluso si no toca reintentar o ya estaban fallidos", async () => {
  await queue();
  await db.update(emailOutbox).set({ nextAttemptAt: new Date("2041-01-01") });
  const mailer = vi.fn();
  await dispatchEmails(mailer, expiry);
  expect(mailer).not.toHaveBeenCalled();
  expect((await row()).status).toBe("failed");
  await expectScrubbed();
  await cleanDatabase();
  await queue();
  await db.update(emailOutbox).set({ status: "failed" });
  await dispatchEmails(mailer, expiry);
  await expectScrubbed();
});

it("encolar y cifrar participan del rollback sin dejar correo", async () => {
  await expect(
    db.transaction(async (tx) => {
      await enqueueMail(
        tx,
        "user@example.com",
        "Recuperar",
        "password_reset",
        { token: secret },
        expiry,
      );
      throw new Error("rollback");
    }),
  ).rejects.toThrow("rollback");
  expect(await db.select().from(emailOutbox)).toHaveLength(0);
});

it("MAIL_PAYLOAD_KEY exige 32 bytes hex fuera de test sin revelar valores", () => {
  const config = {
    NODE_ENV: "development",
    DATABASE_URL: "postgresql://test:example@localhost/dev",
    JWT_ACCESS_SECRET: "x".repeat(32),
    APP_URL: "https://example.com",
  };
  expect(() => loadEnv(config)).toThrow("MAIL_PAYLOAD_KEY");
  expect(() => loadEnv({ ...config, MAIL_PAYLOAD_KEY: "sensitive-invalid-key" })).toThrow(
    "MAIL_PAYLOAD_KEY",
  );
  let message = "";
  try {
    loadEnv({ ...config, MAIL_PAYLOAD_KEY: "sensitive-invalid-key" });
  } catch (error) {
    message = String(error);
  }
  expect(message).not.toContain("sensitive-invalid-key");
  expect(() => loadEnv({ ...config, MAIL_PAYLOAD_KEY: "ab".repeat(32) })).not.toThrow();
  expect(() =>
    loadEnv({
      ...config,
      NODE_ENV: "test",
      DATABASE_URL_TEST: "postgresql://test:example@localhost/simaud_test2",
    }),
  ).not.toThrow();
});
