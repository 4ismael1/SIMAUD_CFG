import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { pool } from "./db/client.js";
const app = await buildApp();
try {
  await app.listen({ port: env.PORT, host: env.HOST });
} catch {
  app.log.error("No se pudo iniciar la API.");
  await pool.end();
  process.exitCode = 1;
}
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  await app.close();
  await pool.end();
}
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
