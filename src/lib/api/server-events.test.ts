import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { apiFetch, refreshSession } from "./client";
import { connectServerEvents } from "./server-events";
import { keys } from "./keys";
import { updateSession } from "./session";
vi.mock("./client", async (importOriginal) => {
  const original = await importOriginal<typeof import("./client")>();
  return { ...original, apiFetch: vi.fn(), refreshSession: vi.fn() };
});
class FakeEventSource extends EventTarget {
  static instances: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string) {
    super();
    FakeEventSource.instances.push(this);
  }
  close() {
    this.closed = true;
  }
  emit(type: string, data: unknown) {
    this.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data) }));
  }
}
beforeEach(() => {
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.mocked(apiFetch).mockResolvedValue({ ticket: "one-use-ticket" });
  FakeEventSource.instances = [];
  updateSession("login", "access-token", false);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.clearAllMocks();
});
it("pide ticket sin exponer el JWT, actualiza caché y recarga el rol", async () => {
  const client = new QueryClient();
  client.setQueryData(keys.me, { role: "user" });
  client.setQueryData(keys.notifications.list({ unread: true }), {
    data: [],
    meta: { page: 1, pageSize: 20, total: 0 },
  });
  client.setQueryData(keys.notifications.list({ unread: false }), {
    data: [],
    meta: { page: 1, pageSize: 20, total: 0 },
  });
  const dispose = connectServerEvents(client);
  await Promise.resolve();
  const source = FakeEventSource.instances[0];
  expect(source.url).toBe("/api/v1/events?ticket=one-use-ticket");
  expect(source.url).not.toContain("access-token");
  source.emit("notification", { id: "notice-1", readAt: null });
  source.emit("unread-count", { count: 4 });
  expect(client.getQueryData(keys.notifications.unread)).toEqual({ count: 4 });
  expect(
    client.getQueryData(keys.notifications.list({ unread: true })),
  ).toMatchObject({ data: [{ id: "notice-1" }], meta: { total: 1 } });
  expect(
    client.getQueryData(keys.notifications.list({ unread: false })),
  ).toMatchObject({ data: [] });
  source.emit("role-changed", { role: "gestor" });
  expect(client.getQueryState(keys.me)?.isInvalidated).toBe(true);
  await Promise.resolve();
  await Promise.resolve();
  expect(refreshSession).toHaveBeenCalledOnce();
  dispose();
  expect(source.closed).toBe(true);
  client.clear();
});
it("reconecta con backoff y ticket nuevo y cancela al desmontar", async () => {
  vi.useFakeTimers();
  const client = new QueryClient();
  const dispose = connectServerEvents(client);
  await Promise.resolve();
  FakeEventSource.instances[0].onerror?.();
  expect(FakeEventSource.instances[0].closed).toBe(true);
  await vi.advanceTimersByTimeAsync(999);
  expect(FakeEventSource.instances).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(FakeEventSource.instances).toHaveLength(2);
  expect(apiFetch).toHaveBeenCalledTimes(2);
  FakeEventSource.instances[1].onerror?.();
  dispose();
  await vi.advanceTimersByTimeAsync(30_000);
  expect(FakeEventSource.instances).toHaveLength(2);
  client.clear();
});
it("no abre conexiones sin sesión y cierra al salir", async () => {
  updateSession("logout", undefined, false);
  const client = new QueryClient();
  const dispose = connectServerEvents(client);
  expect(apiFetch).not.toHaveBeenCalled();
  updateSession("login", "token", false);
  await Promise.resolve();
  expect(FakeEventSource.instances).toHaveLength(1);
  updateSession("logout", undefined, false);
  expect(FakeEventSource.instances[0].closed).toBe(true);
  dispose();
  client.clear();
});
