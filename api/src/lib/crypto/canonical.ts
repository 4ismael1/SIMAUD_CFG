import { createHash } from "node:crypto";
import { decodeRenderedText } from "../pdf.js";

export const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  const object = value as Record<string, unknown>;
  return (
    "{" +
    Object.keys(object)
      .sort()
      .map((key) => JSON.stringify(key) + ":" + canonicalJson(object[key]))
      .join(",") +
    "}"
  );
}

export function canonicalDocument(text: string) {
  return decodeRenderedText(text)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t ]+$/g, ""))
    .join("\n");
}

export const documentHash = (text: string) => sha256(canonicalDocument(text));
