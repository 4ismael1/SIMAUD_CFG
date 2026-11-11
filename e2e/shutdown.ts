import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Reporter } from "@playwright/test/reporter";

export default class Shutdown implements Reporter {
  onTestEnd() {
    if (process.env.E2E_MODE === "ui") return;
    for (const service of ["api", "web"]) {
      const filename = path.join(process.env.E2E_RUN_DIR!, `${service}.pid`);
      if (!existsSync(filename)) continue;
      try {
        process.kill(Number(readFileSync(filename, "utf8")), "SIGTERM");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      }
    }
  }
}
