import { createServer } from "vite";
import path from "node:path";
import { root } from "./environment.mjs";

const server = await createServer({
  root,
  configFile: path.join(root, "vite.config.ts"),
  server: {
    host: "localhost",
    port: 5175,
    strictPort: true,
    watch: { ignored: ["**/e2e/**"] },
  },
});
await server.listen();
process.on("SIGTERM", () => void server.close());
process.on("SIGINT", () => void server.close());
