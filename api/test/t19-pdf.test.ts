import { afterEach, expect, it, vi } from "vitest";
import type { Content, ContentColumns, ContentStack } from "pdfmake/interfaces.js";
import * as pdf from "../src/lib/pdf.js";
import { documentPdf } from "../src/lib/rich-doc/document-pdf.js";
import { canonicalRichDoc } from "../src/lib/rich-doc/schema.js";
import { contentDocumentHash } from "../src/lib/rich-doc/content.js";
import type { PdfSigner, SignatureSlotGeometry } from "../src/lib/rich-doc/signatures.js";
import { encodeRgba } from "../src/lib/storage-png.js";
import { partyDocument, labels } from "./t19-helpers.js";
import { sha256 } from "../src/lib/crypto/canonical.js";
import { prepareSlotSignatories } from "../src/modules/contracts/slot-signatories.js";

afterEach(() => vi.restoreAllMocks());

function signerImage(index: number) {
  return (
    "data:image/png;base64," +
    encodeRgba(1, 1, Buffer.from([10 * index, 50, 100, 255])).toString("base64")
  );
}

it("el PDF coloca cada nombre, imagen y etiqueta en su casilla aunque firme primero la segunda persona", async () => {
  const document = partyDocument();
  document.content = [
    { type: "paragraph", content: [{ type: "text", text: "Documento" }] },
    { type: "pageBreak" },
    document.content.at(-1)!,
  ];
  const signers: PdfSigner[] = [1, 2, 0, 3].map((index, signingOrder) => ({
    slotIndex: index < 3 ? index : null,
    roleLabel: index < 3 ? labels[index] : "Testigo",
    signingOrder: signingOrder + 1,
    name: `Persona ${index}`,
    cedula: "00112345673",
    signedAt: null,
    image: signerImage(index),
  }));
  let rendered: Content[] = [];
  const original = pdf.makePdf;
  vi.spyOn(pdf, "makePdf").mockImplementation((content, title, options) => {
    rendered = structuredClone(content);
    return original(content, title, options);
  });
  const slots = new Map<number, SignatureSlotGeometry>();
  const bytes = await documentPdf(document, "Casillas T19", {
    signers,
    onSignatureSlot: (slot) => slots.set(slot.slotIndex, slot),
  });
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  const block = rendered[2] as ContentStack;
  const firstRow = block.stack[0] as ContentColumns;
  const secondRow = (rendered[3] as ContentStack).stack[0] as ContentColumns;
  for (let index = 0; index < 4; index++) {
    const cell = (index < 3 ? firstRow.columns[index] : secondRow.columns[0]) as ContentStack;
    const serialized = JSON.stringify(cell);
    expect(serialized).toContain(`Persona ${index}`);
    expect(serialized).toContain(signerImage(index));
    expect(serialized).toContain(index < 3 ? labels[index] : "TESTIGO");
    expect(slots.get(index)).toMatchObject({ page: 2, slotIndex: index });
  }
  expect(slots.get(0)!.x).toBeLessThan(slots.get(1)!.x);
  expect(slots.get(1)!.x).toBeLessThan(slots.get(2)!.x);
  expect(slots.get(3)!.y).toBeGreaterThan(slots.get(0)!.y);
  expect(document.content.at(-1)!.content).toHaveLength(3);
});

it("la canonicalización y los hashes históricos sin party conservan exactamente sus bytes", () => {
  const stored =
    '{"type":"doc","content":[{"type":"signatures","content":[{"type":"signatureSlot","attrs":{"label":"","showName":false,"showId":false}}]}]}';
  expect(canonicalRichDoc(JSON.parse(stored))).toBe(stored);
  expect(contentDocumentHash(stored, "rich-v2")).toBe(sha256(stored));
  const withParty = JSON.parse(stored);
  withParty.content[0].content[0].attrs.party = "cliente";
  const canonical = canonicalRichDoc(withParty);
  expect(canonicalRichDoc(JSON.parse(canonical))).toBe(canonical);
  expect(contentDocumentHash(canonical, "rich-v2")).not.toBe(sha256(stored));
});

it("limita a diez los testigos extra y conserva las reglas de roles en formatos sin casillas", () => {
  const slots = canonicalRichDoc(partyDocument());
  const assigned = [0, 1, 2].map((slotIndex) => ({
    name: "Persona",
    email: `persona${slotIndex}@example.com`,
    slotIndex,
  }));
  const extras = Array.from({ length: 11 }, (_, index) => ({
    name: "Testigo",
    email: `testigo${index}@example.com`,
    role: "witness" as const,
  }));
  expect(() => prepareSlotSignatories(slots, "rich-v2", [...assigned, ...extras])).toThrow(
    "hasta diez testigos",
  );
  expect(
    prepareSlotSignatories(slots, "rich-v2", [...assigned, ...extras.slice(0, 10)]),
  ).toHaveLength(13);
  for (const format of ["plain", "rich-v1", "rich-v2"] as const) {
    const content =
      format === "plain" ? "Texto" : '{"type":"doc","content":[{"type":"paragraph"}]}';
    expect(() => prepareSlotSignatories(content, format, [assigned[0]!])).toThrow(
      "no tiene casillas",
    );
    expect(
      prepareSlotSignatories(content, format, [
        { name: "Persona", email: "persona@example.com", role: "client", signingOrder: 7 },
      ])[0],
    ).toMatchObject({ role: "client", roleLabel: "Cliente", slotIndex: null, signingOrder: 7 });
  }
});
