import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    env: { NODE_ENV: "test" },
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
