import { deflateSync, inflateSync } from "node:zlib";
import { ApiError } from "./errors.js";

const magic = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const invalid = () =>
  new ApiError(
    400,
    "VALIDATION_ERROR",
    "La imagen PNG está dañada o supera 2000 × 1000 píxeles (2 millones de píxeles).",
  );

export function crc32(data: Buffer) {
  let checksum = 0xffffffff;
  for (const byte of data) {
    checksum ^= byte;
    for (let bit = 0; bit < 8; bit++) checksum = (checksum >>> 1) ^ (checksum & 1 ? 0xedb88320 : 0);
  }
  return (checksum ^ 0xffffffff) >>> 0;
}

export function pngChunk(name: string, data: Buffer) {
  const type = Buffer.from(name, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([type, data])));
  return Buffer.concat([length, type, data, checksum]);
}

function readChunks(data: Buffer) {
  if (!data.subarray(0, 8).equals(magic)) throw invalid();
  const chunks: { name: string; data: Buffer }[] = [];
  let offset = 8;
  while (offset + 12 <= data.length) {
    const length = data.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > data.length) throw invalid();
    const name = data.toString("ascii", offset + 4, offset + 8);
    if (crc32(data.subarray(offset + 4, end - 4)) !== data.readUInt32BE(end - 4)) throw invalid();
    chunks.push({ name, data: data.subarray(offset + 8, end - 4) });
    offset = end;
    if (name === "IEND") break;
  }
  if (
    offset !== data.length ||
    chunks[0]?.name !== "IHDR" ||
    chunks.at(-1)?.name !== "IEND" ||
    chunks.at(-1)?.data.length !== 0
  )
    throw invalid();
  if (chunks.filter((chunk) => chunk.name === "IHDR").length !== 1) throw invalid();
  if (
    chunks.some(
      (chunk) =>
        /^[A-Z]/.test(chunk.name) && !["IHDR", "IDAT", "PLTE", "IEND"].includes(chunk.name),
    )
  )
    throw invalid();
  return chunks;
}

function paeth(left: number, up: number, corner: number) {
  const prediction = left + up - corner;
  const distances = [
    Math.abs(prediction - left),
    Math.abs(prediction - up),
    Math.abs(prediction - corner),
  ];
  return distances[0]! <= distances[1]! && distances[0]! <= distances[2]!
    ? left
    : distances[1]! <= distances[2]!
      ? up
      : corner;
}

function unfilter(raw: Buffer, width: number, height: number, channels: number) {
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  for (let row = 0; row < height; row++) {
    const filter = raw[row * (stride + 1)]!;
    if (filter > 4) throw invalid();
    for (let column = 0; column < stride; column++) {
      const offset = row * stride + column;
      const left = column >= channels ? pixels[offset - channels]! : 0;
      const up = row ? pixels[offset - stride]! : 0;
      const corner = row && column >= channels ? pixels[offset - stride - channels]! : 0;
      const predictions = [0, left, up, Math.floor((left + up) / 2), paeth(left, up, corner)];
      pixels[offset] = (raw[row * (stride + 1) + column + 1]! + predictions[filter]!) & 255;
    }
  }
  return pixels;
}

export function encodeRgba(width: number, height: number, pixels: Uint8Array) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc(height * (1 + width * 4));
  for (let row = 0; row < height; row++)
    rows.set(pixels.subarray(row * width * 4, (row + 1) * width * 4), row * (1 + width * 4) + 1);
  return Buffer.concat([
    magic,
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(rows)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function decodePng(data: Buffer) {
  const chunks = readChunks(data);
  const header = chunks[0]!.data;
  if (header.length !== 13) throw invalid();
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const color = header[9]!;
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[color];
  if (
    !width ||
    !height ||
    width > 2000 ||
    height > 1000 ||
    width * height > 2000000 ||
    header[8] !== 8 ||
    !channels ||
    header[10] ||
    header[11] ||
    header[12]
  )
    throw invalid();
  const compressed = Buffer.concat(
    chunks.filter((chunk) => chunk.name === "IDAT").map((chunk) => chunk.data),
  );
  const expected = height * (1 + width * channels);
  const raw = inflateSync(compressed, { maxOutputLength: expected });
  if (raw.length !== expected) throw invalid();
  const pixels = unfilter(raw, width, height, channels);
  const palette = chunks.find((chunk) => chunk.name === "PLTE")?.data;
  const transparency = chunks.find((chunk) => chunk.name === "tRNS")?.data;
  if (palette && (!palette.length || palette.length > 768 || palette.length % 3)) throw invalid();
  if (
    transparency &&
    !(
      (color === 0 && transparency.length === 2) ||
      (color === 2 && transparency.length === 6) ||
      (color === 3 && palette && transparency.length <= palette.length / 3)
    )
  )
    throw invalid();
  const rgba = Buffer.alloc(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel++) {
    const offset = pixel * channels;
    const first = pixels[offset]!;
    if (color === 3 && (!palette || first * 3 + 2 >= palette.length)) throw invalid();
    const rgb =
      color === 3
        ? palette!.subarray(first * 3, first * 3 + 3)
        : color === 2 || color === 6
          ? pixels.subarray(offset, offset + 3)
          : [first, first, first];
    rgba.set(rgb, pixel * 4);
    const transparent =
      transparency &&
      ((color === 0 && first === transparency.readUInt16BE(0)) ||
        (color === 2 &&
          [...rgb].every((value, index) => value === transparency.readUInt16BE(index * 2))));
    rgba[pixel * 4 + 3] = transparent
      ? 0
      : color === 4 || color === 6
        ? pixels[offset + channels - 1]!
        : color === 3
          ? (transparency?.[first] ?? 255)
          : 255;
  }
  return encodeRgba(width, height, rgba);
}

export function sanitizePng(data: Buffer) {
  try {
    return decodePng(data);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw invalid();
  }
}

export function normalizeSignaturePng(data: Buffer) {
  const sanitized = sanitizePng(data);
  const chunks = readChunks(sanitized);
  const width = chunks[0]!.data.readUInt32BE(0);
  const height = chunks[0]!.data.readUInt32BE(4);
  const compressed = Buffer.concat(
    chunks.filter((chunk) => chunk.name === "IDAT").map((chunk) => chunk.data),
  );
  const pixels = unfilter(
    inflateSync(compressed, { maxOutputLength: height * (width * 4 + 1) }),
    width,
    height,
    4,
  );
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!pixels[(y * width + x) * 4 + 3]) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < 0) throw new ApiError(400, "VALIDATION_ERROR", "La firma está vacía.");
  left = Math.max(0, left - 4);
  top = Math.max(0, top - 4);
  right = Math.min(width - 1, right + 4);
  bottom = Math.min(height - 1, bottom + 4);
  const croppedWidth = right - left + 1;
  const croppedHeight = bottom - top + 1;
  const ratio = Math.min(1, 1000 / croppedWidth, 500 / croppedHeight);
  const outputWidth = Math.max(1, Math.round(croppedWidth * ratio));
  const outputHeight = Math.max(1, Math.round(croppedHeight * ratio));
  const output = Buffer.alloc(outputWidth * outputHeight * 4);
  for (let y = 0; y < outputHeight; y++) {
    for (let x = 0; x < outputWidth; x++) {
      const source = ((top + Math.floor(y / ratio)) * width + left + Math.floor(x / ratio)) * 4;
      output.set(pixels.subarray(source, source + 4), (y * outputWidth + x) * 4);
    }
  }
  return encodeRgba(outputWidth, outputHeight, output);
}
