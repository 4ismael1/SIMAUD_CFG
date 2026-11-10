import { contentInput, contentFormatSchema } from "../../lib/rich-doc/content.js";
import {
  zCedula,
  zPhoneDo,
  zEmail,
  zPersonName,
  zMoneyInput,
  zIsoDate,
  zFreeText,
} from "../../lib/validation/zod.js";
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
export const text = zFreeText();
export const values = z.record(
  z.string(),
  z.union([z.string().max(20000), z.number().finite(), z.null()]),
);
export const date = zIsoDate;
export const signatory = z
  .object({
    name: zPersonName,
    email: zEmail,
    phone: zPhoneDo.optional(),
    cedula: zCedula.optional(),
    role: z.enum(signatoryRole.enumValues),
    signingOrder: z.number().int().min(1).max(1000),
  })
  .strict();
export const contractFields = z
  .object({
    templateId: uuid,
    content: contentInput.optional(),
    title: text,
    variables: values,
    value: zMoneyInput,
    startDate: date,
    endDate: date,
    notes: zFreeText(1, 20000).nullable().optional(),
    signatories: z.array(signatory).min(1).max(100),
  })
  .strict();
type ContractRelations = {
  startDate: string;
  endDate: string;
  signatories: { email: string; cedula?: string }[];
};
function checkContractRelations(input: ContractRelations, context: z.RefinementCtx) {
  if (input.endDate <= input.startDate)
    context.addIssue({
      code: "custom",
      path: ["endDate"],
      message: "La fecha final debe ser posterior al inicio.",
    });
  const emails = input.signatories.map((signer) => signer.email);
  const documents = input.signatories.map((signer) => signer.cedula).filter(Boolean);
  if (new Set(emails).size !== emails.length || new Set(documents).size !== documents.length)
    context.addIssue({ code: "custom", path: ["signatories"], message: "Firmantes duplicados." });
}
export const contractRelations = z
  .object({
    startDate: z.string(),
    endDate: z.string(),
    signatories: z.array(z.object({ email: z.string(), cedula: z.string().optional() })),
  })
  .superRefine(checkContractRelations);
export const contractInput = contractFields.superRefine(checkContractRelations);
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
    content: contentInput,
    contentFormat: contentFormatSchema.default("plain"),
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
