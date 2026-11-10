import { ApiError } from "./errors.js";

export interface StorageDriver {
  put(key: string, bytes: Buffer, options: { contentType: string }): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string, today?: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  list(prefix?: string): Promise<string[]>;
  purge(today: string): Promise<number>;
  encryptLegacySignature?(key: string, expectedSha256?: string): Promise<boolean>;
}

export class StorageError extends ApiError {
  constructor(
    public reason: "missing" | "denied" | "unreachable" | "invalid" | "conflict",
    message: string,
  ) {
    super(
      reason === "missing" ? 404 : reason === "invalid" ? 400 : reason === "conflict" ? 409 : 503,
      reason === "missing"
        ? "NOT_FOUND"
        : reason === "invalid"
          ? "VALIDATION_ERROR"
          : reason === "conflict"
            ? "CONFLICT"
            : "INTERNAL",
      message,
    );
  }
}

export function validateKey(key: string) {
  if (
    !key ||
    key.length > 1024 ||
    key.includes("..") ||
    !/^[A-Za-z0-9_-][A-Za-z0-9_./-]*$/.test(key) ||
    key.split("/").some((part) => !part || part === ".")
  )
    throw new StorageError("invalid", "La clave de almacenamiento no es válida.");
  return key;
}

export function trashDate(today: string) {
  if (!Number.isFinite(storageDateTimestamp(today)))
    throw new StorageError("invalid", "Fecha de limpieza inválida.");
  return today;
}

export function storageDateTimestamp(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const timestamp = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
    ? timestamp
    : NaN;
}

export const storageBusy = () =>
  new StorageError(
    "unreachable",
    "Almacenamiento en migración. Inténtalo de nuevo cuando termine.",
  );
