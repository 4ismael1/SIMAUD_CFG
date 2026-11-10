import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { AuthProvider, useAuth } from "./AuthProvider";
import { updateSession } from "../api/session";
const base = "http://localhost:3000/api/v1";
const user = { id: "user-1", name: "Gestor", role: "gestor" };
const server = setupServer(
  http.post(base + "/auth/refresh", () =>
    HttpResponse.json({ accessToken: "restored" }),
  ),
  http.get(base + "/me", () => HttpResponse.json(user)),
);
const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => server.close());
afterEach(() => {
  cleanup();
  server.resetHandlers();
  updateSession("logout", undefined, false);
});
it("restaura cookie con refresh y me y calcula hasRole", async () => {
  updateSession("logout", undefined, false);
  const hook = renderHook(() => useAuth(), { wrapper });
  expect(hook.result.current.status).toBe("loading");
  await waitFor(() => expect(hook.result.current.status).toBe("authenticated"));
  expect(hook.result.current.user?.id).toBe("user-1");
  expect(hook.result.current.hasRole("admin", "gestor")).toBe(true);
  expect(hook.result.current.hasRole("admin")).toBe(false);
});
it("queda anónimo al arrancar sin cookie válida", async () => {
  updateSession("logout", undefined, false);
  server.use(
    http.post(base + "/auth/refresh", () =>
      HttpResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Inicia sesión." } },
        { status: 401 },
      ),
    ),
  );
  const hook = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(hook.result.current.status).toBe("anonymous"));
  expect(hook.result.current.user).toBeNull();
});
it("login y logout cambian estado y registro no inicia sesión", async () => {
  server.use(
    http.post(base + "/auth/login", () =>
      HttpResponse.json({ accessToken: "login-token", user }),
    ),
    http.post(base + "/auth/logout", () =>
      HttpResponse.json({ message: "Hasta pronto." }),
    ),
    http.post(base + "/auth/register", () =>
      HttpResponse.json({ user, message: "Confirma tu correo." }),
    ),
  );
  const hook = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(hook.result.current.status).toBe("authenticated"));
  await act(async () => {
    await hook.result.current.logout();
  });
  expect(hook.result.current.status).toBe("anonymous");
  await act(async () => {
    await hook.result.current.register({
      email: "nuevo@example.com",
      password: "Clave1234",
      name: "Nuevo",
      phone: "",
      cedula: "",
    });
  });
  expect(hook.result.current.status).toBe("anonymous");
  await act(async () => {
    await hook.result.current.login({
      email: "gestor@example.com",
      password: "Clave1234",
    });
  });
  expect(hook.result.current.status).toBe("authenticated");
});
