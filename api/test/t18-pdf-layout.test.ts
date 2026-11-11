import { expect, it } from "vitest";
import { documentPdf } from "../src/lib/rich-doc/document-pdf.js";
import { signatureContent, type SignatureSlotGeometry } from "../src/lib/rich-doc/signatures.js";
import { validPng } from "./image-fixtures.js";
import type { ContentStack } from "pdfmake/interfaces.js";
import type { RichDoc } from "../src/lib/rich-doc/types.js";

it("la geometría de la casilla no se mueve al colocar la imagen y refleja la página real", async () => {
  const document: RichDoc = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Página uno" }] },
      { type: "pageBreak" },
      {
        type: "signatures",
        attrs: { columns: 2 as const },
        content: [{ type: "signatureSlot", attrs: { label: "" } }],
      },
    ],
  };
  const empty: SignatureSlotGeometry[] = [];
  const signed: SignatureSlotGeometry[] = [];
  const signer = { signingOrder: 1, name: "Prueba", cedula: "00112345673", signedAt: null };
  await documentPdf(document, "Casilla vacía", {
    signers: [signer],
    onSignatureSlot: (slot) => empty.push(slot),
  });
  await documentPdf(document, "Casilla firmada", {
    signers: [
      {
        ...signer,
        image: "data:image/png;base64," + validPng().toString("base64"),
        placement: { x: 1, y: 0, scale: 0.5 },
      },
    ],
    onSignatureSlot: (slot) => signed.push(slot),
  });
  expect(signed.at(-1)).toEqual(empty.at(-1));
  expect(signed.at(-1)).toMatchObject({ page: 2, slotIndex: 0 });
  const slot = signed.at(-1)!;
  expect(slot.x + slot.width).toBeLessThan(1);
  expect(slot.y + slot.height).toBeLessThan(1);
});

it("la celda PDF usa dimensiones y desplazamientos acotados y cédula formateada", () => {
  const cell = signatureContent(
    {
      type: "signatures",
      attrs: { columns: 1 },
      content: [{ type: "signatureSlot", attrs: { label: "" } }],
    },
    1,
    [
      {
        signingOrder: 1,
        name: "Prueba",
        cedula: "00112345673",
        signedAt: null,
        image: "data:image/png;base64," + validPng().toString("base64"),
        placement: { x: 100, y: -100, scale: 0.5 },
      },
    ],
    200,
    11,
    1,
  ) as ContentStack;
  const serialized = JSON.stringify(cell);
  expect(serialized).toContain("001-1234567-3");
  expect(serialized).toContain('"height":31');
  expect(serialized).toContain('"relativePosition":{"x":118,"y":0}');
});
