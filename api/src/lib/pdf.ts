import pdfmake from "pdfmake";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces.js";
const fontsDirectory = fileURLToPath(new URL("../../assets/fonts/", import.meta.url));
pdfmake.addFonts({
  Roboto: {
    normal: path.join(fontsDirectory, "Roboto-Regular.ttf"),
    bold: path.join(fontsDirectory, "Roboto-Medium.ttf"),
    italics: path.join(fontsDirectory, "Roboto-Italic.ttf"),
    bolditalics: path.join(fontsDirectory, "Roboto-MediumItalic.ttf"),
  },
});
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy((file) =>
  path.resolve(file).startsWith(path.resolve(fontsDirectory) + path.sep),
);
export async function makePdf(
  content: Content[],
  title: string,
  options: Partial<TDocumentDefinitions> = {},
) {
  return pdfmake
    .createPdf({
      info: { title, author: "SIMAUD" },
      pageSize: "A4",
      pageMargins: [48, 48, 48, 48],
      defaultStyle: { font: "Roboto", fontSize: 10, lineHeight: 1.3 },
      footer: (page, pages) => ({
        text: page + " / " + pages,
        alignment: "center",
        fontSize: 8,
        margin: [0, 14, 0, 0],
      }),
      content,
      ...options,
    })
    .getBuffer();
}
export function paragraphs(text: string): Content[] {
  return text.split(/\r?\n/).map((line) => ({
    text: line.split(/(\*\*[^*]+\*\*)/).map((part) => ({
      text: part.startsWith("**") ? part.slice(2, -2) : part,
      bold: part.startsWith("**"),
    })),
    margin: [0, 0, 0, 8],
  }));
}
export function decodeRenderedText(text: string) {
  return text.replace(
    /&(?:amp|lt|gt|quot|#39);/g,
    (entity) => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" })[entity]!,
  );
}
