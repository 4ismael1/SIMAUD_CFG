import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import net from "node:net";
import path from "node:path";
import {
  envPath,
  isolatedEnvironment,
  readEnvironment,
  root,
} from "./environment.mjs";

export function resetUiDatabase() {
  execute("db/seed-e2e.js", readEnvironment());
}

async function requireFreePort(port) {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", () =>
      reject(new Error(`El puerto e2e ${port} está ocupado.`)),
    );
    server.listen(port, () => server.close(resolve));
  });
}

function execute(script, settings) {
  const result = spawnSync(
    process.execPath,
    [path.join(root, "e2e/.storage/api", script)],
    {
      cwd: path.join(root, "e2e/.storage"),
      env: isolatedEnvironment(settings),
      encoding: "utf8",
      windowsHide: true,
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `Falló la preparación de ${path.basename(script)}. Salida privada omitida.`,
    );
  }
}

export async function prepare(runDirectory) {
  await requireFreePort(3100);
  await requireFreePort(5175);
  mkdirSync(path.join(root, "e2e/.storage"), { recursive: true });
  for (const directory of ["node_modules", "assets", "drizzle"]) {
    const destination = path.join(root, "e2e/.storage", directory);
    if (!existsSync(destination))
      symlinkSync(path.join(root, "api", directory), destination, "junction");
  }
  const build = spawnSync(
    process.execPath,
    [
      path.join(root, "api/node_modules/typescript/bin/tsc"),
      "-p",
      path.join(root, "api/tsconfig.build.json"),
      "--outDir",
      path.join(root, "e2e/.storage/api"),
    ],
    { cwd: root, encoding: "utf8", windowsHide: true },
  );
  if (build.status !== 0)
    throw new Error(`Falló la compilación e2e. ${build.stdout}`);
  const secretDirectory = path.join(
    root,
    "e2e/.secrets",
    path.basename(runDirectory),
  );
  mkdirSync(secretDirectory, { recursive: true, mode: 0o700 });
  const settings = {
    NODE_ENV: "development",
    DATABASE_URL: "postgres://simaud@127.0.0.1:55433/simaud_e2e",
    DATABASE_URL_TEST: "postgres://simaud@127.0.0.1:55433/simaud_e2e",
    JWT_ACCESS_SECRET: randomBytes(48).toString("hex"),
    SETTINGS_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
    MAIL_PAYLOAD_KEY: randomBytes(32).toString("hex"),
    SIGNING_KEY_PATH: path.join(secretDirectory, "seal.key"),
    SIGNING_CERT_PATH: path.join(secretDirectory, "seal.crt"),
    APP_URL: "http://localhost:5175",
    MAIL_DRIVER: "log",
    JOBS_ENABLED: "false",
    HOST: "127.0.0.1",
    PORT: "3100",
  };
  for (const account of [
    "ADMIN",
    "SUPERVISOR",
    "GESTOR",
    "SIGNER_A",
    "SIGNER_B",
    "WITNESS",
  ]) {
    settings[`E2E_${account}_PASSWORD`] = randomBytes(24).toString("base64url");
  }
  writeFileSync(
    envPath,
    Object.entries(settings)
      .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
      .join("\n") + "\n",
    { mode: 0o600 },
  );
  execute("db/generate-signing-key.js", settings);
  execute("db/seed-e2e.js", settings);
}
