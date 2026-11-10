import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
  X509Certificate,
  type KeyObject,
} from "node:crypto";
import { env } from "../../config/env.js";
import { canonicalJson, sha256 } from "./canonical.js";

export interface SealPayload {
  format: "simaud-detached-v1";
  contractId: string;
  contractVersion: number;
  verificationCode: string;
  activatedAt: string;
  documentSha256: string;
  finalPdfSha256: string;
  evidenceHead: string | null;
  auditHead: string | null;
}
export interface SystemSeal {
  payload: SealPayload;
  signature: string;
  certificate: string;
  fingerprint: string;
}
let signingMaterial: { privateKey: KeyObject; certificate: string } | undefined;

export function initializeSigning() {
  if (signingMaterial) return;
  if (!env.SIGNING_KEY_PATH || !env.SIGNING_CERT_PATH) {
    if (env.NODE_ENV !== "test")
      throw new Error("Configura SIGNING_KEY_PATH y SIGNING_CERT_PATH para el sello del sistema.");
    const pair = generateKeyPairSync("ed25519");
    signingMaterial = {
      privateKey: pair.privateKey,
      certificate: pair.publicKey.export({ type: "spki", format: "pem" }).toString(),
    };
    return;
  }
  try {
    const privateKey = createPrivateKey({
      key: readFileSync(env.SIGNING_KEY_PATH),
      passphrase: env.SIGNING_KEY_PASSPHRASE,
    });
    const certificate = new X509Certificate(readFileSync(env.SIGNING_CERT_PATH));
    if (
      !certificate.checkPrivateKey(privateKey) ||
      !["ed25519", "ec"].includes(privateKey.asymmetricKeyType ?? "")
    )
      throw new Error("key");
    if (
      privateKey.asymmetricKeyType === "ec" &&
      privateKey.asymmetricKeyDetails?.namedCurve !== "prime256v1"
    )
      throw new Error("curve");
    if (
      Date.now() < Date.parse(certificate.validFrom) ||
      Date.now() > Date.parse(certificate.validTo)
    )
      throw new Error("expiry");
    signingMaterial = { privateKey, certificate: certificate.toString() };
  } catch {
    throw new Error(
      "No se pudo cargar el sello: revisa clave, certificado, vigencia y passphrase.",
    );
  }
}

const algorithm = (key: KeyObject) => (key.asymmetricKeyType === "ed25519" ? null : "sha256");

export function sealPdf(payload: SealPayload): SystemSeal {
  initializeSigning();
  const { privateKey, certificate } = signingMaterial!;
  return {
    payload,
    certificate,
    fingerprint: sha256(certificate),
    signature: sign(
      algorithm(privateKey),
      Buffer.from(canonicalJson(payload)),
      privateKey,
    ).toString("base64"),
  };
}

export function verifySystemSeal(seal: SystemSeal | null) {
  if (!seal) return false;
  try {
    initializeSigning();
    const trusted = [signingMaterial!.certificate];
    if (env.SIGNING_TRUST_PATH)
      for (const name of readdirSync(env.SIGNING_TRUST_PATH).filter((name) =>
        name.endsWith(".pem"),
      ))
        trusted.push(
          new X509Certificate(readFileSync(path.join(env.SIGNING_TRUST_PATH, name))).toString(),
        );
    if (!trusted.includes(seal.certificate)) return false;
    const publicKey = seal.certificate.includes("BEGIN CERTIFICATE")
      ? new X509Certificate(seal.certificate).publicKey
      : createPublicKey(seal.certificate);
    if (sha256(seal.certificate) !== seal.fingerprint) return false;
    return verify(
      algorithm(publicKey),
      Buffer.from(canonicalJson(seal.payload)),
      publicKey,
      Buffer.from(seal.signature, "base64"),
    );
  } catch {
    return false;
  }
}
