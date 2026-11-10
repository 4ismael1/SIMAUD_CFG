import { z } from "zod";
import { DEFAULT_PAGE } from "./page.js";
import type { PageSettings, PageBand } from "./types.js";

const margin = z.number().int().min(10).max(50);
export const pageSchema = z.strictObject({
  size: z.enum(["letter", "legal", "a4"]).optional(),
  margins: z.strictObject({ top: margin, right: margin, bottom: margin, left: margin }).optional(),
  font: z.enum(["serif", "sans"]).optional(),
  fontSize: z
    .union([
      z.literal(10),
      z.literal(10.5),
      z.literal(11),
      z.literal(11.5),
      z.literal(12),
      z.literal(13),
      z.literal(14),
    ])
    .optional(),
  lineHeight: z.union([z.literal(1), z.literal(1.15), z.literal(1.5), z.literal(2)]).optional(),
});
const slot = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("text"),
    text: z.string().min(1).max(120),
    size: z.number().min(7).max(14).optional(),
  }),
  z.strictObject({ kind: z.literal("logo"), height: z.number().min(8).max(40).optional() }),
  z.strictObject({
    kind: z.literal("pageNumber"),
    format: z.enum(["page", "pageOfTotal"]).optional(),
  }),
]);
const band = z.strictObject({
  left: slot.optional(),
  center: slot.optional(),
  right: slot.optional(),
  skipFirstPage: z.boolean().optional(),
});
export const documentAttrs = z
  .strictObject({ page: pageSchema.optional(), header: band.optional(), footer: band.optional() })
  .nullish();

export function compactPage(page: PageSettings): PageSettings | undefined {
  const result: PageSettings = {};
  if (page.size && page.size !== DEFAULT_PAGE.size) result.size = page.size;
  if (page.margins && Object.values(page.margins).some((value) => value !== 25)) {
    const { top, right, bottom, left } = page.margins;
    result.margins = { top, right, bottom, left };
  }
  if (page.font && page.font !== DEFAULT_PAGE.font) result.font = page.font;
  if (page.fontSize && page.fontSize !== DEFAULT_PAGE.fontSize) result.fontSize = page.fontSize;
  if (page.lineHeight && page.lineHeight !== DEFAULT_PAGE.lineHeight)
    result.lineHeight = page.lineHeight;
  return Object.keys(result).length ? result : undefined;
}

export function compactBand(band: PageBand): PageBand | undefined {
  const result: PageBand = {};
  for (const position of ["left", "center", "right"] as const) {
    const slot = band[position];
    if (!slot) continue;
    if (slot.kind === "text")
      result[position] = {
        kind: "text",
        text: slot.text,
        ...(slot.size && slot.size !== 9 ? { size: slot.size } : {}),
      };
    if (slot.kind === "logo")
      result[position] = {
        kind: "logo",
        ...(slot.height && slot.height !== 14 ? { height: slot.height } : {}),
      };
    if (slot.kind === "pageNumber")
      result[position] = {
        kind: "pageNumber",
        ...(slot.format === "page" ? { format: "page" } : {}),
      };
  }
  if (!Object.keys(result).length) return undefined;
  if (band.skipFirstPage) result.skipFirstPage = true;
  return result;
}
