import { expect, type Page } from "@playwright/test";
import {
  confirm,
  contractTitle,
  download,
  people,
  templateTitle,
} from "./support";

export interface ContractReference {
  id: string;
  code: string;
}

const runDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Santo_Domingo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

export function dateInDays(days: number) {
  const date = new Date(`${runDay}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function contractReference(
  page: Page,
): Promise<ContractReference> {
  await expect(page).toHaveURL(/\/app\/contratos\/[0-9a-f-]+$/);
  const match = (await page.getByRole("main").innerText()).match(
    /CT-\d{4}-\d+(?:-E\d+)?/,
  );
  expect(match).not.toBeNull();
  return {
    id: new URL(page.url()).pathname.split("/").at(-1)!,
    code: match![0],
  };
}

export async function fillDetails(page: Page, title: string) {
  await page.getByLabel("Título del contrato", { exact: true }).fill(title);
  await page
    .getByLabel("Valor del contrato (RD$)", { exact: true })
    .fill("87500.25");
  await page.getByLabel("Inicio", { exact: true }).fill(dateInDays(0));
  await page.getByLabel("Fin", { exact: true }).fill(dateInDays(10));
  await page
    .getByLabel("Ciudad de firma", { exact: true })
    .fill("Santo Domingo");
  await page
    .getByLabel("Forma de pago", { exact: true })
    .selectOption("Mensual");
  await page
    .getByLabel("Cargo contractual", { exact: true })
    .fill("Coordinador de servicios");
}

export async function fillSignatories(page: Page) {
  for (const [index, account] of (
    ["SIGNER_A", "SIGNER_B", "WITNESS"] as const
  ).entries()) {
    if (account === "WITNESS")
      await page
        .getByRole("button", { name: "Añadir testigo", exact: true })
        .click();
    await page
      .getByLabel("Cédula", { exact: true })
      .nth(index)
      .fill(people[account].cedula);
    await expect(
      page.getByLabel("Nombre completo", { exact: true }).nth(index),
    ).toHaveValue(people[account].name);
    await expect(
      page.getByLabel("Correo electrónico", { exact: true }).nth(index),
    ).toHaveValue(`${account.toLowerCase()}@e2e.example.com`);
  }
}

export async function newContract(page: Page, title = contractTitle) {
  if (page.url() === "about:blank") {
    await page.goto("/app/contratos/nuevo");
  } else {
    await page
      .getByRole("navigation", { name: "Principal", exact: true })
      .getByRole("link", { name: "Nuevo contrato", exact: true })
      .click();
  }
  await page.getByRole("radio", { name: new RegExp(templateTitle) }).click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await fillDetails(page, title);
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await fillSignatories(page);
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Vista previa del documento",
      exact: true,
    }),
  ).toBeVisible();
  const preview = page.getByRole("article");
  await expect(preview).toBeVisible();
  await expect(preview).toContainText("Santo Domingo");
  await expect(preview).not.toContainText("undefined");
  await page
    .getByRole("button", { name: "Guardar borrador", exact: true })
    .click();
  return contractReference(page);
}

export async function submit(page: Page, contract: ContractReference) {
  if (new URL(page.url()).pathname !== `/app/contratos/${contract.id}`)
    await page.goto(`/app/contratos/${contract.id}`);
  await page
    .getByRole("button", { name: "Enviar a aprobación", exact: true })
    .click();
  await confirm(page, "Enviar");
  await expect(
    page.getByText("En aprobación", { exact: true }).first(),
  ).toBeVisible();
}

export async function review(
  page: Page,
  contract: ContractReference,
  decision: "Aprobar" | "Devolver",
) {
  await page.goto("/app/aprobaciones");
  await page.getByRole("button").filter({ hasText: contract.code }).click();
  await page.getByRole("button", { name: decision, exact: true }).click();
  await confirm(
    page,
    decision,
    decision === "Devolver"
      ? "Precisar el cargo contractual y las obligaciones de entrega."
      : undefined,
  );
  await expect(
    page.getByText(
      decision === "Aprobar"
        ? "Contrato aprobado. Se notificó a los firmantes."
        : "Contrato devuelto con tus observaciones.",
      { exact: true },
    ),
  ).toBeVisible();
}

export async function correct(
  page: Page,
  contract: ContractReference,
  cargo: string,
) {
  await page.goto(`/app/contratos/${contract.id}`);
  await page
    .getByRole("link", { name: /Corregir|Editar/, exact: true })
    .click();
  await page.getByLabel("Cargo contractual", { exact: true }).fill(cargo);
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page
    .getByRole("button", { name: "Guardar borrador", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/app/contratos/${contract.id}$`));
  await submit(page, contract);
}

export async function contractPdf(
  page: Page,
  contract: ContractReference,
  filename: string,
) {
  await page.goto(`/app/contratos/${contract.id}`);
  return download(
    page,
    () => page.getByRole("button", { name: "PDF", exact: true }).click(),
    filename,
  );
}
