import pg from "pg";
import { committed } from "../lib/events.js";
import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "../config/env.js";
import * as schema from "./schema.js";
export const connectionString = env.NODE_ENV === "test" ? env.DATABASE_URL_TEST : env.DATABASE_URL;
export const pool = new pg.Pool({
  connectionString,
  max: 10,
  connectionTimeoutMillis: 5000,
  // PostgreSQL's JIT compiles queries whose estimated cost is high; for this app's small, frequent
  // queries the compilation alone took ~1.8 s (admin dashboard history) for <1 ms of real work.
  options: "-c jit=off",
});
export const db = drizzle(pool, { schema });
const originalTransaction = db.transaction.bind(db);
db.transaction = (async (callback, config) => {
  let transaction: Transaction | undefined;
  const result = await originalTransaction(async (tx) => {
    transaction = tx;
    return callback(tx);
  }, config);
  if (transaction) await committed(transaction);
  return result;
}) as typeof db.transaction;
export type Database = typeof db;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
