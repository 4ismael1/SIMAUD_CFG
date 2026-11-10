import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { apiDownload, apiFetch, ApiError } from "./client";
import { getAccessToken, updateSession } from "./session";
const base = "http://localhost:3000/api/v1";
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => server.close());
beforeEach(() => updateSession("login", "old-token", false));
afterEach(() => {
  server.resetHandlers();
  vi.useRealTimers();
});
const unauthorized = () =>
  HttpResponse.json(
    { error: { code: "UNAUTHORIZED", message: "Inicia sesión." } },
    { status: 401 },
  );
describe("cliente HTTP", () => {
  it("comparte un solo refresh entre tres peticiones 401 simultáneas", async () => {
    let refreshes = 0;
    let rejected = 0;
    let releaseRequests: () => void = () => undefined;
    const requestsRejected = new Promise<void>((resolve) => {
      releaseRequests = resolve;
    });
    server.use(
      http.get(base + "/resource/:id", async ({ request }) => {
        if (request.headers.get("Authorization") === "Bearer new-token")
          return HttpResponse.json({ ok: true });
        rejected += 1;
        if (rejected === 3) releaseRequests();
        return unauthorized();
      }),
      http.post(base + "/auth/refresh", async () => {
        refreshes += 1;
        await requestsRejected;
        return HttpResponse.json({ accessToken: "new-token" });
      }),
    );
    const responses = await Promise.all(
      [1, 2, 3].map((id) => apiFetch("/resource/" + id)),
    );
    expect(responses).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(refreshes).toBe(1);
    expect(getAccessToken()).toBe("new-token");
  });
  it("reintenta una sola vez REFRESH_RACE después de 300 ms", async () => {
    let resumeRefresh: () => void = () => undefined;
    let markScheduled: () => void = () => undefined;
    const scheduled = new Promise<void>((resolve) => {
      markScheduled = resolve;
    });
    const originalSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(
      (callback, delay, ...args) => {
        if (delay === 300 && typeof callback === "function") {
          resumeRefresh = () => callback(...args);
          markScheduled();
          return 0 as unknown as ReturnType<typeof setTimeout>;
        }
        return originalSetTimeout(callback, delay, ...args);
      },
    );
    let refreshes = 0;
    let releaseRace: () => void = () => undefined;
    const raceReceived = new Promise<void>((resolve) => {
      releaseRace = resolve;
    });
    server.use(
      http.get(base + "/resource", ({ request }) =>
        request.headers.get("Authorization") === "Bearer renewed"
          ? HttpResponse.json({ ok: true })
          : unauthorized(),
      ),
      http.post(base + "/auth/refresh", () => {
        refreshes += 1;
        if (refreshes === 1) {
          releaseRace();
          return HttpResponse.json(
            { error: { code: "REFRESH_RACE", message: "Reintenta." } },
            { status: 409 },
          );
        }
        return HttpResponse.json({ accessToken: "renewed" });
      }),
    );
    const request = apiFetch("/resource");
    await raceReceived;
    await scheduled;
    expect(refreshes).toBe(1);
    resumeRefresh();
    await expect(request).resolves.toEqual({ ok: true });
    expect(refreshes).toBe(2);
  });
  it("emite session-expired y borra el token cuando falla el refresh", async () => {
    const expired = vi.fn();
    window.addEventListener("session-expired", expired, { once: true });
    server.use(
      http.get(base + "/resource", unauthorized),
      http.post(base + "/auth/refresh", unauthorized),
    );
    await expect(apiFetch("/resource")).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHORIZED",
    });
    expect(expired).toHaveBeenCalledOnce();
    expect(getAccessToken()).toBeNull();
  });
  it("no intenta refrescar credenciales inválidas en login", async () => {
    server.use(http.post(base + "/auth/login", unauthorized));
    await expect(
      apiFetch("/auth/login", { method: "POST", body: {} }),
    ).rejects.toBeInstanceOf(ApiError);
  });
  it("normaliza el error de API conservando details", async () => {
    server.use(
      http.get(base + "/resource", () =>
        HttpResponse.json(
          {
            error: {
              code: "CONFLICT",
              message: "La cédula ya existe.",
              details: { field: "cedula" },
            },
          },
          { status: 409 },
        ),
      ),
    );
    await expect(apiFetch("/resource")).rejects.toMatchObject({
      status: 409,
      code: "CONFLICT",
      message: "La cédula ya existe.",
      details: { field: "cedula" },
    });
  });
  it("normaliza fallos de red con un mensaje en español", async () => {
    server.use(http.get(base + "/resource", () => HttpResponse.error()));
    await expect(apiFetch("/resource")).rejects.toMatchObject({
      status: 0,
      code: "NETWORK",
      message: expect.stringContaining("conexión"),
    });
  });
  it("envía query tipada, cookies y multipart sin fijar Content-Type", async () => {
    server.use(
      http.post(base + "/resource", async ({ request }) => {
        expect(new URL(request.url).searchParams.get("archived")).toBe("false");
        expect(new URL(request.url).searchParams.has("empty")).toBe(false);
        expect(request.headers.get("Content-Type")).toContain(
          "multipart/form-data; boundary=",
        );
        expect((await request.formData()).get("name")).toBe("archivo");
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const formData = new FormData();
    formData.set("name", "archivo");
    await expect(
      apiFetch("/resource", {
        method: "POST",
        formData,
        query: { archived: false, empty: undefined },
      }),
    ).resolves.toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ credentials: "include" }),
    );
  });
  it("descarga el nombre UTF-8 desde Content-Disposition", async () => {
    server.use(
      http.get(
        base + "/export",
        () =>
          new HttpResponse("archivo", {
            headers: {
              "Content-Disposition":
                "attachment; filename*=UTF-8''contrato%20firmado.pdf",
            },
          }),
      ),
    );
    const result = await apiDownload("/export", { format: "pdf" });
    expect(result.filename).toBe("contrato firmado.pdf");
    expect(result.blob.size).toBe(7);
  });
  it("conserva AbortError sin convertirlo en NETWORK", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      apiFetch("/resource", { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
  it("no recupera la sesión si se cierra mientras llega el refresh", async () => {
    server.use(
      http.get(base + "/resource", unauthorized),
      http.post(base + "/auth/refresh", () => {
        updateSession("logout", undefined, false);
        return HttpResponse.json({ accessToken: "late-token" });
      }),
    );
    await expect(apiFetch("/resource")).rejects.toBeInstanceOf(ApiError);
    expect(getAccessToken()).toBeNull();
  });
});
