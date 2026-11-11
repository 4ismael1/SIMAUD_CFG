import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { isolatedEnvironment, readEnvironment, root } from "./environment.mjs";

const api = process.argv[2] === "api";
const args = api
  ? [path.join(root, "e2e/.storage/api/server.js")]
  : [path.join(root, "e2e/vite.mjs")];
const env = isolatedEnvironment(
  api ? readEnvironment() : { VITE_API_PROXY: "http://127.0.0.1:3100" },
);
const child = spawn(process.execPath, args, {
  cwd: api ? path.join(root, "e2e/.storage") : root,
  env,
  stdio: api ? "ignore" : "inherit",
  windowsHide: true,
});
writeFileSync(
  path.join(process.env.E2E_RUN_DIR, `${api ? "api" : "web"}.pid`),
  String(child.pid),
);
process.on("SIGTERM", () => child.kill("SIGTERM"));
process.on("SIGINT", () => child.kill("SIGINT"));
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
