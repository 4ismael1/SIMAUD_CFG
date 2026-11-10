import { getAccessToken, getSessionRevision, updateSession } from "./session";
export type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Readonly<Record<string, QueryValue>>;
export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: QueryParams;
  signal?: AbortSignal;
  formData?: FormData;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export function apiUrl(path: string, query?: QueryParams) {
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("..") ||
    path.includes("?") ||
    path.includes("#")
  ) {
    throw new ApiError(0, "INVALID_PATH", "La ruta solicitada no es válida.");
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null) params.set(key, String(value));
  }
  return "/api/v1" + path + (params.size ? "?" + params.toString() : "");
}
async function responseError(response: Response) {
  const payload: unknown = await response.json().catch(() => null);
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = payload.error;
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      "message" in error
    ) {
      return new ApiError(
        response.status,
        String(error.code),
        String(error.message),
        "details" in error ? error.details : undefined,
      );
    }
  }
  return new ApiError(
    response.status,
    "HTTP_ERROR",
    "No se pudo completar la solicitud. Inténtalo de nuevo.",
  );
}
async function send(path: string, options: RequestOptions = {}) {
  const headers = new Headers();
  const token = getAccessToken();
  if (token) headers.set("Authorization", "Bearer " + token);
  if (options.body !== undefined && !options.formData)
    headers.set("Content-Type", "application/json");
  const url = apiUrl(path, options.query);
  try {
    return await fetch(url, {
      method: options.method ?? "GET",
      credentials: "include",
      headers,
      body:
        options.formData ??
        (options.body === undefined ? undefined : JSON.stringify(options.body)),
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new ApiError(
      0,
      "NETWORK",
      "No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.",
    );
  }
}
let refreshInFlight: Promise<string> | null = null;
async function performRefresh() {
  const revision = getSessionRevision();
  try {
    let response = await send("/auth/refresh", { method: "POST" });
    if (response.status === 409) {
      const error = await responseError(response);
      if (error.code !== "REFRESH_RACE") throw error;
      await new Promise((resolve) => setTimeout(resolve, 300));
      response = await send("/auth/refresh", { method: "POST" });
    }
    if (!response.ok) throw await responseError(response);
    const payload: unknown = await response.json();
    if (
      !payload ||
      typeof payload !== "object" ||
      !("accessToken" in payload) ||
      typeof payload.accessToken !== "string"
    ) {
      throw new ApiError(
        502,
        "INVALID_RESPONSE",
        "El servidor devolvió una sesión inválida.",
      );
    }
    if (revision !== getSessionRevision()) {
      const currentToken = getAccessToken();
      if (currentToken) return currentToken;
      throw new ApiError(401, "UNAUTHORIZED", "La sesión ha terminado.");
    }
    updateSession("token-renewed", payload.accessToken);
    return payload.accessToken;
  } catch (error) {
    if (revision === getSessionRevision()) updateSession("session-expired");
    throw error;
  }
}
export function refreshSession() {
  if (!refreshInFlight)
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}
async function authorizedResponse(path: string, options: RequestOptions = {}) {
  const token = getAccessToken();
  let response = await send(path, options);
  const isAuthEndpoint = path.startsWith("/auth/");
  if (response.status === 401 && !isAuthEndpoint) {
    if (!getAccessToken() || token === getAccessToken()) await refreshSession();
    options.signal?.throwIfAborted();
    response = await send(path, options);
    if (response.status === 401) updateSession("session-expired");
  }
  if (!response.ok) throw await responseError(response);
  return response;
}
export async function apiFetch<T>(
  path: string,
  options?: RequestOptions,
): Promise<T> {
  const response = await authorizedResponse(path, options);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
function downloadFilename(disposition: string | null) {
  const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const plain = disposition?.match(/filename="([^"]+)"|filename=([^;]+)/i);
  let filename = plain?.[1] ?? plain?.[2]?.trim() ?? "descarga";
  if (encoded) {
    try {
      filename = decodeURIComponent(encoded);
    } catch {
      /* Conserva el nombre simple si el servidor envía una codificación inválida. */
    }
  }
  return filename.replace(/[/\\]/g, "_");
}
export async function apiDownload(path: string, query?: QueryParams) {
  const response = await authorizedResponse(path, { query });
  return {
    blob: await response.blob(),
    filename: downloadFilename(response.headers.get("Content-Disposition")),
  };
}

/** POST that returns a file (e.g. a generated PDF preview), with the same session handling as apiFetch. */
export async function apiPostBlob(path: string, body: unknown, signal?: AbortSignal): Promise<Blob> {
  const response = await authorizedResponse(path, { method: "POST", body, signal });
  return response.blob();
}
