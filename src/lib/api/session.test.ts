import { afterEach, beforeEach, expect, it, vi } from "vitest";
class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = [];
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  messages: unknown[] = [];
  constructor(public name: string) {
    FakeBroadcastChannel.instances.push(this);
  }
  postMessage(message: unknown) {
    this.messages.push(message);
  }
}
beforeEach(() => {
  vi.resetModules();
  FakeBroadcastChannel.instances = [];
  vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
});
afterEach(() => vi.unstubAllGlobals());
it("publica login, renovación y logout en simaud-auth sin persistir tokens", async () => {
  const storageSpy = vi.spyOn(Storage.prototype, "setItem");
  const session = await import("./session");
  session.updateSession("login", "login-token");
  session.updateSession("token-renewed", "renewed-token");
  session.updateSession("logout");
  const channel = FakeBroadcastChannel.instances[0];
  expect(channel.name).toBe("simaud-auth");
  expect(channel.messages).toEqual([
    { type: "login", token: "login-token" },
    { type: "token-renewed", token: "renewed-token" },
    { type: "logout", token: undefined },
  ]);
  expect(session.getAccessToken()).toBeNull();
  expect(storageSpy).not.toHaveBeenCalled();
});
it("aplica mensajes de otra pestaña sin volver a emitirlos e ignora mensajes inválidos", async () => {
  const session = await import("./session");
  const listener = vi.fn();
  const unsubscribe = session.subscribeSession(listener);
  const channel = FakeBroadcastChannel.instances[0];
  channel.onmessage?.(
    new MessageEvent("message", {
      data: { type: "login", token: "other-tab" },
    }),
  );
  expect(session.getAccessToken()).toBe("other-tab");
  channel.onmessage?.(
    new MessageEvent("message", {
      data: { type: "token-renewed", token: "new-other-tab" },
    }),
  );
  expect(session.getAccessToken()).toBe("new-other-tab");
  channel.onmessage?.(new MessageEvent("message", { data: { type: "login" } }));
  channel.onmessage?.(
    new MessageEvent("message", { data: { type: "unknown" } }),
  );
  expect(session.getAccessToken()).toBe("new-other-tab");
  channel.onmessage?.(
    new MessageEvent("message", { data: { type: "logout" } }),
  );
  expect(session.getAccessToken()).toBeNull();
  expect(listener.mock.calls.map((call) => call[0])).toEqual([
    "login",
    "token-renewed",
    "logout",
  ]);
  expect(channel.messages).toEqual([]);
  unsubscribe();
});
