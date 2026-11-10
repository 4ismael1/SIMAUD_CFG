import argon2 from "argon2";
import { concurrencyLimit } from "./concurrency.js";
const passwordWork = concurrencyLimit(4);
export const hashPassword = (password: string) =>
  passwordWork(() =>
    argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    }),
  );
export const verifyPassword = (hash: string, password: string) =>
  passwordWork(() => argon2.verify(hash, password));
