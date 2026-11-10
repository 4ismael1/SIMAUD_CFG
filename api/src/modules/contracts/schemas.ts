import { z } from "zod";
import {
  cancellationReason,
  contractStatus,
  signatoryRole,
  variableType,
} from "../../db/schema.js";
import { ApiError } from "../../lib/errors.js";
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "Los datos enviados no son válidos.",
      result.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
    );
  return result.data;
}
export const uuid = z.uuid();
export const text = z.string().trim().min(1).max(1000);
export const values = z.record(
  z.string(),
  z.union([z.string().max(20000), z.number().finite(), z.null()]),
);
export const date = z.iso.date();
export const signatory = z
  .object({
    name: text,
    email: z.email().transform((item) => item.toLowerCase()),
    phone: z.string().trim().max(50).optional(),
    cedula: z.string().trim().max(100).optional(),
    role: z.enum(signatoryRole.enumValues),
    signingOrder: z.number().int().min(1).max(1000),
  })
  .strict();
export const contractFields = z
  .object({
    templateId: uuid,
    title: text,
    variables: values,
    value: z.number().finite().nonnegative().max(9999999999999.99),
    startDate: date,
    endDate: date,
    notes: z.string().max(20000).nullable().optional(),
    signatories: z.array(signatory).min(1).max(100),
  })
  .strict();
export const contractInput = contractFields
  .refine((item) => item.endDate > item.startDate, {
    message: "La fecha final debe ser posterior al inicio.",
  })
  .refine(
    (item) =>
      new Set(item.signatories.map((signatories) => signatories.email)).size ===
        item.signatories.length &&
      new Set(item.signatories.map((signatories) => signatories.cedula).filter(Boolean)).size ===
        item.signatories.filter((signatories) => signatories.cedula).length,
    { message: "Firmantes duplicados." },
  );
export const variableInput = z
  .object({
    name: z.string().regex(/^[a-z][a-z0-9_]*$/),
    label: text,
    type: z.enum(variableType.enumValues),
    required: z.boolean().default(false),
    options: z.array(text).nullable().optional(),
    description: z.string().max(20000).nullable().optional(),
  })
  .strict();
export const templateInput = z
  .object({
    title: text,
    content: z.string().min(1).max(200000),
    description: z.string().max(20000).nullable().optional(),
    category: text.default("general"),
    status: z.enum(["active", "inactive"]).default("active"),
  })
  .strict();
export const actionInput = z
  .object({
    comment: text.optional(),
    reason: text.optional(),
    description: text.optional(),
    status: z.enum(contractStatus.enumValues).optional(),
    signatoryId: uuid.optional(),
  })
  .strict();
export const cancelInput = z
  .object({ reason: z.enum(cancellationReason.enumValues), description: text })
  .strict();
export const pageInput = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
