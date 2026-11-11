import { test, expect } from "@playwright/test";
import { Journey, contractTitle } from "./support";
import { catalog } from "./catalog";
import { resetUiDatabase } from "./prepare.mjs";
import { contractPdf, correct, newContract, review, submit } from "./contracts";
import { requestNewSignature, sign } from "./signing";
import {
  alteredVerification,
  inspectPdf,
  officialCopy,
  publicVerification,
} from "./verification";
import {
  amendment,
  cancelAndArchive,
  notificationsAndProfile,
  processRenewal,
  requestRenewal,
  resetAll,
} from "./lifecycle";

test("recorrido diario completo por la interfaz real", async ({ browser }) => {
  if (process.env.E2E_MODE === "ui") resetUiDatabase();
  const journey = new Journey(browser);
  try {
    const admin = await journey.account("ADMIN");
    await catalog(journey, admin);
    let supervisor = await journey.account("SUPERVISOR");
    await journey.step(
      "Supervisor revisa panel y catálogo",
      supervisor,
      async () => {
        await expect(
          supervisor.getByRole("heading", {
            name: "Cola de aprobación",
            exact: true,
          }),
        ).toBeVisible();
        await supervisor
          .getByRole("navigation", { name: "Principal", exact: true })
          .getByRole("link", { name: "Plantillas", exact: true })
          .click();
        await expect(
          supervisor.getByRole("link", {
            name: "Servicios profesionales T21",
            exact: true,
          }),
        ).toBeVisible();
      },
    );
    let gestor = await journey.account("GESTOR");
    let original = { id: "", code: "" };
    await journey.step(
      "Gestor crea contrato con datos firmantes y testigo",
      gestor,
      async () => {
        original = await newContract(gestor);
        journey.note(`Contrato original ${original.code}.`);
      },
    );
    await journey.step(
      "Gestor descarga borrador y envía a aprobación",
      gestor,
      async () => {
        await contractPdf(gestor, original, "borrador.pdf");
        journey.note("PDF de borrador en borrador.pdf.");
        await submit(gestor, original);
      },
    );
    supervisor = await journey.account("SUPERVISOR");
    await journey.step(
      "Supervisor devuelve con observaciones",
      supervisor,
      () => review(supervisor, original, "Devolver"),
    );
    gestor = await journey.account("GESTOR");
    await journey.step("Gestor corrige y reenvía", gestor, () =>
      correct(
        gestor,
        original,
        "Coordinador técnico y responsable del informe mensual",
      ),
    );
    supervisor = await journey.account("SUPERVISOR");
    await journey.step("Supervisor aprueba", supervisor, () =>
      review(supervisor, original, "Aprobar"),
    );
    let signerA = await journey.account("SIGNER_A");
    await journey.step(
      "Firmante uno sube arrastra y redimensiona firma",
      signerA,
      () => sign(signerA, original, "SIGNER_A", "upload", true),
    );
    gestor = await journey.account("GESTOR");
    await journey.step("Gestor pide nueva firma individual", gestor, () =>
      requestNewSignature(gestor, original),
    );
    signerA = await journey.account("SIGNER_A");
    await journey.step("Firmante uno vuelve a firmar dibujando", signerA, () =>
      sign(signerA, original, "SIGNER_A", "draw"),
    );
    let signerB = await journey.account("SIGNER_B");
    await journey.step("Firmante dos sube su imagen", signerB, () =>
      sign(signerB, original, "SIGNER_B", "upload"),
    );
    let witness = await journey.account("WITNESS");
    await journey.step("Testigo firma escribiendo su nombre", witness, () =>
      sign(witness, original, "WITNESS", "type"),
    );
    let finalPdf = "";
    let verificationCode = "";
    gestor = await journey.account("GESTOR");
    await journey.step(
      "Contrato vigente y comprobación del PDF final",
      gestor,
      async () => {
        finalPdf = await contractPdf(gestor, original, "final.pdf");
        await expect(
          gestor.getByText("Vigente", { exact: true }),
        ).toBeVisible();
        const inspection = inspectPdf(finalPdf);
        verificationCode = inspection.code!;
        journey.note(
          `PDF final.pdf con ${inspection.pageCount} páginas. Código de verificación ${verificationCode}. Render en final-paginas/.`,
        );
      },
    );
    let anonymous = await journey.newPage();
    await journey.step(
      "Verificación pública de código y documento auténtico",
      anonymous,
      () => publicVerification(anonymous, verificationCode, finalPdf),
    );
    await journey.step(
      "Verificación rechaza PDF alterado en un byte",
      anonymous,
      () => alteredVerification(anonymous, finalPdf),
    );
    await journey.step(
      "Descarga pública de copia oficial marcada",
      anonymous,
      async () => {
        await officialCopy(anonymous);
        journey.note("PDF de copia oficial en copia-oficial.pdf.");
      },
    );
    let amended = { id: "", code: "" };
    gestor = await journey.account("GESTOR");
    await journey.step(
      "Gestor crea enmienda y cambia cláusula",
      gestor,
      async () => {
        amended = await amendment(gestor, original);
        journey.note(
          `Enmienda ${amended.code}. Se cambió el dato de la cláusula de cargo mediante el asistente.`,
        );
      },
    );
    supervisor = await journey.account("SUPERVISOR");
    await journey.step("Supervisor aprueba enmienda", supervisor, () =>
      review(supervisor, amended, "Aprobar"),
    );
    signerA = await journey.account("SIGNER_A");
    await journey.step("Firmante uno firma enmienda", signerA, () =>
      sign(signerA, amended, "SIGNER_A", "upload"),
    );
    signerB = await journey.account("SIGNER_B");
    await journey.step("Firmante dos firma enmienda", signerB, () =>
      sign(signerB, amended, "SIGNER_B", "upload"),
    );
    witness = await journey.account("WITNESS");
    await journey.step("Testigo firma enmienda", witness, () =>
      sign(witness, amended, "WITNESS", "type"),
    );
    gestor = await journey.account("GESTOR");
    await journey.step(
      "Enmienda vigente y cadena visible del original",
      gestor,
      async () => {
        const filename = await contractPdf(gestor, amended, "enmienda.pdf");
        const inspection = inspectPdf(filename);
        journey.note(
          `PDF enmienda.pdf. Código de verificación ${inspection.code}.`,
        );
        await gestor.goto(`/app/contratos/${original.id}`);
        await expect(
          gestor.getByText("Enmendado", { exact: true }).first(),
        ).toBeVisible();
        await expect(
          gestor.getByRole("link").filter({ hasText: amended.code }).first(),
        ).toBeVisible();
      },
    );
    anonymous = await journey.newPage();
    await journey.step(
      "Verificación del original indica sustitución E1",
      anonymous,
      async () => {
        await anonymous.goto(`/verificar/${verificationCode}`);
        await expect(
          anonymous.getByText(/Sustituido por la enmienda E1/i),
        ).toBeVisible();
      },
    );
    let second = { id: "", code: "" };
    gestor = await journey.account("GESTOR");
    await journey.step(
      "Gestor crea segundo contrato y lo envía",
      gestor,
      async () => {
        second = await newContract(gestor, `${contractTitle} para cancelación`);
        await submit(gestor, second);
        journey.note(`Segundo contrato ${second.code}.`);
      },
    );
    supervisor = await journey.account("SUPERVISOR");
    await journey.step("Supervisor aprueba segundo contrato", supervisor, () =>
      review(supervisor, second, "Aprobar"),
    );
    gestor = await journey.account("GESTOR");
    await cancelAndArchive(journey, gestor, second);
    await journey.step(
      "Gestor solicita renovación del contrato vigente",
      gestor,
      () => requestRenewal(gestor, amended),
    );
    supervisor = await journey.account("SUPERVISOR");
    await journey.step(
      "Supervisor procesa renovación y abre borrador nuevo",
      supervisor,
      async () => {
        const renewed = await processRenewal(supervisor, amended);
        journey.note(`Renovación procesada. Nuevo borrador ${renewed.code}.`);
      },
    );
    signerA = await journey.account("SIGNER_A");
    await notificationsAndProfile(journey, signerA);
    let partial = { id: "", code: "" };
    gestor = await journey.account("GESTOR");
    await journey.step(
      "Gestor prepara contrato para firmas parciales",
      gestor,
      async () => {
        partial = await newContract(gestor, `${contractTitle} para reinicio`);
        await submit(gestor, partial);
        journey.note(`Contrato para reinicio ${partial.code}.`);
      },
    );
    supervisor = await journey.account("SUPERVISOR");
    await journey.step(
      "Supervisor aprueba contrato para reinicio",
      supervisor,
      () => review(supervisor, partial, "Aprobar"),
    );
    signerA = await journey.account("SIGNER_A");
    await journey.step("Firmante uno registra firma parcial", signerA, () =>
      sign(signerA, partial, "SIGNER_A", "draw"),
    );
    gestor = await journey.account("GESTOR");
    await journey.step(
      "Gestor reinicia todas las firmas parciales",
      gestor,
      () => resetAll(gestor, partial),
    );
    journey.note(
      "Recorrido completo OK. Informe HTML en html/index.html. Vídeos en videos/.",
    );
  } finally {
    await journey.close();
  }
});
