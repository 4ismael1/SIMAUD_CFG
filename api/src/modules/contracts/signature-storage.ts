import { storage } from "../../lib/storage.js";
import { notFound } from "./service.js";
export function signatureKey(name: string) {
  if (!/^[0-9a-f-]{36}\.png$/.test(name)) throw notFound();
  return "signatures/" + name;
}
export async function removeSignatureFiles(names: string[]) {
  for (const name of names) await storage.delete(signatureKey(name));
}
