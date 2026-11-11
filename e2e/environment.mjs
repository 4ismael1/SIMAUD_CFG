import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

export const root = fileURLToPath(new URL("../", import.meta.url));
export const apiRequire = createRequire(path.join(root, "api/package.json"));
export const envPath = path.join(root, "e2e/.env.e2e");

export function readEnvironment() {
  const { parse } = apiRequire("dotenv");
  return parse(readFileSync(envPath));
}

export function isolatedEnvironment(settings) {
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(([name]) =>
      /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|USERNAME|USERDOMAIN|HOMEDRIVE|HOMEPATH|APPDATA|LOCALAPPDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|COMMONPROGRAMFILES|NUMBER_OF_PROCESSORS)$/i.test(
        name,
      ),
    ),
  );
  return {
    ...inherited,
    ...settings,
    DOTENV_CONFIG_PATH: path.join(root, "e2e/.secrets/no-dotenv"),
  };
}
