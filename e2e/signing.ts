import { expect, type Page } from "@playwright/test";
import path from "node:path";
import { confirm, output, people } from "./support";
import type { ContractReference } from "./contracts";

type Signer = keyof typeof people;

async function draw(page: Page, account: Signer) {
  await page.getByRole("radio", { name: "Dibujar", exact: true }).click();
  const canvas = page.getByRole("img", {
    name: `Área de firma de ${people[account].name}`,
    exact: true,
  });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await canvas.click({ trial: true });
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + 50, box!.y + box!.height * 0.5);
  await page.mouse.down();
  for (let index = 1; index <= 90; index += 1) {
    await page.mouse.move(
      box!.x + 50 + (index * (box!.width - 100)) / 90,
      box!.y + box!.height * (0.5 + 0.15 * Math.sin(index * 0.15)),
      { steps: 2 },
    );
  }
  await page.mouse.up();
  await expect(
    page.getByRole("button", { name: "Revisar y firmar", exact: true }),
  ).toBeEnabled();
}

async function moveSignature(page: Page) {
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Firma más pequeña", exact: true })
    .click({ clickCount: 4 });
  await expect(
    dialog.getByRole("slider", { name: "Tamaño de la firma", exact: true }),
  ).toHaveValue("0.8");
  const image = dialog.getByRole("img", {
    name: /Usa las flechas para moverla/,
  });
  const before = await image.boundingBox();
  expect(before).not.toBeNull();
  await page.mouse.move(
    before!.x + before!.width / 2,
    before!.y + before!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    before!.x + before!.width / 2 + 12,
    before!.y + before!.height / 2 + 5,
    { steps: 8 },
  );
  await page.mouse.up();
  const after = await image.boundingBox();
  expect(after!.x).toBeGreaterThan(before!.x);
}

export async function sign(
  page: Page,
  contract: ContractReference,
  account: Signer,
  method: "upload" | "draw" | "type",
  adjust = false,
) {
  await page.goto("/app/firmas");
  await expect(
    page.getByRole("heading", { name: "Por firmar", exact: true }),
  ).toBeVisible();
  const card = page.getByRole("listitem").filter({ hasText: contract.code });
  await card.getByRole("link", { name: "Firmar ahora", exact: true }).click();
  // Ticking the declaration is enough: scrolling to the end is no longer required.
  await page
    .getByRole("checkbox", { name: /Leí el contrato completo/ })
    .check();
  if (method === "upload") {
    await page.getByRole("radio", { name: "Subir", exact: true }).click();
    await page
      .getByLabel("Elegir imagen PNG (máx. 500 KB)", { exact: true })
      .setInputFiles(
        path.resolve(
          "e2e/fixtures",
          account === "SIGNER_B" ? "firma-b.png" : "firma-a.png",
        ),
      );
  }
  if (method === "draw") await draw(page, account);
  if (method === "type") {
    await page.getByRole("radio", { name: "Escribir", exact: true }).click();
    await page
      .getByLabel("Nombre para la firma", { exact: true })
      .fill(people[account].name);
    await page
      .getByRole("checkbox", {
        name: "Recordar esta firma para mis próximos contratos",
        exact: true,
      })
      .uncheck();
  }
  await page
    .getByRole("button", { name: "Revisar y firmar", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  if (adjust) await moveSignature(page);
  await page.getByRole("dialog").screenshot({
    path: path.join(
      output,
      "capturas",
      `firma-${contract.code}-${account}-${method}.png`,
    ),
  });
  await page
    .getByRole("button", { name: "Confirmar y firmar", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Firma registrada", exact: true }),
  ).toBeVisible();
}

export async function requestNewSignature(
  page: Page,
  contract: ContractReference,
) {
  await page.goto(`/app/contratos/${contract.id}`);
  await page
    .getByRole("button", { name: "Pedir nueva firma", exact: true })
    .click();
  await confirm(
    page,
    "Pedir nueva firma",
    "La firma requiere trazos más legibles para el expediente de prueba.",
  );
  await expect(
    page.getByText("Se pidió a Ana Contratista que firme de nuevo.", {
      exact: true,
    }),
  ).toBeVisible();
}
