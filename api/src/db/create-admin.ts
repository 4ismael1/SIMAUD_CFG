import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, pool } from "./client.js";
import { users } from "./schema.js";
import { hashPassword } from "../lib/auth/password.js";

const adminInput = z.object({
  name: z.string().trim().min(2).max(200),
  email: z.email().transform((value) => value.toLowerCase()),
  cedula: z.string().trim().min(1).max(50),
  password: z.string().min(12).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/).optional(),
});
export async function createAdmin(input: z.input<typeof adminInput>) {
  const parsed = adminInput.safeParse(input);
  if (!parsed.success)
    throw new Error(
      "Indica nombre, email y cédula válidos; la contraseña debe tener al menos 12 caracteres, mayúsculas, minúsculas y números.",
    );
  const data = parsed.data;
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(10401)`);
    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, data.email));
    if (existing) return { created: false as const };
    const password = data.password ?? "Aa1!" + randomBytes(24).toString("base64url");
    await tx.insert(users).values({
      name: data.name,
      email: data.email,
      cedula: data.cedula,
      passwordHash: await hashPassword(password),
      role: "admin",
      emailConfirmedAt: new Date(),
      mustChangePassword: true,
    });
    return { created: true as const, password: data.password ? undefined : password };
  });
}
export function adminArguments(args: string[], source: NodeJS.ProcessEnv) {
  const value = (name: string) => {
    const index = args.indexOf("--" + name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  return {
    name: value("name") ?? source.ADMIN_NAME ?? "",
    email: (value("email") ?? source.ADMIN_EMAIL ?? "").trim().toLowerCase(),
    cedula: value("cedula") ?? source.ADMIN_CEDULA ?? "",
    password: source.ADMIN_PASSWORD,
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await createAdmin(adminArguments(process.argv.slice(2), process.env));
    console.info(
      result.created
        ? "Administrador creado. Debe cambiar su contraseña al iniciar sesión."
        : "El email ya existe. No se ha modificado el usuario.",
    );
    if (result.created && result.password)
      console.info("Contraseña temporal (única impresión): " + result.password);
  } catch (error) {
    console.error(
      error instanceof Error && error.message.startsWith("Indica nombre")
        ? error.message
        : "No se pudo crear el administrador. Comprueba los datos y la conexión.",
    );
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
