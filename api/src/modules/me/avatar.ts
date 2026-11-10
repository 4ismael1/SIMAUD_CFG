import { sanitizePng } from "../../lib/storage-png.js";
import { storage, withStorageMutation, storageDirectory } from "../../lib/storage.js";
import { StorageError } from "../../lib/storage-types.js";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { db } from "../../db/client.js";
import { files, users } from "../../db/schema.js";
import { ApiError, unauthorized } from "../../lib/errors.js";
import { active, lockUser } from "../auth/service.js";
import { publicUser } from "../users/schemas.js";
export const avatarDirectory = path.join(storageDirectory, "avatars") + path.sep;
export const avatarName =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/;
async function removeFile(name: string | null) {
  if (name && avatarName.test(name)) await storage.delete("avatars/" + name);
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
  if (mime !== "image/png")
    throw new ApiError(400, "VALIDATION_ERROR", "Selecciona una imagen PNG válida.");
  const bytes = sanitizePng(data);
  return withStorageMutation(() => storeAvatar(request, bytes));
}
async function storeAvatar(request: FastifyRequest, data: Buffer) {
  const name = randomUUID() + ".png";
  await storage.put("avatars/" + name, data, { contentType: "image/png" });
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
        mime: "image/png",
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
  return withStorageMutation(() => removeAvatar(id));
}
async function removeAvatar(id: string) {
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
    return { mime: file.mime, data: await storage.get("avatars/" + name) };
  } catch (e) {
    if (e instanceof StorageError && e.reason === "missing")
      throw new ApiError(404, "NOT_FOUND", "No se encontró el avatar.");
    throw e;
  }
}
