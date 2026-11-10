import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "./client.js";
import { env } from "../config/env.js";
import { users, userRole } from "./schema.js";
import { hashPassword } from "../lib/auth/password.js";
import { seedContracts } from "./seed-contracts.js";
import { seedSql, seedCurrencyFix } from "./seed-data.js";
let generatedPassword: string | undefined;
try {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(10402)`);
    const existing = await tx.select({ email: users.email }).from(users);
    const emails = [
      "admin@simaud.local",
      "supervisor@simaud.local",
      "gestor@simaud.local",
      "usuario@simaud.local",
    ];
    const cedulas = ["00100000017", "00100000025", "00100000033", "00100000041"];
    const missing = emails.some((email) => !existing.some((u) => u.email === email));
    if (missing) {
      const password = env.SEED_PASSWORD ?? "Simaud1!" + randomBytes(18).toString("base64url");
      const passwordHash = await hashPassword(password);
      for (const [i, role] of userRole.enumValues.entries())
        await tx
          .insert(users)
          .values({
            email: emails[i]!,
            name: "Usuario " + role,
            phone: "809555010" + i,
            cedula: cedulas[i]!,
            role,
            passwordHash,
            emailConfirmedAt: new Date(),
          })
          .onConflictDoNothing();
      if (!env.SEED_PASSWORD) generatedPassword = password;
    }
    await tx.execute(sql.raw(seedSql));
    await tx.execute(sql.raw(seedCurrencyFix));
    await seedContracts(tx);
  });
  if (generatedPassword)
    console.log("Contraseña inicial (guárdala; no se volverá a imprimir): " + generatedPassword);
  console.log("Seed completado.");
} catch {
  console.error("No se pudo completar el seed. Comprueba la conexión y las migraciones.");
  process.exitCode = 1;
} finally {
  await pool.end();
}
