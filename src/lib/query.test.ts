import { expect, it } from "vitest";
import { createQueryClient, shouldRetry } from "./query";
import { ApiError } from "./api/client";
import { updateSession } from "./api/session";
it("solo reintenta errores de red y 5xx hasta dos veces", () => {
  expect(shouldRetry(0, new ApiError(0, "NETWORK", "Sin conexión."))).toBe(
    true,
  );
  expect(
    shouldRetry(1, new ApiError(503, "INTERNAL", "Inténtalo de nuevo.")),
  ).toBe(true);
  expect(
    shouldRetry(2, new ApiError(503, "INTERNAL", "Inténtalo de nuevo.")),
  ).toBe(false);
  for (const status of [400, 401, 403, 404, 409, 429])
    expect(shouldRetry(0, new ApiError(status, "HTTP_ERROR", "Error."))).toBe(
      false,
    );
  expect(shouldRetry(0, new Error("Error de programación."))).toBe(false);
});
it("limpia caché de consultas y mutaciones al expirar o cambiar sesión", () => {
  const client = createQueryClient();
  client.setQueryData(["private"], { secret: "dato privado" });
  client.getMutationCache().build(client, {});
  updateSession("session-expired", undefined, false);
  expect(client.getQueryCache().getAll()).toHaveLength(0);
  expect(client.getMutationCache().getAll()).toHaveLength(0);
  client.setQueryData(["private"], {});
  updateSession("login", "new-user-token", false);
  expect(client.getQueryCache().getAll()).toHaveLength(0);
  client.disposeSessionListener();
});
