import { eq, inArray } from "drizzle-orm";
import type { Transaction } from "./client.js";
import {
  contracts,
  contractTemplates,
  contractSignatories,
  contractVersions,
  contractApprovals,
  contractAuditLogs,
  users,
  templateVariables,
  contractCancellations,
} from "./schema.js";
import { generatedContent, encodeContent, contentVariables } from "../lib/rich-doc/content.js";
import type { RichDoc } from "../lib/rich-doc/types.js";
export async function seedContracts(tx: Transaction) {
  const people = await tx
    .select()
    .from(users)
    .where(
      inArray(users.email, [
        "admin@simaud.local",
        "supervisor@simaud.local",
        "gestor@simaud.local",
        "usuario@simaud.local",
      ]),
    );
  const gestor = people.find((u) => u.role === "gestor"),
    admin = people.find((u) => u.role === "admin"),
    signer = people.find((u) => u.email === "usuario@simaud.local");
  if (!gestor || !admin || !signer) throw Error("Faltan usuarios seed");
  const [template] = await tx
    .select()
    .from(contractTemplates)
    .where(eq(contractTemplates.id, "00000000-0000-4000-8000-000000000001"));
  if (!template) throw Error("Falta plantilla seed");
  const defs = await tx.select().from(templateVariables);
  await seedRichTemplate(tx, admin.id);
  const statuses = [
    "draft",
    "pending_approval",
    "rejected",
    "pending_signatures",
    "active",
    "expiring_soon",
    "expired",
    "cancelled",
  ] as const;
  for (const [i, status] of statuses.entries()) {
    const id = "00000000-0000-4000-8001-" + String(i + 1).padStart(12, "0");
    const values = {
      cliente_nombre: signer.name,
      cliente_email: signer.email,
      cliente_telefono: "8095550100",
      cliente_cedula: signer.cedula || "00100000041",
      fecha_inicio: "2026-01-01",
      fecha_fin:
        status === "expired"
          ? "2026-06-01"
          : status === "expiring_soon"
            ? "2026-11-20"
            : "2027-01-01",
      valor_contrato: 25000 + i * 1000,
      duracion_meses: 12,
      descripcion_servicios: "Servicios de ejemplo " + (i + 1),
      forma_pago: "Mensual",
    };
    const signed = ["active", "expiring_soon", "expired"].includes(status);
    const [c] = await tx
      .insert(contracts)
      .values({
        id,
        templateId: template.id,
        title: "Ejemplo " + (i + 1) + ": " + status,
        content: template.content,
        contentFormat: template.contentFormat,
        generatedContent: generatedContent(template.content, template.contentFormat, values, defs),
        variablesData: values,
        contractValue: String(values.valor_contrato),
        startDate: values.fecha_inicio,
        endDate: values.fecha_fin,
        status,
        createdBy: gestor.id,
        approvedBy: signed || status === "pending_signatures" ? admin.id : null,
        approvedAt: signed || status === "pending_signatures" ? new Date() : null,
        previousStatus: status === "cancelled" ? "pending_signatures" : null,
        rejectionReason: status === "rejected" ? "Completar alcance del servicio" : null,
      })
      .onConflictDoNothing()
      .returning();
    if (!c) continue;
    const sig = await tx
      .insert(contractSignatories)
      .values({
        contractId: id,
        userId: signer.id,
        name: signer.name,
        email: signer.email,
        cedula: signer.cedula,
        role: "client",
        signingOrder: 1,
        status: signed ? "signed" : "pending",
        signedAt: signed ? new Date() : null,
      })
      .returning();
    await tx.insert(contractVersions).values({
      contractId: id,
      versionNumber: 1,
      content: c.content,
      contentFormat: c.contentFormat,
      generatedContent: c.generatedContent,
      variablesData: values,
      createdBy: gestor.id,
      changeSummary: "Ejemplo seed",
      snapshot: {
        title: c.title,
        value: c.contractValue,
        startDate: c.startDate,
        endDate: c.endDate,
        signatories: sig.map((s) => ({
          id: s.id,
          userId: s.userId,
          email: s.email,
          signingOrder: s.signingOrder,
        })),
      },
    });
    if (status !== "draft")
      await tx.insert(contractApprovals).values({
        contractId: id,
        versionNumber: 1,
        requestedBy: gestor.id,
        status:
          status === "pending_approval"
            ? "pending"
            : status === "rejected"
              ? "rejected"
              : "approved",
        reviewedBy: status === "pending_approval" ? null : admin.id,
        reviewedAt: status === "pending_approval" ? null : new Date(),
        comments: "Datos demostrativos",
      });
    if (status === "cancelled")
      await tx.insert(contractCancellations).values({
        contractId: id,
        cancelledBy: admin.id,
        reason: "mutual_agreement",
        description: "Ejemplo de cancelación",
        status: "approved",
      });
    await tx.insert(contractAuditLogs).values({
      contractId: id,
      entityType: "contract",
      entityId: id,
      action: "seed",
      userId: admin.id,
      newValues: { status, demo: true },
    });
  }
}

async function seedRichTemplate(tx: Transaction, creatorId: string) {
  const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
  const cell = (text: string) => ({ type: "tableCell", content: [paragraph(text)] });
  const document: RichDoc = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1, textAlign: "center" },
        content: [{ type: "text", text: "Acuerdo de servicios" }],
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Cliente " },
          { type: "variable", attrs: { name: "cliente_nombre" }, marks: [{ type: "bold" }] },
        ],
      },
      {
        type: "bulletList",
        content: [{ type: "listItem", content: [paragraph("Alcance y condiciones del servicio")] }],
      },
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              { type: "tableHeader", content: [paragraph("Concepto")] },
              { type: "tableHeader", content: [paragraph("Importe")] },
            ],
          },
          {
            type: "tableRow",
            content: [
              cell("Servicios"),
              {
                type: "tableCell",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "variable", attrs: { name: "valor_contrato" } }],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        type: "table",
        attrs: { borderless: true },
        content: [
          {
            type: "tableRow",
            content: [cell("Firma de la institución"), cell("Firma del cliente")],
          },
        ],
      },
    ],
  };
  const content = encodeContent(document, "rich-v1");
  await tx
    .insert(contractTemplates)
    .values({
      id: "00000000-0000-4000-8000-000000000013",
      title: "Ejemplo con formato",
      contentFormat: "rich-v1",
      content,
      variables: contentVariables(content, "rich-v1"),
      createdBy: creatorId,
    })
    .onConflictDoNothing();
}
