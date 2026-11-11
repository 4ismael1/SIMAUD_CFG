import { afterEach, expect, it, vi } from "vitest";
import nodemailer from "nodemailer";
import { resendTransport, smtpTransport, logTransport } from "../src/lib/mail/transports.js";
import { MailDeliveryError, type MailMessage } from "../src/lib/mail/transport.js";
import { mailTemplates, renderMail } from "../src/lib/mail/templates/index.js";
import { loadEnv } from "../src/config/env.js";

const config = {
  MAIL_DRIVER: "resend" as const,
  MAIL_FROM: "SIMAUD <mail@example.com>",
  MAIL_REPLY_TO: "help@example.com",
  RESEND_API_KEY: "test-key",
  SMTP_URL: "smtps://test:example@localhost:465",
};
const message: MailMessage = {
  to: "to@example.com",
  subject: "Prueba",
  template: "test",
  text: "token=secret-test-token",
  html: "<p>Prueba</p>",
  idempotencyKey: "outbox-id",
};
afterEach(() => vi.restoreAllMocks());
it("Resend transmite contenido, reply-to e idempotencia y conserva el id", async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(JSON.stringify({ id: "provider-id" })));
  expect(await resendTransport(config, request).send(message)).toEqual({ id: "provider-id" });
  const [url, options] = request.mock.calls[0]!;
  expect(url).toBe("https://api.resend.com/emails");
  expect(options?.headers).toMatchObject({
    Authorization: "Bearer test-key",
    "Idempotency-Key": "outbox-id",
  });
  expect(JSON.parse(String(options?.body))).toMatchObject({
    from: config.MAIL_FROM,
    reply_to: config.MAIL_REPLY_TO,
    to: message.to,
    html: message.html,
    text: message.text,
  });
});
it.each([429, 500, 503, 408])(
  "Resend clasifica HTTP %i como temporal sin guardar cuerpo",
  async (status) => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("secret-provider-body", { status }));
    await expect(resendTransport(config, request).send(message)).rejects.toMatchObject({
      temporary: true,
      code: "HTTP_" + status,
    });
  },
);
it.each([400, 401, 403, 422])("Resend clasifica HTTP %i como permanente", async (status) => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response("secret-provider-body", { status }));
  await expect(resendTransport(config, request).send(message)).rejects.toMatchObject({
    temporary: false,
  });
});
it("Resend clasifica timeouts y errores de red sin filtrar sus mensajes", async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockRejectedValue(new DOMException("secret-token", "TimeoutError"));
  await expect(resendTransport(config, request).send(message)).rejects.toEqual(
    new MailDeliveryError(true, "RESEND_CONNECTION"),
  );
});
it("SMTP envía con nodemailer y conserva el id", async () => {
  const sendMail = vi.fn().mockResolvedValue({ messageId: "smtp-id", rejected: [] });
  vi.spyOn(nodemailer, "createTransport").mockReturnValue({ sendMail } as unknown as ReturnType<
    typeof nodemailer.createTransport
  >);
  expect(await smtpTransport(config).send(message)).toEqual({ id: "smtp-id" });
  expect(sendMail).toHaveBeenCalledWith(
    expect.objectContaining({
      replyTo: config.MAIL_REPLY_TO,
      messageId: "<outbox-id@simaud>",
      text: message.text,
    }),
  );
});
it.each([
  [451, true],
  [550, false],
  [535, false],
  [0, true],
])("SMTP clasifica %i correctamente", async (responseCode, temporary) => {
  const sendMail = vi.fn().mockRejectedValue({ responseCode, message: "password=secret" });
  vi.spyOn(nodemailer, "createTransport").mockReturnValue({ sendMail } as unknown as ReturnType<
    typeof nodemailer.createTransport
  >);
  await expect(smtpTransport(config).send(message)).rejects.toMatchObject({ temporary });
});
it("log imprime solo destinatario, asunto y tipo, sin cuerpos ni tokens", async () => {
  const log = vi.fn();
  await logTransport(log).send(message);
  expect(log).toHaveBeenCalledExactlyOnceWith({
    to: message.to,
    subject: message.subject,
    type: "test",
  });
  expect(JSON.stringify(log.mock.calls)).not.toContain("secret-test-token");
});
it.each(mailTemplates)(
  "la plantilla %s escapa todo dato e incluye texto y enlace APP_URL",
  (template) => {
    const result = renderMail(template, {
      name: '<img src=x onerror="alert(1)">',
      message: "<script>&'",
      contractId: 'id"<',
      token: 'token"<&',
    });
    // Only the embedded logo may be an image; the injected tag must come out escaped.
    expect(result.html).not.toContain("<img src=x");
    expect(result.html).not.toContain('onerror="');
    expect(result.html).toContain('src="cid:simaud-logo"');
    expect(result.attachments[0]).toMatchObject({ cid: "simaud-logo", contentType: "image/png" });
    expect(result.html).not.toContain("<script>");
    expect(result.html).toContain("&lt;script&gt;&amp;&#39;");
    expect(result.html).toContain('width="600"');
    expect(result.html).toContain("#8B2029");
    expect(result.text).toContain("<script>&'");
    const link = new URL(result.text.trim().split(/\s+/).at(-1)!);
    expect([
      "/auth/confirmar",
      "/auth/restablecer",
      "/auth/recuperar",
      "/app/firmas",
      "/app/contratos/id%22%3C",
      "/app/contratos/id%22%3C/firmar",
      "/app/aprobaciones",
      "/app",
      "/",
    ]).toContain(link.pathname);
  },
);
const environment = {
  SIGNING_KEY_PATH: "/run/secrets/signing-key.pem",
  SIGNING_CERT_PATH: "/run/secrets/signing-cert.pem",
  DATABASE_URL: "postgresql://test:example@localhost/dev",
  MAIL_PAYLOAD_KEY: "ab".repeat(32),
  SETTINGS_ENCRYPTION_KEY: "cd".repeat(32),
  JWT_ACCESS_SECRET: "x".repeat(32),
  APP_URL: "https://simaud.example.com",
};
it("producción no requiere BD de pruebas y valida proveedor, remitente y HOST", () => {
  expect(loadEnv(environment).HOST).toBe("127.0.0.1");
  expect(loadEnv(environment).MAIL_DRIVER).toBe("log");
  expect(() => loadEnv({ ...environment, SMTP_URL: "https://mail.example.com" })).toThrow(
    "SMTP_URL",
  );
  expect(() => loadEnv({ ...environment, MAIL_FROM: "invalid" })).toThrow("MAIL_FROM");
  expect(() => loadEnv({ ...environment, NODE_ENV: "production" })).toThrow("MAIL_DRIVER");
  expect(() => loadEnv({ ...environment, MAIL_DRIVER: "smtp" })).toThrow("MAIL_FROM");
  expect(() =>
    loadEnv({ ...environment, MAIL_DRIVER: "smtp", MAIL_FROM: config.MAIL_FROM }),
  ).toThrow("SMTP_URL");
  expect(() =>
    loadEnv({ ...environment, MAIL_DRIVER: "resend", MAIL_FROM: config.MAIL_FROM }),
  ).toThrow("RESEND_API_KEY");
  expect(() => loadEnv({ ...environment, HOST: "http://bad" })).toThrow("HOST");
  expect(
    loadEnv({ ...environment, ...config, NODE_ENV: "production", HOST: "0.0.0.0" })
      .DATABASE_URL_TEST,
  ).toBeUndefined();
});
