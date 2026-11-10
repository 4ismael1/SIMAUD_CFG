import { isIP } from "node:net";
export function normalizeClientIp(ip: string) {
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
  return mapped && isIP(mapped) === 4 ? mapped : ip;
}
export function warnMissingTrustProxy(
  nodeEnv: string,
  configured: string | undefined,
  logger: { warn: (message: string) => void },
) {
  if (nodeEnv === "production" && configured === undefined)
    logger.warn("TRUST_PROXY no está definido: la evidencia puede registrar la IP del proxy.");
}
