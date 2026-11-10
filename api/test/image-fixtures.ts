import { encodeRgba } from "../src/lib/storage-png.js";

export const validPng = () => encodeRgba(2, 1, Buffer.from([0, 0, 0, 255, 255, 255, 255, 0]));
