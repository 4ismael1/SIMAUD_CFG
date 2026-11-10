import ExcelJS from "exceljs";
import { csvCell } from "../reports/export.js";
import { exportAuditRows } from "./queries.js";
import type { AuditFilters } from "./schemas.js";

const columns = [
  "id",
  "source",
  "at",
  "area",
  "action",
  "actorId",
  "actorName",
  "targetType",
  "targetId",
  "targetLabel",
  "contractId",
  "contractCode",
  "summary",
] as const;
export async function exportAudit(query: AuditFilters, format: "csv" | "xlsx") {
  const entries = await exportAuditRows(query);
  const rows = entries.map((entry) => ({ ...entry, at: entry.at.toISOString() }));
  if (format === "csv")
    return Buffer.from(
      "\uFEFF" +
        [
          columns.map(csvCell).join(";"),
          ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(";")),
        ].join("\r\n"),
      "utf8",
    );
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Auditoría");
  sheet.columns = columns.map((key) => ({ key, header: key, width: 25 }));
  rows.forEach((row) => sheet.addRow(row));
  sheet.getRow(1).font = { bold: true };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
