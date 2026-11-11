import { expect, type Page } from "@playwright/test";
import { confirm, type Journey } from "./support";
import {
  contractReference,
  dateInDays,
  submit,
  type ContractReference,
} from "./contracts";

export async function amendment(page: Page, original: ContractReference) {
  await page.goto(`/app/contratos/${original.id}`);
  await page
    .getByRole("button", { name: "Crear enmienda", exact: true })
    .click();
  await confirm(
    page,
    "Crear enmienda",
    "Precisar la cláusula contractual de cargo y responsabilidad técnica.",
  );
  await expect(page).toHaveURL(/\/editar$/);
  await page
    .getByLabel("Cargo contractual", { exact: true })
    .fill("Responsable de supervisión y entrega técnica");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page
    .getByRole("button", { name: "Guardar borrador", exact: true })
    .click();
  const created = await contractReference(page);
  await submit(page, created);
  return created;
}

export async function cancelAndArchive(
  journey: Journey,
  page: Page,
  contract: ContractReference,
) {
  await journey.step(
    "Gestor cancela segundo contrato con motivo",
    page,
    async () => {
      await page.goto(`/app/contratos/${contract.id}`);
      await page
        .getByRole("button", { name: "Más acciones", exact: true })
        .click();
      await page
        .getByRole("menuitem", { name: "Cancelar contrato…", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await dialog
        .getByLabel("Motivo", { exact: true })
        .selectOption("mutual_agreement");
      await dialog
        .getByLabel("Explicación", { exact: true })
        .fill("Las partes acuerdan cancelar el segundo contrato sintético.");
      await dialog
        .getByRole("button", { name: "Cancelar contrato", exact: true })
        .click();
      await expect(dialog).toBeHidden();
      await expect(page.getByText("Cancelado", { exact: true })).toBeVisible();
    },
  );
  await journey.step("Gestor archiva y desarchiva", page, async () => {
    await page
      .getByRole("button", { name: "Más acciones", exact: true })
      .click();
    await page.getByRole("menuitem", { name: "Archivar", exact: true }).click();
    await expect(page.getByText("Archivado", { exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: "Más acciones", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Desarchivar", exact: true })
      .click();
    await expect(page.getByText("Archivado", { exact: true })).toBeHidden();
    await expect(
      page.getByText("Contrato desarchivado.", { exact: true }),
    ).toBeVisible();
  });
}

export async function requestRenewal(page: Page, contract: ContractReference) {
  await page.goto("/app/renovaciones");
  await page
    .getByRole("button", { name: "Solicitar renovación", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Contrato", { exact: true })
    .selectOption(contract.id);
  await dialog.getByLabel("Nuevo inicio", { exact: true }).fill(dateInDays(11));
  await dialog.getByLabel("Nuevo fin", { exact: true }).fill(dateInDays(376));
  await dialog
    .getByLabel("Valor propuesto (RD$)", { exact: true })
    .fill("95000.50");
  await dialog
    .getByLabel("Motivo", { exact: true })
    .fill("Continuar los servicios durante el siguiente período anual.");
  await dialog
    .getByRole("button", { name: "Enviar solicitud", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByText("Solicitud de renovación enviada.", { exact: true }),
  ).toBeVisible();
}

export async function processRenewal(page: Page, contract: ContractReference) {
  await page.goto("/app/renovaciones");
  const row = page.getByRole("row").filter({ hasText: contract.code });
  await row.getByRole("button").click();
  await page.getByRole("menuitem", { name: "Aprobar", exact: true }).click();
  await confirm(page, "Aprobar renovación");
  await page.getByRole("tab", { name: "Aprobadas", exact: true }).click();
  await page
    .getByRole("row")
    .filter({ hasText: contract.code })
    .getByRole("link", { name: "Ver contrato nuevo", exact: true })
    .click();
  await expect(page.getByText("Borrador", { exact: true })).toBeVisible();
  return contractReference(page);
}

export async function notificationsAndProfile(journey: Journey, page: Page) {
  await journey.step("Firmante revisa notificaciones", page, async () => {
    await page.goto("/app/firmas");
    await page.getByRole("button", { name: /^Notificaciones/ }).click();
    const panel = page.getByRole("dialog", {
      name: "Notificaciones",
      exact: true,
    });
    await expect(panel).toBeVisible();
    await expect(
      panel.getByRole("button", {
        name: "Marcar todas como leídas",
        exact: true,
      }),
    ).toBeVisible();
    await panel
      .getByRole("button", { name: "Marcar todas como leídas", exact: true })
      .click();
    await expect(
      page.getByText("Todas las notificaciones quedaron como leídas.", {
        exact: true,
      }),
    ).toBeVisible();
  });
  await journey.step(
    "Firmante cambia teléfono en Mi perfil",
    page,
    async () => {
      await page.goto("/app/perfil");
      await page.getByLabel(/^Teléfono/).fill("8295550199");
      await page
        .getByRole("button", { name: "Guardar cambios", exact: true })
        .click();
      await expect(
        page.getByText("Datos actualizados.", { exact: true }),
      ).toBeVisible();
      await page.reload();
      await expect(page.getByLabel(/^Teléfono/)).toHaveValue(/829.*555.*0199/);
    },
  );
}

export async function resetAll(page: Page, contract: ContractReference) {
  await page.goto(`/app/contratos/${contract.id}`);
  await page.getByRole("button", { name: "Más acciones", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Reiniciar firmas…", exact: true })
    .click();
  await confirm(
    page,
    "Reiniciar firmas",
    "Repetir el circuito de firmas parciales con trazos definitivos.",
  );
  await expect(
    page.getByText("Firmas reiniciadas.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Firmó", { exact: true })).toHaveCount(0);
}
