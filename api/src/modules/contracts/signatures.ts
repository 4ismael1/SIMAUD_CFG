import { signatureInbox } from "./signature-inbox.js";
import { activateRenewalParent } from "../renewals/routes.js";
import { saveFinalPdf, finalPdfName, removeFinalPdf } from "./pdf.js";
import { sanitizePng } from "../../lib/storage-png.js";
import { trashFile } from "../../lib/storage.js";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { contracts, contractSignatories as signatories, files } from "../../db/schema.js";
import { authenticate } from "../../plugins/auth.js";
import { parse, uuid, pageInput } from "./schemas.js";
import { transition } from "./state-machine.js";
import * as contractService from "./service.js";
const directory = path.resolve("storage/signatures");
function safePath(name: string) {
  if (!/^[0-9a-f-]{36}\.png$/.test(name)) throw contractService.notFound();
  return path.join(directory, name);
}
export async function removeSignatureFiles(names: string[]) {
  for (const name of names) await trashFile(safePath(name));
}
export async function signatureRoutes(app: FastifyInstance) {
  const auth = { preHandler: authenticate };
  app.get("/me/signatures", auth, async (req) => {
    const query = parse(
      pageInput.extend({ status: z.enum(["pending", "signed"]).default("pending") }),
      req.query,
    );
    return signatureInbox(req.user, query);
  });
  app.post("/contracts/:id/sign", auth, async (req) => {
    const id = parse(uuid, (req.params as { id: string }).id);
    let buffer: Buffer | undefined;
    let accepted: string | undefined;
    let viewedAt: string | undefined;
    for await (const part of req.parts({
      limits: { fileSize: 500 * 1024, files: 1, fields: 2, parts: 3 },
    })) {
      if (part.type === "file") {
        if (part.fieldname !== "signature" || part.mimetype !== "image/png")
          throw contractService.invalid("La firma debe ser PNG.");
        buffer = await part.toBuffer();
      } else if (part.fieldname === "acceptedDeclaration" && accepted === undefined)
        accepted = String(part.value);
      else if (part.fieldname === "viewedAt" && viewedAt === undefined)
        viewedAt = String(part.value);
      else throw contractService.invalid("Campo multipart inválido.");
    }
    if (!buffer) throw contractService.invalid("Selecciona una firma PNG.");
    buffer = sanitizePng(buffer);
    if (accepted !== "true") throw contractService.invalid("Debes aceptar la declaración.");
    const viewed = parse(z.iso.datetime({ offset: true }), viewedAt);
    if (Date.parse(viewed) > Date.now())
      throw contractService.invalid("viewedAt no puede estar en el futuro.");
    const name = randomUUID() + ".png";
    let written = false;
    let finalName: string | undefined;
    try {
      await db.transaction(async (tx) => {
        const contract = await contractService.getContract(tx, id, true);
        await contractService.linkSignatories(tx, req.user);
        const allSignatories = await contractService.getSignatories(tx, id);
        const me = allSignatories.find((item) => item.userId === req.user.id);
        if (!me) throw contractService.forbidden();
        if (me.status === "signed") throw contractService.conflict("Ya has firmado.");
        if (!contractService.permissions(contract, req.user, allSignatories).sign)
          throw contractService.conflict("No es tu turno de firmar.");
        if (Date.parse(viewed) < contract.updatedAt.getTime())
          throw contractService.invalid("Debes volver a visualizar el contrato actual.");
        await mkdir(directory, { recursive: true });
        await writeFile(safePath(name), buffer!, { flag: "wx" });
        written = true;
        const [file] = await tx
          .insert(files)
          .values({
            ownerId: req.user.id,
            contractId: id,
            kind: "signature",
            path: name,
            mime: "image/png",
            size: buffer!.length,
          })
          .returning();
        await tx
          .update(signatories)
          .set({
            status: "signed",
            signaturePath: name,
            signedAt: new Date(),
            viewedAt: new Date(viewed),
            acceptedDeclarationAt: new Date(),
            ip: req.ip,
            userAgent: req.headers["user-agent"],
          })
          .where(eq(signatories.id, me.id));
        const last = allSignatories.every((item) => item.id === me.id || item.status === "signed");
        const next = last ? transition(contract.status, "sign") : contract.status;
        // Intermediate signatures do not change document freshness.
        if (last)
          await tx
            .update(contracts)
            .set({ status: next, updatedAt: new Date() })
            .where(eq(contracts.id, id));
        if (last) await activateRenewalParent(tx, contract, req.user.id);
        if (last)
          await contractService.notify(
            tx,
            contract,
            "contract_signed",
            [{ userId: contract.createdBy }, ...allSignatories],
            "El contrato ha sido firmado por todos.",
          );
        else await contractService.nextSigners(tx, contract);
        await contractService.record(
          tx,
          req,
          contract,
          "sign",
          { status: contract.status, signatoryId: me.id },
          {
            status: next,
            signatoryId: me.id,
            fileId: file!.id,
            viewedAt: viewed,
            acceptedDeclaration: true,
          },
        );
        if (last) {
          await saveFinalPdf(tx, contract, () => {
            finalName = finalPdfName(contract);
          });
        }
      });
    } catch (error) {
      if (written) await removeSignatureFiles([name]);
      if (finalName) await removeFinalPdf(finalName);
      throw error;
    }
    return { message: "Firma registrada." };
  });
  app.get("/files/signatures/:id", auth, async (req, reply) => {
    const id = parse(uuid, (req.params as { id: string }).id);
    const [file] = await db
      .select()
      .from(files)
      .where(and(eq(files.id, id), eq(files.kind, "signature")));
    if (!file) throw contractService.notFound();
    if (!file.contractId) throw contractService.notFound();
    const contract = await contractService.getContract(db, file.contractId);
    const all = await contractService.getSignatories(db, contract.id);
    if (!(
      ["admin", "supervisor"].includes(req.user.role) ||
      contract.createdBy === req.user.id ||
      all.some((item) => item.userId === req.user.id)
    ))
      throw contractService.notFound();
    let bytes: Buffer;
    try {
      bytes = await readFile(safePath(file.path));
    } catch {
      throw contractService.notFound();
    }
    return reply
      .header("Cache-Control", "private, no-store")
      .header("X-Content-Type-Options", "nosniff")
      .type("image/png")
      .send(bytes);
  });
}
