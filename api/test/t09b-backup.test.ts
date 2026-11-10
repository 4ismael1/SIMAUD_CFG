import { expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const shell = process.platform === "win32" ? "C:/Program Files/Git/usr/bin/sh.exe" : "sh";
const unixPath = (filename: string) =>
  filename
    .replaceAll("\\", "/")
    .replace(/^([A-Za-z]):/, (_, drive: string) => "/" + drive.toLowerCase());
const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";

it("los cuatro scripts de copia tienen sintaxis POSIX válida", async () => {
  for (const filename of ["backup.sh", "capture.sh", "restore.sh", "check-references.sh"]) {
    const absolute = fileURLToPath(new URL("../../deploy/backup/" + filename, import.meta.url));
    await run(shell, ["-n", unixPath(absolute)]);
  }
});

it("la comprobación de restauración recupera referencias desde papelera y enumera faltantes", async () => {
  const root = await mkdtemp(path.resolve("test/.t09b-restore-"));
  try {
    const storage = path.join(root, "storage");
    const bin = path.join(root, "bin");
    await mkdir(path.join(storage, ".trash/2026-11-01/signatures"), { recursive: true });
    await mkdir(bin);
    await writeFile(
      path.join(storage, ".trash/2026-11-01/signatures/retained.png"),
      "signed image",
    );
    const checker = await readFile(
      new URL("../../deploy/backup/check-references.sh", import.meta.url),
      "utf8",
    );
    const script = path.join(root, "check.sh");
    await writeFile(script, checker.replaceAll("/storage", "./storage"));
    const psql = path.join(bin, "psql");
    await writeFile(psql, "#!/bin/sh\nprintf '%s\\n' 'signatures/retained.png'\n", { mode: 0o700 });
    const command = `PATH=${quote(unixPath(bin))}:$PATH\nexport PATH\nsh ${quote(unixPath(script))}`;
    const result = await run(shell, ["-c", command], { cwd: root });
    expect(result.stdout).toContain("Recuperado de papelera: signatures/retained.png");
    expect(await readFile(path.join(storage, "signatures/retained.png"), "utf8")).toBe(
      "signed image",
    );
    await writeFile(psql, "#!/bin/sh\nprintf '%s\\n' 'signatures/missing.png'\n", { mode: 0o700 });
    await expect(run(shell, ["-c", command], { cwd: root })).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("Falta: signatures/missing.png"),
    });
  } finally {
    expect(path.resolve(root).startsWith(path.resolve("test") + path.sep)).toBe(true);
    await rm(root, { recursive: true });
  }
});
