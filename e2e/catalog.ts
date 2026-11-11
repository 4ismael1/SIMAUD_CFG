import { expect, type Page } from "@playwright/test";
import { download, templateTitle, type Journey } from "./support";

async function createVariable(
  page: Page,
  name: string,
  label: string,
  type = "text",
) {
  await page
    .getByRole("button", { name: "Nueva variable", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nombre técnico").fill(name);
  await dialog.getByLabel("Etiqueta visible").fill(label);
  await dialog.getByLabel("Tipo de dato").selectOption(type);
  if (type === "select")
    await dialog.getByLabel("Opciones").fill("Mensual\nPor hitos");
  await dialog.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("cell", { name: `{{${name}}}`, exact: true }),
  ).toBeVisible();
}

async function insertVariable(page: Page, name: string) {
  const editor = page.getByRole("textbox", {
    name: "Contenido de la plantilla",
    exact: true,
  });
  await editor.pressSequentially(`{{${name}`);
  await page.getByRole("option").filter({ hasText: name }).click();
  await editor.pressSequentially(" ");
}

async function composeDocument(page: Page) {
  const editor = page.getByRole("textbox", {
    name: "Contenido de la plantilla",
    exact: true,
  });
  await editor.click();
  await page.getByLabel("Estilo del párrafo").selectOption("h1");
  await editor.pressSequentially("CONTRATO DE SERVICIOS PROFESIONALES");
  await editor.press("Enter");
  await page.getByLabel("Estilo del párrafo").selectOption("paragraph");
  await page.getByRole("button", { name: "Negrita", exact: true }).click();
  await editor.pressSequentially("PRIMERA. OBJETO Y OBLIGACIONES");
  await page.getByRole("button", { name: "Negrita", exact: true }).click();
  await editor.press("Enter");
  await editor.pressSequentially("Se acuerdan servicios profesionales en ");
  await insertVariable(page, "ciudad_firma");
  await editor.pressSequentially("con forma de pago ");
  await insertVariable(page, "forma_pago");
  await editor.pressSequentially("y el cargo contractual ");
  await insertVariable(page, "cargo_servicio");
  await editor.press("Enter");
  await page
    .getByRole("button", { name: "Lista con viñetas", exact: true })
    .click();
  await editor.pressSequentially("Entregar informe técnico mensual.");
  await editor.press("Enter");
  await editor.pressSequentially(
    "Respetar la confidencialidad del expediente.",
  );
  await editor.press("Enter");
  await editor.press("Enter");
  await page
    .getByRole("button", { name: "Insertar tabla", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Tabla de 2 × 2", exact: true })
    .click();
  await editor.pressSequentially("Servicio");
  await editor.press("Tab");
  await editor.pressSequentially("Plazo");
  await editor.press("Tab");
  await editor.pressSequentially("Asesoría técnica");
  await editor.press("Tab");
  await editor.pressSequentially("Mensual");
  await editor.press("Control+End");
  await editor.press("ArrowDown");
  await editor.press("End");
  await editor.press("Enter");
  await editor.pressSequentially(
    "En constancia, las partes aceptan estas obligaciones y firman.",
  );
  await editor.press("Enter");
  await page.getByRole("button", { name: "Firmas", exact: true }).click();
  await page
    .getByLabel("Rol de la firma 1", { exact: true })
    .fill("EL CONTRATISTA");
  await page
    .getByLabel("Datos que rellena la firma 1", { exact: true })
    .fill("cliente");
  await page
    .getByLabel("Rol de la firma 2", { exact: true })
    .fill("POR LA INSTITUCIÓN");
  await page
    .getByLabel("Datos que rellena la firma 2", { exact: true })
    .fill("representante");
}

export async function catalog(journey: Journey, page: Page) {
  await journey.step("Admin crea variables del catálogo", page, async () => {
    await page
      .getByRole("navigation", { name: "Principal", exact: true })
      .getByRole("link", { name: "Variables", exact: true })
      .click();
    await createVariable(page, "ciudad_firma", "Ciudad de firma");
    await createVariable(page, "forma_pago", "Forma de pago", "select");
    await createVariable(
      page,
      "representante_cargo",
      "Cargo del representante",
    );
    await createVariable(page, "cargo_servicio", "Cargo contractual");
  });
  await journey.step(
    "Admin redacta la plantilla con formato y firmas",
    page,
    async () => {
      await page.goto("/app/plantillas/nueva");
      await page.getByLabel("Título", { exact: true }).fill(templateTitle);
      await page.getByLabel("Categoría", { exact: true }).fill("Servicios T21");
      await page
        .getByLabel(/^Descripción/)
        .fill("Plantilla sintética para el recorrido integral.");
      await composeDocument(page);
    },
  );
  await journey.step("Admin configura página y revisa PDF", page, async () => {
    await page.getByRole("button", { name: "Página", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Superior", { exact: true }).fill("20");
    await dialog.getByLabel("Inferior", { exact: true }).fill("20");
    await dialog.getByRole("button", { name: "Aplicar", exact: true }).click();
    await page.getByRole("radio", { name: "PDF", exact: true }).click();
    await expect(
      page.getByTitle("Vista previa en PDF", { exact: true }),
    ).toBeVisible();
  });
  await journey.step("Admin guarda y reabre la plantilla", page, async () => {
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/plantillas$/);
    await page.getByRole("link", { name: templateTitle, exact: true }).click();
    await expect(
      page.getByLabel("Rol de la firma 1", { exact: true }),
    ).toHaveValue("EL CONTRATISTA");
    await expect(
      page.getByLabel("Datos que rellena la firma 2", { exact: true }),
    ).toHaveValue("representante");
  });
  for (const heading of ["Usuarios", "Configuración", "Auditoría"]) {
    await journey.step(`Admin revisa ${heading}`, page, async () => {
      await page
        .getByRole("navigation", { name: "Principal", exact: true })
        .getByRole("link", { name: heading, exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: heading, exact: true }),
      ).toBeVisible();
      if (heading === "Usuarios")
        await expect(
          page.getByRole("row").filter({ hasText: "Ana Contratista" }),
        ).toBeVisible();
      if (heading === "Configuración")
        await expect(page.getByLabel("Nombre", { exact: true })).toBeVisible();
      if (heading === "Auditoría")
        await expect
          .poll(() =>
            page
              .getByRole("table", { name: "Auditoría", exact: true })
              .getByRole("row")
              .count(),
          )
          .toBeGreaterThan(1);
    });
  }
  await journey.step("Admin filtra reportes y exporta CSV", page, async () => {
    await page
      .getByRole("navigation", { name: "Principal", exact: true })
      .getByRole("link", { name: "Reportes", exact: true })
      .click();
    await page.getByLabel("Estado", { exact: true }).selectOption("draft");
    await page.getByRole("button", { name: "Exportar", exact: true }).click();
    await download(
      page,
      () =>
        page
          .getByRole("menuitem", { name: "Datos en CSV", exact: true })
          .click(),
      "reportes.csv",
    );
    journey.note("CSV guardado en reportes.csv.");
  });
}
