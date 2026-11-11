import { expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { download, output, people } from "./support";

interface PdfInspection {
  pageCount: number;
  pages: string[];
  code: string | null;
  qrDrawingCount: number;
  links: string[];
  images: number;
}

export function inspectPdf(filename: string) {
  const result: PdfInspection = JSON.parse(
    execFileSync("python", ["e2e/inspect-pdf.py", filename], {
      encoding: "utf8",
      windowsHide: true,
    }),
  );
  expect(result.pageCount).toBeGreaterThanOrEqual(2);
  const text = result.pages.join("\n");
  for (const person of Object.values(people)) {
    expect(text).toContain(person.name);
    const cedula = person.cedula.replace(/^(\d{3})(\d{7})(\d)$/, "$1-$2-$3");
    expect(text).toContain(cedula);
  }
  expect(text).toContain("EL CONTRATISTA");
  expect(text).toContain("POR LA INSTITUCIÓN");
  expect(text).toContain("TESTIGO");
  expect(result.pages[0]).not.toContain("SIMAUD");
  expect(result.pages.at(-1)).toMatch(/CONSTANCIA/i);
  expect(result.code).not.toBeNull();
  expect(result.qrDrawingCount).toBeGreaterThan(50);
  expect(result.images).toBeGreaterThanOrEqual(3);
  return result;
}

export async function publicVerification(
  page: Page,
  code: string,
  filename: string,
) {
  await page.goto("/verificar");
  await page.getByLabel("Código de verificación", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Verificar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Código registrado", exact: true }),
  ).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: /Arrastra el PDF o haz clic/ })
    .click();
  await (await chooser).setFiles(filename);
  await expect(
    page.getByText("Documento auténtico", { exact: true }),
  ).toBeVisible();
}

export async function alteredVerification(page: Page, filename: string) {
  const original = readFileSync(filename);
  const altered = Buffer.from(original);
  altered[altered.length - 1] ^= 1;
  expect(
    altered.filter((value, index) => value !== original[index]).length,
  ).toBe(1);
  const changed = path.join(output, "alterado-un-byte.pdf");
  writeFileSync(changed, altered);
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: /Arrastra el PDF o haz clic/ })
    .click();
  await (await chooser).setFiles(changed);
  await expect(
    page.getByText("Este archivo NO coincide con el original", { exact: true }),
  ).toBeVisible();
}

export async function officialCopy(page: Page) {
  const filename = await download(
    page,
    () =>
      page
        .getByRole("button", { name: "Descargar copia", exact: true })
        .click(),
    "copia-oficial.pdf",
  );
  const inspection: PdfInspection = JSON.parse(
    execFileSync("python", ["e2e/inspect-pdf.py", filename], {
      encoding: "utf8",
      windowsHide: true,
    }),
  );
  for (const text of inspection.pages)
    expect(text).toContain("Copia de verificación");
}
