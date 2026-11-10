import { z } from "zod";
import { ApiError } from "../errors.js";
import { tableGrid } from "./table.js";
import type { RichDoc, RichNode } from "./types.js";

const mark = z.strictObject({
  type: z.enum(["bold", "italic", "underline", "strike", "superscript", "subscript", "highlight"]),
});
const marks = z
  .array(mark)
  .max(7)
  .refine(
    (items) => new Set(items.map((item) => item.type)).size === items.length,
    "Las marcas no se pueden repetir.",
  )
  .optional();
const inline = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("text"), text: z.string().min(1).max(20000), marks }),
  z.strictObject({ type: z.literal("hardBreak") }),
  z.strictObject({
    type: z.literal("variable"),
    attrs: z.strictObject({ name: z.string().regex(/^[a-z][a-z0-9_]{1,49}$/) }),
    marks,
  }),
]);
const alignment = z.enum(["left", "center", "right", "justify"]).nullish();
const paragraph = z.strictObject({
  type: z.literal("paragraph"),
  attrs: z.strictObject({ textAlign: alignment }).nullish(),
  content: z.array(inline).optional(),
});
const heading = z.strictObject({
  type: z.literal("heading"),
  attrs: z.strictObject({ level: z.number().int().min(1).max(3), textAlign: alignment }),
  content: z.array(inline).optional(),
});
const bulletList = z.strictObject({
  type: z.literal("bulletList"),
  content: z.array(z.lazy(() => listItem)),
});
const orderedList = z.strictObject({
  type: z.literal("orderedList"),
  attrs: z.strictObject({ start: z.number().int().min(1).max(9999).nullish() }).nullish(),
  content: z.array(z.lazy(() => listItem)),
});
const listItem: z.ZodType = z.lazy(() =>
  z.strictObject({
    type: z.literal("listItem"),
    content: z
      .array(z.discriminatedUnion("type", [paragraph, bulletList, orderedList]))
      .min(1)
      .refine(
        (items) => (items[0] as RichNode | undefined)?.type === "paragraph",
        "El primer bloque debe ser un párrafo.",
      ),
  }),
);
const cellFields = {
  attrs: z
    .strictObject({
      colspan: z.number().int().min(1).max(12).nullish(),
      rowspan: z.number().int().min(1).max(200).nullish(),
      colwidth: z.array(z.number().int().min(20).max(2000)).min(1).max(12).nullish(),
    })
    .nullish(),
  content: z.array(z.discriminatedUnion("type", [paragraph, bulletList, orderedList])),
};
const table = z.strictObject({
  type: z.literal("table"),
  attrs: z.strictObject({ borderless: z.boolean().nullish() }).nullish(),
  content: z
    .array(
      z.strictObject({
        type: z.literal("tableRow"),
        content: z
          .array(
            z.discriminatedUnion("type", [
              z.strictObject({ type: z.literal("tableCell"), ...cellFields }),
              z.strictObject({ type: z.literal("tableHeader"), ...cellFields }),
            ]),
          )
          .max(12),
      }),
    )
    .min(1)
    .max(200),
});
const documentStructure = z.strictObject({
  type: z.literal("doc"),
  content: z
    .array(
      z.discriminatedUnion("type", [
        paragraph,
        heading,
        bulletList,
        orderedList,
        z.strictObject({
          type: z.literal("blockquote"),
          content: z.array(
            z.discriminatedUnion("type", [paragraph, heading, bulletList, orderedList]),
          ),
        }),
        z.strictObject({ type: z.literal("horizontalRule") }),
        z.strictObject({ type: z.literal("pageBreak") }),
        table,
      ]),
    )
    .min(1)
    .max(2000),
});

function checkBudget(value: unknown, context: z.RefinementCtx) {
  const pending = [{ node: value, depth: 1, path: [] as (string | number)[] }];
  let variables = 0;
  while (pending.length) {
    const { node, depth, path } = pending.pop()!;
    if (!node || typeof node !== "object" || Array.isArray(node)) continue;
    const record = node as Record<string, unknown>;
    if (record.type === "variable") variables++;
    if (depth > 12 || variables > 5000) {
      context.addIssue({
        code: "custom",
        path,
        message: "El documento excede los límites de profundidad o variables.",
      });
      return;
    }
    if (Array.isArray(record.content))
      record.content.forEach((child, index) =>
        pending.push({ node: child, depth: depth + 1, path: [...path, "content", index] }),
      );
  }
  if (Buffer.byteLength(JSON.stringify(value) ?? "", "utf8") > 500 * 1024)
    context.addIssue({ code: "custom", message: "El documento supera los 500 KB." });
}

function checkTables(node: RichNode, context: z.RefinementCtx, path: (string | number)[] = []) {
  if (node.type === "table") {
    const grid = tableGrid(node);
    if (grid.error || !grid.width)
      context.addIssue({
        code: "custom",
        path: [...path, ...(grid.error ?? [])] as (string | number)[],
        message: "Las columnas y los rangos de las celdas no son coherentes.",
      });
  }
  node.content?.forEach((child, index) => checkTables(child, context, [...path, "content", index]));
}

function normalizeNode(node: RichNode): RichNode {
  const result: RichNode = { type: node.type };
  if (node.attrs) {
    const attrs: NonNullable<RichNode["attrs"]> = {};
    if (node.attrs.level != null) attrs.level = node.attrs.level;
    if (node.attrs.textAlign && node.attrs.textAlign !== "left")
      attrs.textAlign = node.attrs.textAlign;
    if (node.attrs.start != null && node.attrs.start !== 1) attrs.start = node.attrs.start;
    if (node.attrs.borderless === true) attrs.borderless = true;
    if (node.attrs.colspan != null && node.attrs.colspan !== 1) attrs.colspan = node.attrs.colspan;
    if (node.attrs.rowspan != null && node.attrs.rowspan !== 1) attrs.rowspan = node.attrs.rowspan;
    if (node.attrs.colwidth != null) attrs.colwidth = node.attrs.colwidth;
    if (node.attrs.name !== undefined) attrs.name = node.attrs.name;
    if (Object.keys(attrs).length) result.attrs = attrs;
  }
  if (node.text !== undefined) result.text = node.text;
  if (node.marks?.length) result.marks = node.marks.map((item) => ({ type: item.type }));
  if (node.content && (node.content.length || !["paragraph", "heading"].includes(node.type)))
    result.content = node.content.map(normalizeNode);
  return result;
}

export const richDocSchema = z
  .unknown()
  .superRefine(checkBudget)
  .pipe(documentStructure)
  .transform((value) => value as RichDoc)
  .superRefine(checkTables)
  .transform((value) => normalizeNode(value) as RichDoc);

export function parseRichDoc(value: unknown): RichDoc {
  const result = richDocSchema.safeParse(value);
  if (!result.success)
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "El documento con formato no es válido.",
      result.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
    );
  return result.data;
}

export const canonicalRichDoc = (value: unknown) => JSON.stringify(parseRichDoc(value));
