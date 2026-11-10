import "dotenv/config";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, chmodSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function generateSigningKey(source: NodeJS.ProcessEnv = process.env) {
  const keyPath = source.SIGNING_KEY_PATH;
  const certPath = source.SIGNING_CERT_PATH;
  try {
    if (!keyPath || !certPath || path.resolve(keyPath) === path.resolve(certPath))
      throw new Error("paths");
    if (existsSync(keyPath) || existsSync(certPath)) throw new Error("exists");
    for (const filename of [keyPath, certPath])
      mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
    const protection = source.SIGNING_KEY_PASSPHRASE
      ? ["-passout", "env:SIGNING_KEY_PASSPHRASE"]
      : ["-noenc"];
    const result = spawnSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "ed25519",
        ...protection,
        "-days",
        "365",
        "-subj",
        "/CN=SIMAUD staging system seal",
        "-keyout",
        keyPath,
        "-out",
        certPath,
      ],
      { env: { ...process.env, ...source }, stdio: "ignore", windowsHide: true },
    );
    if (result.status !== 0) throw new Error("openssl");
    if (process.platform !== "win32") chmodSync(keyPath, 0o600);
  } catch {
    throw new Error(
      "No se generó el sello. Configura rutas nuevas SIGNING_KEY_PATH/SIGNING_CERT_PATH y comprueba OpenSSL 3 y permisos.",
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    generateSigningKey();
    console.info("Clave y certificado de staging creados. No representan acreditación de una CA.");
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
