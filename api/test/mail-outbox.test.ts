import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  db,
  pool,
  prepareDatabase,
  cleanDatabase,
  createUser,
  signIn,
  authorization,
  testPassword,
} from "./helpers.js";
import { emailOutbox } from "../src/db/schema.js";
import { enqueueMail } from "../src/lib/mail/outbox.js";
import { MailDeliveryError } from "../src/lib/mail/transport.js";
import { dispatchEmails } from "../src/jobs/email-dispatch.js";
import { runJob } from "../src/jobs/index.js";
import { cleanup } from "../src/jobs/cleanup.js";
import { buildApp } from "../src/app.js";
import { addNotification } from "../src/modules/notifications/service.js";

beforeAll(prepareDatabase);
beforeEach(cleanDatabase);
afterAll(() => pool.end());
const now = new Date("2040-01-01T12:00:00Z");
const queue = () => db.transaction((tx) => enqueueMail(tx, "mail@example.com", "Prueba", "test"));
const row = async () => (await db.select().from(emailOutbox))[0]!;
it("la outbox participa en la transacción y desaparece con rollback", async () => {
  await expect(
    db.transaction(async (tx) => {
      await enqueueMail(tx, "mail@example.com", "Prueba", "test");
      throw new Error("rollback");
    }),
  ).rejects.toThrow("rollback");
  expect(await db.select().from(emailOutbox)).toHaveLength(0);
});
it("429 reintenta al minuto sin adelantar el intento; éxito guarda id", async () => {
  await queue();
  const mailer = vi
    .fn()
    .mockRejectedValueOnce(new MailDeliveryError(true, "HTTP_429"))
    .mockResolvedValue({ id: "provider-id" });
  expect(await dispatchEmails(mailer, now)).toEqual({ sent: 0, pending: 1, failed: 0 });
  expect((await row()).nextAttemptAt).toEqual(new Date(now.getTime() + 60000));
  await dispatchEmails(mailer, now);
  expect(mailer).toHaveBeenCalledTimes(1);
  await dispatchEmails(mailer, new Date(now.getTime() + 60000));
  expect(await row()).toMatchObject({
    status: "sent",
    attempts: 2,
    providerId: "provider-id",
    payload: {},
    lastError: null,
  });
});
it("4xx permanente marca failed al primer intento", async () => {
  await queue();
  await dispatchEmails(async () => {
    throw new MailDeliveryError(false, "HTTP_422");
  }, now);
  expect(await row()).toMatchObject({ status: "failed", attempts: 1 });
});
it("seis fallos temporales agotan reintentos exponenciales y ocultan errores arbitrarios", async () => {
  await queue();
  let clock = now;
  for (let attempt = 1; attempt <= 6; attempt++) {
    await dispatchEmails(async () => {
      throw new Error("secret-provider-token");
    }, clock);
    const mail = await row();
    expect(mail.attempts).toBe(attempt);
    expect(mail.nextAttemptAt.getTime() - clock.getTime()).toBe(60000 * 2 ** (attempt - 1));
    expect(mail.lastError).not.toContain("secret");
    clock = mail.nextAttemptAt;
  }
  expect((await row()).status).toBe("failed");
  const mailer = vi.fn();
  await dispatchEmails(mailer, clock);
  expect(mailer).not.toHaveBeenCalled();
});
it("dos instancias del job no envían dos veces el mismo correo", async () => {
  await queue();
  let release!: () => void;
  let entered!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const mailer = vi.fn(async () => {
    entered();
    await blocked;
  });
  const first = runJob("email-dispatch", mailer, now);
  await started;
  try {
    expect(await runJob("email-dispatch", mailer, now)).toMatchObject({ skipped: true });
    await dispatchEmails(mailer, now);
    expect(mailer).toHaveBeenCalledTimes(1);
  } finally {
    release();
    await first;
  }
  expect((await row()).status).toBe("sent");
});
it("cleanup elimina enviados de más de 30 días y conserva pendientes y fallidos", async () => {
  await queue();
  const first = await row();
  await db
    .update(emailOutbox)
    .set({ status: "sent", sentAt: new Date("2039-11-01") })
    .where(eq(emailOutbox.id, first.id));
  await queue();
  await db.insert(emailOutbox).values({
    to: "failed@example.com",
    subject: "Failed",
    template: "test",
    payload: {},
    status: "failed",
  });
  await db.insert(emailOutbox).values({
    to: "recent@example.com",
    subject: "Recent",
    template: "test",
    payload: {},
    status: "sent",
    sentAt: now,
  });
  expect((await cleanup("2040-01-01")).emails).toBe(1);
  expect(await db.select().from(emailOutbox)).toHaveLength(3);
});
it("los avisos respetan preferencias; los correos de seguridad siguen encolándose", async () => {
  const user = await createUser({
    notificationPreferences: {
      emailOnSignatureRequired: false,
      emailOnApprovalResult: false,
      emailOnExpiry: false,
    },
  });
  for (const type of [
    "signature_required",
    "approval_result",
    "contract_expiring",
    "contract_signed",
    "renewal_request",
    "renewal_approved",
    "renewal_rejected",
  ])
    await db.transaction((tx) =>
      addNotification(tx, { userId: user.id, type, title: "Contrato", message: "Aviso" }),
    );
  expect(await db.select().from(emailOutbox)).toHaveLength(0);
  const mailer = vi.fn().mockRejectedValue(new Error("provider-unavailable"));
  const app = await buildApp({ mailer });
  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password",
      payload: { email: user.email },
    });
    expect(response.statusCode).toBe(200);
    expect((await row()).template).toBe("password_reset");
    expect(mailer).not.toHaveBeenCalled();
    const mail = await row();
    // PostgreSQL conserva microsegundos que Date trunca al leer nextAttemptAt.
    const deliveryAt = new Date(mail.nextAttemptAt.getTime() + 1);
    expect(mail.expiresAt!.getTime()).toBeGreaterThan(deliveryAt.getTime());
    expect((await dispatchEmails(mailer, deliveryAt)).pending).toBe(1);
    expect(mailer).toHaveBeenCalledTimes(1);
    expect(await row()).toMatchObject({ status: "pending", attempts: 1 });
  } finally {
    await app.close();
  }
});
