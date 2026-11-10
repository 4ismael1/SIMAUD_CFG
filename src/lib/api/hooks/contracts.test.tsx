import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { createQueryClient } from "../../query";
import { keys } from "../keys";
import { useApproveContract } from "./contracts";
const server = setupServer(
  http.post("http://localhost:3000/api/v1/contracts/contract-1/approve", () =>
    HttpResponse.json({ id: "contract-1" }),
  ),
);
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
it("aprobar invalida detalle, listados, conteos, aprobaciones y dashboard sin invalidar usuarios ni otro detalle", async () => {
  const client = createQueryClient();
  const affected = [
    keys.contracts.detail("contract-1"),
    keys.contracts.list({}),
    keys.contracts.count(false),
    keys.approvals.list("pending"),
    keys.dashboard.detail(6),
  ];
  const unaffected = [keys.users.list({}), keys.contracts.detail("contract-2")];
  for (const key of [...affected, ...unaffected]) client.setQueryData(key, {});
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useApproveContract("contract-1"), { wrapper });
  await act(async () => {
    await hook.result.current.mutateAsync();
  });
  for (const key of affected)
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  for (const key of unaffected)
    expect(client.getQueryState(key)?.isInvalidated).toBe(false);
  hook.unmount();
  client.disposeSessionListener();
  client.clear();
});
