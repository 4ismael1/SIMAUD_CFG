import { afterEach, beforeEach, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { X509Certificate, createPrivateKey, generateKeyPairSync } from "node:crypto";
import { generateSigningKey } from "../src/db/generate-signing-key.js";
import { env } from "../src/config/env.js";
import { initializeSigning, sealPdf, verifySystemSeal } from "../src/lib/crypto/system-signing.js";

let root: string;
const original = {
  SIGNING_KEY_PATH: env.SIGNING_KEY_PATH,
  SIGNING_CERT_PATH: env.SIGNING_CERT_PATH,
  SIGNING_KEY_PASSPHRASE: env.SIGNING_KEY_PASSPHRASE,
  SIGNING_TRUST_PATH: env.SIGNING_TRUST_PATH,
};
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "simaud-t10-cert-"));
});
afterEach(async () => {
  Object.assign(env, original);
  await rm(root, { recursive: true, force: true });
});
const hasOpenSsl =
  spawnSync("openssl", ["version"], { stdio: "ignore", windowsHide: true }).status === 0;

it.skipIf(!hasOpenSsl)(
  "genera X.509 Ed25519, rechaza passphrase incorrecta, verifica el sello y no reemplaza claves",
  async () => {
    const configuration = {
      SIGNING_KEY_PATH: path.join(root, "key.pem"),
      SIGNING_CERT_PATH: path.join(root, "cert.pem"),
      SIGNING_KEY_PASSPHRASE: "test-only-passphrase",
      SIGNING_TRUST_PATH: undefined,
    };
    generateSigningKey(configuration);
    const keyBytes = await readFile(configuration.SIGNING_KEY_PATH);
    const certificate = new X509Certificate(await readFile(configuration.SIGNING_CERT_PATH));
    expect(
      certificate.checkPrivateKey(
        createPrivateKey({ key: keyBytes, passphrase: configuration.SIGNING_KEY_PASSPHRASE }),
      ),
    ).toBe(true);
    Object.assign(env, configuration, { SIGNING_KEY_PASSPHRASE: "incorrect" });
    expect(initializeSigning).toThrow("No se pudo cargar el sello");
    Object.assign(env, configuration);
    initializeSigning();
    const seal = sealPdf({
      format: "simaud-detached-v1",
      contractId: "test",
      contractVersion: 1,
      verificationCode: "test",
      activatedAt: "2026-11-10T00:00:00.000Z",
      documentSha256: "a".repeat(64),
      finalPdfSha256: "b".repeat(64),
      evidenceHead: null,
      auditHead: null,
    });
    expect(verifySystemSeal(seal)).toBe(true);
    expect(
      verifySystemSeal({ ...seal, payload: { ...seal.payload, finalPdfSha256: "c".repeat(64) } }),
    ).toBe(false);
    const untrusted = generateKeyPairSync("ed25519")
      .publicKey.export({ type: "spki", format: "pem" })
      .toString();
    expect(verifySystemSeal({ ...seal, certificate: untrusted })).toBe(false);
    expect(() => generateSigningKey(configuration)).toThrow("No se generó el sello");
    expect(await readFile(configuration.SIGNING_KEY_PATH)).toEqual(keyBytes);
  },
);
