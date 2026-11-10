import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Tests never talk to a real mail provider, whatever api/.env says.
    env: { NODE_ENV: "test", MAIL_DRIVER: "log", JOBS_ENABLED: "false" },
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
