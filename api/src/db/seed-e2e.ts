import { sql } from "drizzle-orm";
import { env } from "../config/env.js";
import { hashPassword } from "../lib/auth/password.js";
import { db, pool } from "./client.js";
import { migrateDatabase } from "./migrate.js";
import { users, type Role } from "./schema.js";

const accounts: Array<{ key: string; name: string; role: Role; position?: string }> = [
  { key: "ADMIN", name: "Alba Administradora", role: "admin" },
  { key: "SUPERVISOR", name: "Sofía Supervisora", role: "supervisor" },
  { key: "GESTOR", name: "Gabriel Gestor", role: "gestor" },
  { key: "SIGNER_A", name: "Ana Contratista", role: "user" },
  {
    key: "SIGNER_B",
    name: "Bruno Representante",
    role: "user",
    position: "Director administrativo",
  },
  { key: "WITNESS", name: "Teresa Testigo", role: "user" },
];

function syntheticCedula(index: number) {
  const prefix = `001${String(8800000 + index).padStart(7, "0")}`;
  const sum = [...prefix].reduce((total, digit, offset) => {
    const product = Number(digit) * (offset % 2 === 0 ? 1 : 2);
    return total + (product > 9 ? product - 9 : product);
  }, 0);
  return prefix + ((10 - (sum % 10)) % 10);
}

async function resetIsolatedDatabase() {
  const target = new URL(env.DATABASE_URL);
  if (
    env.NODE_ENV !== "development" ||
    target.pathname !== "/simaud_e2e" ||
    target.hostname !== "127.0.0.1" ||
    target.port !== "55433" ||
    target.username !== "simaud"
  )
    throw new Error("La siembra solo permite simaud_e2e local.");
  const database = await pool.query<{ name: string }>("select current_database() name");
  if (database.rows[0]?.name !== "simaud_e2e") throw new Error("Base e2e incorrecta.");
  await db.execute(
    sql.raw(
      "DROP SCHEMA public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;",
    ),
  );
  await migrateDatabase();
}

async function seedAccounts() {
  for (const [index, account] of accounts.entries()) {
    const password = process.env[`E2E_${account.key}_PASSWORD`];
    if (!password || password.length < 24) throw new Error("Falta una contraseña e2e generada.");
    await db.insert(users).values({
      name: account.name,
      email: `${account.key.toLowerCase()}@e2e.example.com`,
      role: account.role,
      position: account.position,
      cedula: syntheticCedula(index),
      phone: `80955501${String(index).padStart(2, "0")}`,
      passwordHash: await hashPassword(password),
      emailConfirmedAt: new Date(),
      mustChangePassword: false,
    });
  }
}

try {
  await resetIsolatedDatabase();
  await seedAccounts();
  console.info("simaud_e2e reiniciada, migrada y sembrada con seis cuentas confirmadas.");
} finally {
  await pool.end();
}
