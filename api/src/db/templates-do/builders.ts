/**
 * Small helpers to write rich-v2 contract templates as code: paragraphs with variables and bold text,
 * numbered clauses (PRIMERA., SEGUNDA.…), lists and the signature block (one box per signer role).
 */
import type { RichDoc } from "../../lib/rich-doc/types.js";

/** A piece of a paragraph: text, `{ v: "variable" }`, `{ vb: "variable in bold" }` or `{ b: "bold text" }`. */
export type Part = string | { v: string } | { vb: string } | { b: string };

type Inline = Record<string, unknown>;
type Block = Record<string, unknown>;

function inline(parts: Part[]): Inline[] {
  return parts.map((part) => {
    if (typeof part === "string") return { type: "text", text: part };
    if ("v" in part) return { type: "variable", attrs: { name: part.v } };
    if ("vb" in part)
      return { type: "variable", attrs: { name: part.vb }, marks: [{ type: "bold" }] };
    return { type: "text", text: part.b, marks: [{ type: "bold" }] };
  });
}

/** Justified paragraph. */
export const p = (...parts: Part[]): Block => ({
  type: "paragraph",
  attrs: { textAlign: "justify" },
  content: inline(parts),
});

/** Centered paragraph (dates, subtitles). */
export const center = (...parts: Part[]): Block => ({
  type: "paragraph",
  attrs: { textAlign: "center" },
  content: inline(parts),
});

/** Document title. */
export const title = (text: string): Block => ({
  type: "heading",
  attrs: { level: 1, textAlign: "center" },
  content: [{ type: "text", text }],
});

/** Numbered clause heading: «PRIMERA. OBJETO». */
export const clause = (text: string): Block => ({
  type: "heading",
  attrs: { level: 2, numbered: "ordinal" },
  content: [{ type: "text", text }],
});

/** Bulleted list; each item is a sentence with variables allowed. */
export const list = (...items: Part[][]): Block => ({
  type: "bulletList",
  content: items.map((parts) => ({
    type: "listItem",
    content: [{ type: "paragraph", content: inline(parts) }],
  })),
});

/** Signature block: one box per role; `party` fills {party}_nombre, _cedula, _email, _telefono. */
export const signatures = (
  slots: { label: string; party?: string }[],
  columns: 1 | 2 | 3 = 2,
): Block => ({
  type: "signatures",
  attrs: { columns },
  content: slots.map((slot) => ({
    type: "signatureSlot",
    attrs: { label: slot.label, ...(slot.party ? { party: slot.party } : {}) },
  })),
});

export const doc = (...content: Block[]): RichDoc =>
  ({ type: "doc", content }) as unknown as RichDoc;

/** «Nombre, de nacionalidad X, mayor de edad, portador(a) de la cédula núm. …, domiciliado(a) en …» */
export function person(party: string, role: string): Part[] {
  return [
    { vb: `${party}_nombre` },
    ", de nacionalidad ",
    { v: `${party}_nacionalidad` },
    ", mayor de edad, portador(a) de la cédula de identidad y electoral núm. ",
    { v: `${party}_cedula` },
    ", domiciliado(a) y residente en ",
    { v: `${party}_domicilio` },
    ", correo electrónico ",
    { v: `${party}_email` },
    ", quien en lo adelante se denominará ",
    { b: role },
  ];
}

/** «Empresa, sociedad comercial con RNC …, representada por Nombre, cédula …, en su calidad de cargo» */
export function company(prefix: string, party: string, role: string): Part[] {
  return [
    { vb: `${prefix}_razon_social` },
    ", sociedad comercial organizada de acuerdo con las leyes de la República Dominicana, con Registro Nacional de Contribuyentes (RNC) núm. ",
    { v: `${prefix}_rnc` },
    ", con domicilio social en ",
    { v: `${prefix}_domicilio` },
    ", debidamente representada por ",
    { vb: `${party}_nombre` },
    ", portador(a) de la cédula de identidad y electoral núm. ",
    { v: `${party}_cedula` },
    ", en su calidad de ",
    { v: `${party}_cargo` },
    ", quien en lo adelante se denominará ",
    { b: role },
  ];
}

/** Closing clauses shared by every contract: electronic signature, personal data, jurisdiction. */
export function closingClauses(): Block[] {
  return [
    clause("FIRMA ELECTRÓNICA Y EJEMPLARES"),
    p(
      "Las partes acuerdan suscribir el presente contrato mediante firma electrónica, la cual tiene la misma validez y eficacia jurídica que la firma manuscrita conforme a la Ley núm. 126-02 sobre Comercio Electrónico, Documentos y Firmas Digitales. El documento firmado, junto con su constancia de verificación, constituye el original del contrato para todas las partes.",
    ),
    clause("DATOS PERSONALES"),
    p(
      "Los datos personales contenidos en este contrato serán tratados únicamente para su ejecución y conservación, conforme a la Ley núm. 172-13 sobre Protección de Datos de Carácter Personal. Cada parte podrá ejercer sus derechos de acceso, rectificación y supresión en los términos de dicha ley.",
    ),
    clause("LEY APLICABLE Y JURISDICCIÓN"),
    p(
      "Para todo lo no previsto en el presente contrato, las partes se remiten al derecho común de la República Dominicana. Cualquier controversia será sometida, previo intento de solución amigable, a los tribunales competentes de ",
      { v: "ciudad_firma" },
      ".",
    ),
  ];
}

/** «HECHO Y FIRMADO en la ciudad de …» */
export const signedIn = (): Block =>
  p(
    { b: "HECHO Y FIRMADO" },
    " de buena fe en la ciudad de ",
    { v: "ciudad_firma" },
    ", República Dominicana, en la fecha de la última firma electrónica registrada en este documento.",
  );
