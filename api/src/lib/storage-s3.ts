import { AwsClient } from "aws4fetch";
import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
  StorageError,
  storageDateTimestamp,
  trashDate,
  validateKey,
  type StorageDriver,
} from "./storage-types.js";
import { decryptFile, encryptFile } from "./storage-encryption.js";
import { env } from "../config/env.js";

export function isStorageEndpoint(value: string) {
  try {
    const url = new URL(value);
    return (
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === "/" &&
      (url.protocol === "https:" ||
        (env.NODE_ENV !== "production" &&
          url.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
    );
  } catch {
    return false;
  }
}

export interface S3Config {
  driver: "s3";
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix: string;
  forcePathStyle: boolean;
}

function responseError(response: Response, method: string) {
  if (response.status === 403 || response.status === 401)
    return new StorageError(
      "denied",
      method === "PUT"
        ? "Credenciales rechazadas o sin permiso de escritura."
        : "Credenciales rechazadas o sin permiso de acceso.",
    );
  if (response.status === 404) return new StorageError("missing", "Bucket u objeto no existe.");
  if (response.status === 412) return new StorageError("conflict", "El archivo ya existe.");
  return new StorageError("unreachable", "El proveedor de almacenamiento no está disponible.");
}

const encodePath = (value: string) => value.split("/").map(encodeURIComponent).join("/");
const xmlText = (value: string) =>
  value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, number: string) => String.fromCodePoint(Number(number)))
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");

export class S3Storage implements StorageDriver {
  private readonly client: AwsClient;
  constructor(
    readonly config: S3Config,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    if (!isStorageEndpoint(config.endpoint))
      throw new StorageError(
        "invalid",
        "Usa un endpoint HTTPS sin credenciales, ruta ni parámetros.",
      );
    if (config.prefix) validateKey(config.prefix);
    this.client = new AwsClient({ ...config, service: "s3", retries: 0 });
  }

  private objectKey(key: string) {
    return this.config.prefix ? this.config.prefix + "/" + key : key;
  }

  private url(key: string) {
    const url = new URL(this.config.endpoint);
    if (!this.config.forcePathStyle) url.hostname = this.config.bucket + "." + url.hostname;
    url.pathname =
      (this.config.forcePathStyle ? "/" + encodeURIComponent(this.config.bucket) : "") +
      "/" +
      encodePath(this.objectKey(key));
    return url;
  }

  private async request(
    method: string,
    url: URL,
    headers: Record<string, string> = {},
    bytes?: Buffer,
  ) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const request = await this.client.sign(url, {
          method,
          headers,
          body: bytes ? new Uint8Array(bytes) : undefined,
          signal: AbortSignal.timeout(10000),
          redirect: "error",
        });
        const response = await this.fetcher(request);
        if ((response.status === 429 || response.status >= 500) && attempt < 2) {
          await response.body?.cancel();
          await delay(100 * 2 ** attempt);
          continue;
        }
        if (!response.ok) {
          await response.body?.cancel();
          throw responseError(response, method);
        }
        // Consume the response under the same timeout as its headers.
        return { bytes: Buffer.from(await response.arrayBuffer()), headers: response.headers };
      } catch (error) {
        if (error instanceof StorageError) throw error;
        if (attempt === 2)
          throw new StorageError("unreachable", "Endpoint inaccesible o tiempo de espera agotado.");
        await delay(100 * 2 ** attempt);
      }
    }
    throw new StorageError("unreachable", "Endpoint inaccesible.");
  }

  async put(key: string, bytes: Buffer, options: { contentType: string }) {
    validateKey(key);
    bytes = encryptFile(key, bytes);
    const writeId = randomUUID();
    try {
      await this.request(
        "PUT",
        this.url(key),
        {
          "content-type": options.contentType,
          "if-none-match": "*",
          "x-amz-content-sha256": createHash("sha256").update(bytes).digest("hex"),
          "x-amz-meta-simaud-write-id": writeId,
        },
        bytes,
      );
    } catch (error) {
      if (!(error instanceof StorageError) || !["conflict", "unreachable"].includes(error.reason))
        throw error;
      // A timed-out PUT may have succeeded. Only this invocation may claim it.
      const metadata = await this.request("HEAD", this.url(key));
      if (metadata.headers.get("x-amz-meta-simaud-write-id") !== writeId) throw error;
      const stored = await this.request("GET", this.url(key));
      if (!stored.bytes.equals(bytes))
        throw new StorageError(
          "conflict",
          "El archivo escrito no supera la verificación de integridad.",
        );
    }
  }

  async get(key: string) {
    return decryptFile(key, (await this.request("GET", this.url(validateKey(key)))).bytes);
  }

  async exists(key: string) {
    try {
      await this.request("HEAD", this.url(validateKey(key)));
      return true;
    } catch (error) {
      if (error instanceof StorageError && error.reason === "missing") return false;
      throw error;
    }
  }

  async delete(key: string, today = new Date().toISOString().slice(0, 10)) {
    validateKey(key);
    const trash = "trash/" + trashDate(today) + "/" + key;
    if (!(await this.exists(key))) return;
    await this.request("PUT", this.url(trash), {
      "x-amz-copy-source": "/" + encodePath(this.config.bucket + "/" + this.objectKey(key)),
    });
    // Some compatible servers return a CopyObject error in an HTTP 200 body.
    const [source, copied] = await Promise.all([this.get(key), this.get(trash)]);
    if (!source.equals(copied))
      throw new StorageError("unreachable", "No se pudo verificar la copia a papelera.");
    await this.request("DELETE", this.url(key));
  }

  async list(prefix = "") {
    if (prefix) validateKey(prefix.replace(/\/$/, ""));
    const keys: string[] = [];
    let token = "";
    do {
      const url = this.url("");
      url.pathname = this.config.forcePathStyle
        ? "/" + encodeURIComponent(this.config.bucket)
        : "/";
      url.searchParams.set("list-type", "2");
      url.searchParams.set("prefix", this.objectKey(prefix));
      if (token) url.searchParams.set("continuation-token", token);
      const xml = (await this.request("GET", url)).bytes.toString("utf8");
      if (!xml.includes("ListBucketResult") || xml.includes("<Error>"))
        throw new StorageError("unreachable", "Respuesta de listado S3 inválida.");
      for (const match of xml.matchAll(/<Key>([\s\S]*?)<\/Key>/g)) {
        const key = xmlText(match[1]!);
        const relative = this.config.prefix ? key.slice(this.config.prefix.length + 1) : key;
        validateKey(relative);
        if (!key.startsWith(this.objectKey(prefix)))
          throw new StorageError("invalid", "Listado fuera del prefijo configurado.");
        keys.push(relative);
      }
      const next = xmlText(
        xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)?.[1] ?? "",
      );
      if (xml.includes("<IsTruncated>true</IsTruncated>") && (!next || next === token))
        throw new StorageError("unreachable", "Paginación S3 inválida.");
      token = next;
    } while (token);
    return keys;
  }

  async purge(today: string) {
    const cutoff = Date.parse(trashDate(today) + "T00:00:00Z") - 8 * 86400000;
    const dates = new Set<string>();
    for (const key of await this.list("trash/")) {
      const date = key.split("/")[1]!;
      const timestamp = storageDateTimestamp(date);
      if (!Number.isFinite(timestamp) || timestamp >= cutoff) continue;
      await this.request("DELETE", this.url(key));
      dates.add(date);
    }
    return dates.size;
  }
}
