import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { contractTemplates } from "../../db/schema.js";
import { ApiError } from "../../lib/errors.js";
import { encodeContent, storedDocument } from "../../lib/rich-doc/content.js";
import { documentPdf, plainDocument } from "../../lib/rich-doc/document-pdf.js";
import type { RichNode, RichDoc, ContentFormat } from "../../lib/rich-doc/types.js";
import { getSettings } from "../system/settings.js";
import { resolveVariables } from "./catalog-variables.js";

function labelVariables(node: RichNode, labels: Map<string, string>): RichNode {
  if (node.type === "variable")
    return {
      type: "text",
      text: `[${labels.get(node.attrs!.name!) ?? node.attrs!.name}]`,
      ...(node.marks ? { marks: node.marks } : {}),
    };
  return {
    ...node,
    ...(node.content
      ? { content: node.content.map((child) => labelVariables(child, labels)) }
      : {}),
  };
}

function previewDocument(
  content: string,
  format: ContentFormat,
  labels: Map<string, string>,
): RichDoc {
  if (format === "plain")
    return plainDocument(
      content.replace(
        /\{\{([a-z][a-z0-9_]*)\}\}/g,
        (_, name: string) => `[${labels.get(name) ?? name}]`,
      ),
    );
  const document = storedDocument(content);
  return { ...document, content: document.content.map((node) => labelVariables(node, labels)) };
}

async function assertPreviewVariables(role: string, names: string[]) {
  if (role !== "gestor") return;
  const templates = await db
    .select()
    .from(contractTemplates)
    .where(eq(contractTemplates.status, "active"));
  const active = new Set(templates.flatMap((template) => template.variables));
  if (names.some((name) => !active.has(name)))
    throw new ApiError(403, "FORBIDDEN", "Variable no disponible.");
}

export async function templatePreviewPdf(
  input: { content: unknown; contentFormat: ContentFormat; title: string },
  role: string,
) {
  const content =
    input.contentFormat === "plain" && input.content === ""
      ? ""
      : encodeContent(input.content, input.contentFormat);
  const { defs } = await resolveVariables(db, content, input.contentFormat);
  await assertPreviewVariables(
    role,
    defs.map((variable) => variable.name),
  );
  const labels = new Map(defs.map((definition) => [definition.name, definition.label]));
  const document = previewDocument(content, input.contentFormat, labels);
  const settings = await getSettings();
  return documentPdf(document, input.title, { logo: settings.institution.logo });
}
