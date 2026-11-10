import { and, eq, isNull, isNotNull } from "drizzle-orm";
import type { z } from "zod";
import type { Transaction } from "../../db/client.js";
import { users } from "../../db/schema.js";
import { signatureSlots } from "../../lib/rich-doc/slots.js";
import type { ContentFormat } from "../../lib/rich-doc/types.js";
import { formatCedula } from "../../lib/validation/format-cedula.js";
import { normalizeEmail } from "./identities.js";
import type { signatory } from "./schemas.js";
import { invalid } from "./service.js";

type InputSignatory = z.infer<typeof signatory>;
export const legacyRoleLabels = {
  client: "Cliente",
  contractor: "Contratista",
  witness: "Testigo",
};

export function prepareSlotSignatories(
  content: string,
  format: ContentFormat,
  input: InputSignatory[],
) {
  const slots = signatureSlots(content, format);
  if (!slots.length) return input.map(legacySignatory);
  assertSlotAssignments(slots.length, input);
  let extraIndex = 0;
  return input.map((signer) => {
    const slot = signer.slotIndex == null ? undefined : slots[signer.slotIndex];
    if (!slot) extraIndex++;
    const role: "client" | "contractor" | "witness" = slot
      ? slot.party === "cliente"
        ? "client"
        : "contractor"
      : "witness";
    return {
      ...signer,
      role,
      slotIndex: slot?.index ?? null,
      roleLabel: slot?.label.trim() ? slot.label : legacyRoleLabels[role],
      signingOrder: signer.signingOrder ?? (slot ? slot.index + 1 : slots.length + extraIndex),
    };
  });
}

function assertSlotAssignments(slotCount: number, input: InputSignatory[]) {
  const assigned = input.flatMap((signer) => (signer.slotIndex == null ? [] : [signer.slotIndex]));
  if (
    assigned.length !== slotCount ||
    new Set(assigned).size !== slotCount ||
    assigned.some((index) => index >= slotCount)
  )
    throw invalid("Debe haber exactamente un firmante por casilla, sin repetir slotIndex.");
  const extras = input.filter((signer) => signer.slotIndex == null);
  if (extras.length > 10 || extras.some((signer) => signer.role !== "witness"))
    throw invalid("Solo se admiten hasta diez testigos adicionales sin casilla.");
}

function legacySignatory(signer: InputSignatory) {
  if (signer.slotIndex != null) throw invalid("Esta plantilla no tiene casillas de firma.");
  if (!signer.role || signer.signingOrder === undefined)
    throw invalid("Indica el rol y el orden de cada firmante para esta plantilla.");
  return {
    ...signer,
    role: signer.role,
    signingOrder: signer.signingOrder,
    roleLabel: legacyRoleLabels[signer.role],
    slotIndex: null,
  };
}

export type PreparedSignatory = ReturnType<typeof prepareSlotSignatories>[number];

export function assertSameSlots(source: string, content: string, format: ContentFormat) {
  const roles = (value: string) =>
    signatureSlots(value, format).map(({ index, label, party }) => ({ index, label, party }));
  if (JSON.stringify(roles(source)) !== JSON.stringify(roles(content)))
    throw invalid(
      "Las casillas y sus roles deben conservar los de la plantilla o versión original.",
    );
}

export async function fillPartyValues(
  tx: Transaction,
  content: string,
  format: ContentFormat,
  signers: PreparedSignatory[],
  values: Record<string, unknown>,
  submitted?: Record<string, unknown>,
) {
  for (const slot of signatureSlots(content, format)) {
    if (!slot.party) continue;
    const signer = signers.find((item) => item.slotIndex === slot.index)!;
    const party = await signatoryPartyData(tx, signer);
    for (const [suffix, value] of Object.entries(party)) {
      const name = `${slot.party}_${suffix}`;
      if (submitted && name in submitted && submitted[name] !== value)
        throw invalid(
          "Los datos de personas se obtienen de los firmantes; actualiza el firmante correspondiente.",
          [{ field: `variables.${name}`, message: "El valor difiere del firmante." }],
        );
      values[name] = value;
    }
  }
}

async function signatoryPartyData(tx: Transaction, signer: PreparedSignatory) {
  const [user] = await tx
    .select({ position: users.position })
    .from(users)
    .where(
      and(
        eq(users.email, normalizeEmail(signer.email)),
        eq(users.isActive, true),
        isNull(users.deletedAt),
        isNotNull(users.emailConfirmedAt),
      ),
    );
  return {
    nombre: signer.name,
    cedula: signer.cedula ? formatCedula(signer.cedula) : "",
    email: normalizeEmail(signer.email),
    telefono: signer.phone ?? "",
    cargo: user?.position ?? "",
  };
}
