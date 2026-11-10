import { readFile, readdir } from "node:fs/promises";
import { format } from "prettier";
import { expect, it } from "vitest";
it("mantiene iguales las reglas y casos de servidor y cliente", async () => {
  const server = new URL("../src/lib/validation/", import.meta.url);
  const client = new URL("../../src/lib/validation/", import.meta.url);
  for (const name of await readdir(client)) {
    if (name.endsWith(".test.ts")) continue;
    const normalize = (text: string) => {
      const body = text.startsWith("// mantener sincronizado")
        ? text.slice(text.indexOf("\n") + 1)
        : text;
      return format(body.replaceAll('.js"', '"'), {
        parser: name.endsWith(".json") ? "json" : "typescript",
      });
    };
    expect(await normalize(await readFile(new URL(name, server), "utf8")), name).toBe(
      await normalize(await readFile(new URL(name, client), "utf8")),
    );
  }
});
