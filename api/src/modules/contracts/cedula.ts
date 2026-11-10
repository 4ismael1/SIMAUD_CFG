import { ApiError } from "../../lib/errors.js";

type SignatoryIdentity = { id: string; name: string; cedula: string | null };

export function missingCedula(signatories: SignatoryIdentity[]): string[] {
  return signatories
    .filter((signer) => !signer.cedula?.trim())
    .map((signer) => signer.name.trim() || signer.id);
}

export function assertSignatoryCedulas(signatories: SignatoryIdentity[]) {
  const missing = missingCedula(signatories);
  if (missing.length)
    throw new ApiError(
      409,
      "CONFLICT",
      `Falta la cédula de ${missing.join(", ")}. Completa los datos de los firmantes antes de enviar a aprobación.`,
    );
}
