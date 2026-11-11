import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readEnvironment } from "./environment.mjs";

export const output = process.env.E2E_RUN_DIR!;
export const templateTitle = "Servicios profesionales T21";
export const contractTitle = "Servicios integrales T21";
export type Account =
  "ADMIN" | "SUPERVISOR" | "GESTOR" | "SIGNER_A" | "SIGNER_B" | "WITNESS";
export const people = {
  SIGNER_A: { name: "Ana Contratista", cedula: "00188000038" },
  SIGNER_B: { name: "Bruno Representante", cedula: "00188000046" },
  WITNESS: { name: "Teresa Testigo", cedula: "00188000053" },
};

type SessionState = Awaited<ReturnType<BrowserContext["storageState"]>>;
interface ActiveSession {
  page: Page;
  context: BrowserContext;
  label: string;
  account?: Account;
}

export class Journey {
  private active?: ActiveSession;
  private readonly savedStates = new Map<Account, SessionState>();
  private sequence = 0;
  private nextRequestAt = 0;
  private requestQueue: Promise<void> = Promise.resolve();
  private readonly startedAt = Date.now();

  constructor(private readonly browser: Browser) {
    mkdirSync(path.join(output, "capturas"), { recursive: true });
    writeFileSync(path.join(output, "RESUMEN.md"), "# Recorrido T21\n\n");
    this.note(
      "Avisos del recorrido. Correcciones y enmiendas se guardan antes de enviar desde la ficha. El dibujo usa un trazo continuo con el ratón. Las peticiones respetan el límite de la API.",
    );
  }

  async account(account: Account) {
    if (this.active?.account === account) return this.active.page;
    const state = this.savedStates.get(account);
    const page = await this.newPage(account, state);
    this.active!.account = account;
    if (state) return page;
    await page.goto("/auth/login");
    const settings = readEnvironment();
    try {
      await page
        .getByLabel("Correo electrónico", { exact: true })
        .fill(`${account.toLowerCase()}@e2e.example.com`);
      // A fill action includes its value in Playwright's HTML action title.
      await page
        .getByLabel("Contraseña", { exact: true })
        .evaluate((element, password) => {
          const setter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
          )?.set;
          if (!setter)
            throw new Error("No se encontró el control de contraseña.");
          setter.call(element, password);
          element.dispatchEvent(new Event("input", { bubbles: true }));
        }, settings[`E2E_${account}_PASSWORD`]);
      await page.getByRole("button", { name: "Entrar", exact: true }).click();
      await expect(page).toHaveURL(/\/app/);
    } catch {
      await page.screenshot({
        path: path.join(output, "capturas", `login-${account}-FALLO.png`),
      });
      throw new Error(
        `No se pudo iniciar la sesión e2e ${account}. Detalles de credenciales omitidos.`,
      );
    }
    return page;
  }

  async newPage(label = "verificación pública", storageState?: SessionState) {
    await this.deactivate();
    const context = await this.browser.newContext({
      baseURL: "http://localhost:5175",
      storageState,
      viewport: { width: 1440, height: 1000 },
      recordVideo: {
        dir: path.join(output, "videos"),
        size: { width: 1440, height: 1000 },
      },
    });
    const page = await context.newPage();
    this.active = { context, page, label };
    await context.route("http://localhost:5175/api/**", async (route) => {
      // All six sessions share the API's existing 100 requests/minute IP budget.
      const admitted = this.requestQueue.then(async () => {
        if (page.isClosed() || route.request().failure()) return false;
        await new Promise((resolve) =>
          setTimeout(resolve, Math.max(0, this.nextRequestAt - Date.now())),
        );
        if (page.isClosed() || route.request().failure()) return false;
        this.nextRequestAt = Date.now() + 680;
        return true;
      });
      this.requestQueue = admitted.then(() => undefined);
      if (!(await admitted)) return;
      try {
        await route.continue();
      } catch (error) {
        // Closing a role's context cancels its remaining read requests.
        if (!page.isClosed() && !route.request().failure()) throw error;
      }
    });
    const video = page.video();
    if (video)
      this.note(
        `Vídeo de ${label} en videos/${path.basename(await video.path())}.`,
      );
    page.on("pageerror", (error) =>
      this.note(
        `Error del navegador en ${new URL(page.url()).pathname}. ${error.message}`,
      ),
    );
    page.on("response", (response) => {
      if (response.status() >= 400 && response.url().includes("/api/")) {
        this.note(
          `HTTP ${response.status()} ${response.request().method()} ${new URL(response.url()).pathname}`,
        );
      }
    });
    return page;
  }

  async step(title: string, page: Page, action: () => Promise<void>) {
    this.sequence += 1;
    const name = `${String(this.sequence).padStart(2, "0")}-${title.replace(/[^a-zA-Z0-9áéíóúñ]+/g, "-").toLowerCase()}`;
    await test.step(title, async () => {
      console.info(`Paso ${this.sequence}. ${title}`);
      try {
        await action();
        const filename = path.join(output, "capturas", `${name}.png`);
        await page.screenshot({
          path: filename,
          fullPage: true,
        });
        await test
          .info()
          .attach(title, { path: filename, contentType: "image/png" });
        this.note(`OK — ${title}. Captura capturas/${name}.png`);
      } catch (error) {
        const filename = path.join(output, "capturas", `${name}-FALLO.png`);
        await page.screenshot({
          path: filename,
          fullPage: true,
        });
        await test.info().attach(`Fallo ${title}`, {
          path: filename,
          contentType: "image/png",
        });
        this.note(`FALLO — ${title}. Captura capturas/${name}-FALLO.png`);
        throw error;
      }
    });
  }

  note(message: string) {
    appendFileSync(path.join(output, "RESUMEN.md"), `- ${message}\n`);
  }

  private async deactivate(preserveSession = true) {
    const active = this.active;
    if (!active) return;
    if (preserveSession && active.account) {
      this.savedStates.set(active.account, await active.context.storageState());
    }
    await active.context.close();
    this.active = undefined;
    const video = active.page.video();
    if (video) {
      await test.info().attach(`Vídeo ${active.label}`, {
        path: await video.path(),
        contentType: "video/webm",
      });
    }
  }

  async close() {
    await this.deactivate(false);
    this.savedStates.clear();
    this.note(
      `Duración del recorrido ${((Date.now() - this.startedAt) / 1000).toFixed(1)} segundos.`,
    );
  }
}

export async function download(
  page: Page,
  action: () => Promise<unknown>,
  filename: string,
) {
  const pending = page.waitForEvent("download");
  await action();
  const file = await pending;
  const destination = path.join(output, filename);
  await file.saveAs(destination);
  expect(await file.failure()).toBeNull();
  return destination;
}

export async function confirm(page: Page, label: string, reason?: string) {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  if (reason) await dialog.getByRole("textbox").fill(reason);
  await dialog.getByRole("button", { name: label, exact: true }).click();
  await expect(dialog).toBeHidden();
}
