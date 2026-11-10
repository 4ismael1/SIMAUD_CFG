import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { AuthProvider } from "./AuthProvider";
import { RequireAuth, RequireRole } from "./guards";
import { updateSession } from "../api/session";
const base = "http://localhost:3000/api/v1";
const server = setupServer(
  http.get(base + "/me", () =>
    HttpResponse.json({ id: "gestor", role: "gestor" }),
  ),
);
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => server.close());
afterEach(() => {
  cleanup();
  server.resetHandlers();
  updateSession("logout", undefined, false);
});
it("RequireAuth renderiza Outlet con React Router 7 al autenticarse", async () => {
  updateSession("login", "token", false);
  render(
    <AuthProvider>
      <MemoryRouter>
        <Routes>
          <Route element={<RequireAuth fallback="Cargando" />}>
            <Route path="/" element={<p>Contenido privado</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
  expect(await screen.findByText("Contenido privado")).toBeTruthy();
});
it("RequireRole permite los roles indicados y muestra fallback al resto", async () => {
  updateSession("login", "token", false);
  render(
    <AuthProvider>
      <RequireRole roles={["gestor"]} fallback="Esperando">
        <p>Permitido</p>
      </RequireRole>
      <RequireRole roles={["admin"]} fallback="Sin permiso">
        <p>Administración</p>
      </RequireRole>
    </AuthProvider>,
  );
  expect(await screen.findByText("Permitido")).toBeTruthy();
  expect(screen.getByText("Sin permiso")).toBeTruthy();
  expect(screen.queryByText("Administración")).toBeNull();
});
