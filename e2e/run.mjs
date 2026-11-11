import { mkdirSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { root } from "./environment.mjs";
import { prepare } from "./prepare.mjs";

const mode = process.argv[2] ?? "headless";
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const runDirectory = path.join(root, "e2e/output", timestamp);
mkdirSync(runDirectory, { recursive: true });
console.info(`Resultados en ${path.relative(root, runDirectory)}.`);
writeFileSync(
  path.join(runDirectory, "RESUMEN.md"),
  "# Recorrido T21\n\nPreparación en curso.\n",
);
try {
  await prepare(runDirectory);
  const cli = path.join(root, "node_modules/@playwright/test/cli.js");
  const args = [
    cli,
    "test",
    ...(mode === "ui" ? ["--ui"] : []),
    ...process.argv.slice(3),
  ];
  const child = spawn(process.execPath, args, {
    cwd: root,
    env: { ...process.env, E2E_RUN_DIR: runDirectory, E2E_MODE: mode },
    stdio: "inherit",
    windowsHide: true,
  });
  child.on("exit", (code) => {
    const check = spawnSync("python", ["e2e/check-secrets.py", runDirectory], {
      cwd: root,
      stdio: "inherit",
      windowsHide: true,
    });
    process.exitCode = code === 0 && check.status === 0 ? 0 : 1;
  });
} catch (error) {
  writeFileSync(
    path.join(runDirectory, "RESUMEN.md"),
    `# Recorrido T21\n\nFALLO de preparación. ${error.message}\n`,
  );
  console.error(error.message);
  process.exitCode = 1;
}
