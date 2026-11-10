import { AsyncLocalStorage } from "node:async_hooks";
import { sql, type SQL } from "drizzle-orm";
import { db, type Transaction } from "../../db/client.js";
import { ApiError } from "../../lib/errors.js";
import type { Report } from "./service.js";

export const maximumReportRows = 10000;
const exportContext = new AsyncLocalStorage<boolean>();
let reading = 0;
let exporting = 0;
const busy = () =>
  new ApiError(503, "RATE_LIMITED", "Hay demasiados reportes en curso. Inténtalo de nuevo.");
const tooLarge = () =>
  new ApiError(400, "VALIDATION_ERROR", "El reporte es demasiado grande. Acota los filtros.");

export async function withReportRead<T>(operation: (tx: Transaction) => Promise<T>) {
  if (reading >= 2) throw busy();
  reading++;
  try {
    return await db.transaction(
      async (tx) => {
        await tx.execute(sql`select set_config('statement_timeout', '10000', true)`);
        return operation(tx);
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  } finally {
    reading--;
  }
}

export async function boundedReportRows<T extends Record<string, unknown>>(
  tx: Transaction,
  query: SQL,
) {
  const result = await tx.execute<T>(
    sql`select * from (${query}) report_rows limit ${maximumReportRows + 1}`,
  );
  if (result.rows.length > maximumReportRows) throw tooLarge();
  return result;
}

export async function withExportCapacity<T>(operation: () => Promise<T>) {
  if (exportContext.getStore()) return operation();
  if (exporting >= 2) throw busy();
  exporting++;
  try {
    return await exportContext.run(true, operation);
  } finally {
    exporting--;
  }
}

export function validateExportSize(tables: Record<string, Report>, format: "csv" | "xlsx" | "pdf") {
  let rows = 0;
  let cells = 0;
  let bytes = 0;
  for (const report of Object.values(tables)) {
    const columns = new Set([
      ...report.rows.flatMap((row) => Object.keys(row)),
      ...Object.keys(report.totals),
    ]);
    rows += report.rows.length + 2;
    cells += (report.rows.length + 2) * columns.size;
    bytes += Buffer.byteLength(JSON.stringify(report));
  }
  if (
    rows > (format === "pdf" ? 2000 : 10000) ||
    cells > (format === "pdf" ? 20000 : 100000) ||
    bytes > 5 * 1024 * 1024
  )
    throw tooLarge();
}
