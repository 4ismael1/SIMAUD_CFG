import { z } from "zod";
import { ApiError } from "../errors.js";
import { documentHash, sha256 } from "../crypto/canonical.js";
import { extractVariables, renderTemplate, type Variable } from "../render-template.js";
import { canonicalRichDoc, parseRichDoc, richDocSchema } from "./schema.js";
import { extractVariables as richVariables, renderRichDoc } from "./render.js";
import type { ContentFormat } from "./types.js";

export const contentFormatSchema = z.enum(["plain", "rich-v1"]);
function contentSchema(minLength: number) {
  return z.unknown().transform((value, context) => {
    const schema =
      typeof value === "string" ? z.string().min(minLength).max(200000) : richDocSchema;
    const result = schema.safeParse(value);
    if (!result.success) {
      result.error.issues.forEach((issue) =>
        context.addIssue({ code: "custom", path: issue.path, message: issue.message }),
      );
      return z.NEVER;
    }
    return result.data;
  });
}

export const contentInput = contentSchema(1);
export const previewContentInput = contentSchema(0);

export function encodeContent(content: unknown, format: ContentFormat): string {
  if (format === "rich-v1") return canonicalRichDoc(content);
  const parsed = z.string().min(1).max(200000).safeParse(content);
  if (!parsed.success)
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "El contenido de texto plano debe ser una cadena de 1 a 200000 caracteres.",
      [{ field: "content", message: "Contenido de texto plano inválido." }],
    );
  return parsed.data;
}

export function storedDocument(content: string) {
  return parseRichDoc(JSON.parse(content) as unknown);
}

export function contentVariables(content: string, format: ContentFormat = "plain") {
  return format === "rich-v1" ? richVariables(storedDocument(content)) : extractVariables(content);
}

export function renderContent(
  content: string,
  format: ContentFormat,
  values: Record<string, unknown>,
  defs: Variable[],
) {
  if (format === "plain")
    return { contentFormat: format, ...renderTemplate(content, values, defs) };
  return { contentFormat: format, ...renderRichDoc(storedDocument(content), values, defs) };
}

export function generatedContent(
  content: string,
  format: ContentFormat,
  values: Record<string, unknown>,
  defs: Variable[],
) {
  const result = renderContent(content, format, values, defs);
  return "html" in result ? result.html : canonicalRichDoc(result.document);
}

export function contentResponse<
  T extends { content: string; contentFormat: ContentFormat; generatedContent?: string | null },
>(record: T) {
  return {
    ...record,
    content: record.contentFormat === "rich-v1" ? storedDocument(record.content) : record.content,
    ...(record.generatedContent !== undefined
      ? {
          generatedContent:
            record.contentFormat === "rich-v1" && record.generatedContent !== null
              ? storedDocument(record.generatedContent)
              : record.generatedContent,
        }
      : {}),
  };
}

export function contentDocumentHash(content: string, format: ContentFormat = "plain") {
  return format === "rich-v1"
    ? sha256(canonicalRichDoc(storedDocument(content)))
    : documentHash(content);
}

export function matchesDocumentHash(content: string, format: ContentFormat, expected: string) {
  try {
    return contentDocumentHash(content, format) === expected;
  } catch {
    // Un documento persistido malformado también debe fallar la verificación de integridad.
    return false;
  }
}
