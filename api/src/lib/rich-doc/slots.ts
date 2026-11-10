import { ApiError } from "../errors.js";
import { storedDocument } from "./content.js";
import type { ContentFormat } from "./types.js";

export function signatureSlots(content: string, format: ContentFormat) {
  if (format !== "rich-v2") return [];
  return storedDocument(content)
    .content.filter((node) => node.type === "signatures")
    .flatMap((node) => node.content ?? [])
    .map((node, index) => ({
      index,
      label: node.attrs?.label ?? "",
      party: node.attrs?.party ?? null,
      showName: node.attrs?.showName !== false,
      showId: node.attrs?.showId !== false,
    }));
}

export function assertTemplateSlotLabels(content: string, format: ContentFormat) {
  if (signatureSlots(content, format).some((slot) => !slot.label.trim()))
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "Indica un nombre de rol en cada casilla de firma (1–60 caracteres).",
    );
}

export const partyFields = {
  nombre: "text",
  cedula: "cedula",
  email: "email",
  telefono: "phone",
  cargo: "text",
} as const;

export function partyDefinitions(content: string, format: ContentFormat) {
  return signatureSlots(content, format).flatMap((slot) =>
    slot.party
      ? Object.entries(partyFields).map(([suffix, type]) => ({
          name: `${slot.party}_${suffix}`,
          label: `${slot.label}: ${suffix}`,
          type,
          required: false,
          options: null,
          implicit: true as const,
        }))
      : [],
  );
}
