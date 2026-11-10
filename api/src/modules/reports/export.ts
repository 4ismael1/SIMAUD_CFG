import ExcelJS from "exceljs";
import type { Content } from "pdfmake/interfaces.js";
import { makePdf } from "../../lib/pdf.js";
import type { Report } from "./service.js";

export function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

export async function exportReport(report: Report, format: "csv" | "xlsx" | "pdf", title: string) {
  const columns = [...new Set(report.rows.flatMap((row) => Object.keys(row)))];
  if (!columns.length) columns.push(...Object.keys(report.totals));
  const exportRows = [...report.rows, { ...report.totals, label: "TOTAL" }];
  if (format === "csv")
    return Buffer.from(
      "\uFEFF" +
        [
          columns.map(csvCell).join(";"),
          ...exportRows.map((row) =>
            columns.map((column) => csvCell(row[column as keyof typeof row])).join(";"),
          ),
        ].join("\r\n"),
      "utf8",
    );
  if (format === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "SIMAUD";
    const sheet = workbook.addWorksheet(title, { views: [{ state: "frozen", ySplit: 1 }] });
    sheet.columns = columns.map((column) => ({
      header: column,
      key: column,
      width: column === "label" ? 35 : 22,
    }));
    for (const row of exportRows) {
      const values: Record<string, unknown> = { ...row };
      for (const column of columns) {
        const value = values[column];
        if (value && /Date$/.test(column)) values[column] = new Date(String(value) + "T00:00:00Z");
        if (value !== null && value !== undefined && column === "value")
          values[column] = Number(value);
      }
      sheet.addRow(values);
    }
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF203850" } };
    sheet.getRow(1).height = 25;
    for (const column of columns) {
      if (column === "value") sheet.getColumn(column).numFmt = '"RD$ "#,##0.00';
      if (/Date$/.test(column)) sheet.getColumn(column).numFmt = "dd/mm/yyyy";
    }
    sheet.getRow(sheet.rowCount).font = { bold: true };
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
  const body: Content[][] = [
    columns.map((column) => ({ text: column, bold: true, color: "#ffffff", fillColor: "#203850" })),
    ...exportRows.map((row) =>
      columns.map((column) => ({
        text: String(row[column as keyof typeof row] ?? ""),
        fontSize: 8,
      })),
    ),
  ];
  return makePdf(
    [
      { text: title, fontSize: 18, bold: true, margin: [0, 0, 0, 18] },
      {
        table: { headerRows: 1, widths: columns.map(() => "*"), body },
        layout: "lightHorizontalLines",
      },
    ],
    title,
    { pageOrientation: columns.length > 6 ? "landscape" : "portrait" },
  );
}
