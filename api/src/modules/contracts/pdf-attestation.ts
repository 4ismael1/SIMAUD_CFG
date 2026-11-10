import type { Content, TableCell } from "pdfmake/interfaces.js";
import { eq } from "drizzle-orm";
import { db, type Transaction } from "../../db/client.js";
import { signatureEvidence } from "../../db/schema.js";
import { env } from "../../config/env.js";
import { contentDocumentHash } from "../../lib/rich-doc/content.js";
import type { Contract, Signatory } from "./service.js";

export const formatSigningDate = (value: Date | null) =>
  value
    ? new Intl.DateTimeFormat("es-DO", {
        timeZone: "America/Santo_Domingo",
        dateStyle: "medium",
        timeStyle: "long",
      }).format(value) + " (America/Santo_Domingo)"
    : "Pendiente";
export const maskCedula = (value: string | null) =>
  value
    ? "***-***" + value.replace(/\D/g, "").slice(-5, -1) + "-" + value.replace(/\D/g, "").slice(-1)
    : "Sin registrar";
export const maskIp = (value: string | null) =>
  !value
    ? "Sin registrar"
    : value.includes(":")
      ? value.split(":").slice(0, 2).join(":") + ":****"
      : value.split(".").slice(0, 2).join(".") + ".*.*";
const methods: Record<string, string> = {
  typed: "Firma escrita",
  drawn: "Firma manuscrita digital",
  uploaded: "Imagen aportada",
  unknown: "Método no registrado",
};

export async function pdfAttestation(
  tx: Transaction | typeof db,
  contract: Contract,
  signers: Signatory[],
): Promise<Content[]> {
  const evidence = await tx
    .select()
    .from(signatureEvidence)
    .where(eq(signatureEvidence.contractId, contract.id));
  const content: Content[] = [
    {
      text: "Constancia de firma electrónica",
      pageBreak: "before",
      fontSize: 18,
      bold: true,
      margin: [0, 0, 0, 16],
    },
    { text: "Firma electrónica con sellado del sistema", bold: true, margin: [0, 0, 0, 12] },
    { text: contract.code + " | Versión " + contract.currentVersion },
    { text: "SHA-256 del documento canónico:", margin: [0, 12, 0, 4] },
    {
      text: contentDocumentHash(
        contract.generatedContent ?? contract.content,
        contract.contentFormat,
      ),
      fontSize: 8,
      margin: [0, 0, 0, 16],
    },
  ];
  if (contract.verificationCode) {
    const url = env.APP_URL.replace(/\/$/, "") + "/verificar/" + contract.verificationCode;
    content.push({
      columns: [
        {
          stack: [
            { text: contract.verificationCode, bold: true, fontSize: 14 },
            { text: url, link: url, fontSize: 9, margin: [0, 8, 0, 0] },
            {
              text: "La API verifica el sello separado y la integridad del PDF. Este archivo no incorpora una firma PAdES.",
              fontSize: 9,
              margin: [0, 8, 0, 0],
            },
          ],
        },
        { qr: url, fit: 90, eccLevel: "M", width: 100 },
      ],
      margin: [0, 0, 0, 18],
    });
  }
  const rows: TableCell[][] = [
    [
      { text: "Firmante", bold: true },
      { text: "Fecha, IP y método", bold: true },
      { text: "Evidencia", bold: true },
    ],
  ];
  for (const signer of signers) {
    const row = evidence.find(
      (row) => row.signatoryId === signer.id && row.contractVersion === contract.currentVersion,
    );
    rows.push([
      {
        stack: [
          { text: signer.name, bold: true },
          { text: signer.role },
          { text: "Cédula: " + maskCedula(signer.cedula) },
        ],
      },
      {
        stack: [
          { text: formatSigningDate(signer.signedAt) },
          { text: "IP: " + maskIp(signer.ip) },
          { text: methods[row?.payload.method ?? "unknown"]! },
        ],
      },
      {
        stack: [
          { text: row?.evidenceHash.slice(0, 24) ?? "Sin evidencia certificada" },
          { text: "Versión " + (row?.contractVersion ?? contract.currentVersion) },
        ],
      },
    ]);
  }
  if (signers.length)
    content.push({
      table: { headerRows: 1, widths: [150, "*", 120], body: rows, dontBreakRows: true },
      layout: "lightHorizontalLines",
      fontSize: 8,
    });
  return content;
}
