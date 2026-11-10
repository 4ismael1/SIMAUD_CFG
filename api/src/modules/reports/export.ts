import { validateExportSize, withExportCapacity } from "./limits.js";
import ExcelJS from "exceljs";
import type { Content } from "pdfmake/interfaces.js";
import { makePdf } from "../../lib/pdf.js";
import type { Report, ReportRow } from "./service.js";

export function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

function tableData(report: Report) {
  const columns = [...new Set(report.rows.flatMap((row) => Object.keys(row)))];
  if (!columns.length) columns.push(...Object.keys(report.totals));
  const rows: ReportRow[] = [...report.rows];
  if (Object.keys(report.totals).length) rows.push({ ...report.totals, label: "TOTAL" });
  return { columns, rows };
}

function addExportSheet(workbook: ExcelJS.Workbook, title: string, report: Report) {
  const { columns, rows } = tableData(report);
  const sheet = workbook.addWorksheet(title, { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = columns.map((column) => ({ header: column, key: column, width: 24 }));
  for (const row of rows) sheet.addRow(row);
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF203850" } };
  for (const column of columns) {
    if (["value", "contractValue", "totalValue", "averageValue"].includes(column))
      sheet.getColumn(column).numFmt = '"RD$ "#,##0.00';
  }
  if (columns.length)
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
}

function exportTableContent(title: string, report: Report): Content[] {
  const { columns, rows } = tableData(report);
  const heading: Content = { text: title, fontSize: 14, bold: true, margin: [0, 14, 0, 8] };
  if (!columns.length) return [heading, { text: "Sin datos", fontSize: 9 }];
  return [
    heading,
    {
      table: {
        headerRows: 1,
        widths: columns.map(() => "*"),
        body: [
          columns.map((text) => ({ text, bold: true, fontSize: 7 })),
          ...rows.map((row) =>
            columns.map((column) => ({ text: String(row[column] ?? ""), fontSize: 7 })),
          ),
        ],
      },
      layout: "lightHorizontalLines",
    },
  ];
}

async function renderReportTables(
  tables: Record<string, Report>,
  format: "csv" | "xlsx" | "pdf",
  title: string,
) {
  validateExportSize(tables, format);
  if (format === "csv") {
    const sections = Object.entries(tables).map(([name, report]) => {
      const { columns, rows } = tableData(report);
      return [
        csvCell(name),
        columns.map(csvCell).join(";"),
        ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(";")),
      ].join("\r\n");
    });
    return Buffer.from("\uFEFF" + sections.join("\r\n\r\n"), "utf8");
  }
  if (format === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "SIMAUD";
    for (const [name, report] of Object.entries(tables)) addExportSheet(workbook, name, report);
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
  return makePdf(
    [
      { text: title, fontSize: 18, bold: true },
      ...Object.entries(tables).flatMap(([name, report]) => exportTableContent(name, report)),
    ],
    title,
    { pageOrientation: "landscape" },
  );
}

async function renderReport(report: Report, format: "csv" | "xlsx" | "pdf", title: string) {
  validateExportSize({ report }, format);
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

export function exportReportTables(
  tables: Record<string, Report>,
  format: "csv" | "xlsx" | "pdf",
  title: string,
) {
  return withExportCapacity(() => renderReportTables(tables, format, title));
}
export function exportReport(report: Report, format: "csv" | "xlsx" | "pdf", title: string) {
  return withExportCapacity(() => renderReport(report, format, title));
}
