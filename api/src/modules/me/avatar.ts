import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { db } from "../../db/client.js";
import { files, users } from "../../db/schema.js";
import { ApiError, unauthorized } from "../../lib/errors.js";
import { active, lockUser } from "../auth/service.js";
import { publicUser } from "../users/schemas.js";
export const avatarDirectory = fileURLToPath(new URL("../../../storage/avatars/", import.meta.url));
const formats = {
  jpeg: { ext: "jpg", mime: "image/jpeg" },
  png: { ext: "png", mime: "image/png" },
  webp: { ext: "webp", mime: "image/webp" },
};
export const avatarName =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/;
function format(data: Buffer) {
  if (data.length >= 3 && data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])))
    return formats.jpeg;
  if (
    data.length >= 8 &&
    data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return formats.png;
  if (
    data.length >= 12 &&
    data.toString("ascii", 0, 4) === "RIFF" &&
    data.toString("ascii", 8, 12) === "WEBP"
  )
    return formats.webp;
  throw new ApiError(
    400,
    "VALIDATION_ERROR",
    "El archivo debe ser una imagen JPEG, PNG o WebP válida.",
  );
}
async function removeFile(name: string | null) {
  if (name && avatarName.test(name))
    await unlink(avatarDirectory + name).catch((e) => {
      if (e.code !== "ENOENT") throw e;
    });
}
export async function uploadAvatar(request: FastifyRequest) {
  let data: Buffer | undefined;
  let mime: string | undefined;
  for await (const part of request.parts({
    limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0, parts: 1 },
  })) {
    if (part.type !== "file") throw new ApiError(400, "VALIDATION_ERROR", "Selecciona una imagen.");
    data = await part.toBuffer();
    mime = part.mimetype;
    if (part.file.truncated)
      throw new ApiError(413, "VALIDATION_ERROR", "La imagen no puede superar 2 MB.");
  }
  if (!data) throw new ApiError(400, "VALIDATION_ERROR", "Selecciona una imagen.");
  const type = format(data);
  if (mime !== type.mime)
    throw new ApiError(400, "VALIDATION_ERROR", "El contenido no coincide con el tipo de imagen.");
  const name = randomUUID() + "." + type.ext;
  await mkdir(avatarDirectory, { recursive: true });
  await writeFile(avatarDirectory + name, data, { flag: "wx" });
  let previous: string | null = null;
  let updated;
  try {
    updated = await db.transaction(async (tx) => {
      const user = await lockUser(tx, request.user.id);
      if (!active(user)) throw unauthorized();
      previous = user.avatarPath;
      await tx.insert(files).values({
        ownerId: user.id,
        kind: "avatar",
        path: name,
        mime: type.mime,
        size: data.length,
      });
      const [next] = await tx
        .update(users)
        .set({ avatarPath: name })
        .where(eq(users.id, user.id))
        .returning();
      if (previous)
        await tx.delete(files).where(and(eq(files.ownerId, user.id), eq(files.path, previous)));
      return publicUser(next!);
    });
  } catch (e) {
    await removeFile(name);
    throw e;
  }
  await removeFile(previous);
  return updated;
}
export async function deleteAvatar(id: string) {
  const previous = await db.transaction(async (tx) => {
    const user = await lockUser(tx, id);
    if (!active(user)) throw unauthorized();
    await tx.update(users).set({ avatarPath: null }).where(eq(users.id, id));
    if (user.avatarPath)
      await tx.delete(files).where(and(eq(files.ownerId, id), eq(files.path, user.avatarPath)));
    return user.avatarPath;
  });
  await removeFile(previous);
}
export async function getAvatar(name: string) {
  const [file] = await db
    .select()
    .from(files)
    .where(and(eq(files.path, name), eq(files.kind, "avatar")));
  if (!file) throw new ApiError(404, "NOT_FOUND", "No se encontró el avatar.");
  try {
    return { mime: file.mime, data: await readFile(avatarDirectory + name) };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT")
      throw new ApiError(404, "NOT_FOUND", "No se encontró el avatar.");
    throw e;
  }
}
