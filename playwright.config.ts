import { defineConfig } from "@playwright/test";
import path from "node:path";

const output = process.env.E2E_RUN_DIR;
if (!output) throw new Error("Ejecuta npm run e2e, e2e:headed o e2e:ui.");

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 540_000,
  expect: { timeout: 30_000 },
  outputDir: path.join(output, "test-results"),
  reporter: [
    ["list"],
    ["html", { outputFolder: path.join(output, "html"), open: "never" }],
    ["./e2e/shutdown.ts"],
  ],
  use: {
    actionTimeout: 30_000,
    navigationTimeout: 30_000,
    baseURL: "http://localhost:5175",
    channel: "chrome",
    headless: process.env.E2E_MODE !== "headed",
    launchOptions: { slowMo: process.env.E2E_MODE === "headed" ? 180 : 0 },
    viewport: { width: 1440, height: 1000 },
    screenshot: "off",
    video: "off",
    trace: "off",
  },
  webServer: [
    {
      command: "node e2e/serve.mjs api",
      url: "http://127.0.0.1:3100/api/v1/health",
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "node e2e/serve.mjs web",
      url: "http://localhost:5175",
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
