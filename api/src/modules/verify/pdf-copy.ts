import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
export async function verificationCopy(bytes: Buffer, now = new Date()) {
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const date = new Intl.DateTimeFormat("es-DO", {
    timeZone: "America/Santo_Domingo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(now);
  const label = "Copia de verificación — " + date;
  for (const page of pdf.getPages()) {
    page.drawRectangle({
      x: 0,
      y: 0,
      width: page.getWidth(),
      height: 24,
      color: rgb(1, 1, 1),
      opacity: 0.92,
    });
    page.drawText(label, { x: 18, y: 8, size: 9, font, color: rgb(0.3, 0.3, 0.3) });
  }
  return Buffer.from(await pdf.save());
}
export async function pdfPageCount(bytes: Buffer) {
  return (await PDFDocument.load(bytes, { updateMetadata: false })).getPageCount();
}
