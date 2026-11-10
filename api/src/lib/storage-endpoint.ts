import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { StorageError } from "./storage-types.js";
export type EndpointResolver = (
  hostname: string,
  options: { all: true },
) => Promise<{ address: string; family: number }[]>;

const blocked = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
  ["2001:db8::", 32],
] as const)
  blocked.addSubnet(network, prefix, "ipv6");

export async function assertPublicStorageEndpoint(
  url: URL,
  production: boolean,
  resolver: EndpointResolver = lookup,
) {
  if (!production) return;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host))
    throw new StorageError("invalid", "El endpoint S3 de producción no admite IP literales.");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const records = await Promise.race([
      resolver(host, { all: true }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("dns")), 5000);
      }),
    ]);
    if (
      !records.length ||
      records.some((record) => blocked.check(record.address, record.family === 6 ? "ipv6" : "ipv4"))
    )
      throw new StorageError(
        "invalid",
        "El endpoint S3 debe resolver únicamente a direcciones públicas.",
      );
  } catch (error) {
    if (error instanceof StorageError) throw error;
    throw new StorageError("invalid", "No se pudo validar el DNS público del endpoint S3.");
  } finally {
    clearTimeout(timer);
  }
}
