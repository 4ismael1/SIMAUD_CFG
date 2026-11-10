export type SessionEvent =
  "login" | "logout" | "token-renewed" | "session-expired";
interface SessionMessage {
  type: SessionEvent;
  token?: string;
}
let accessToken: string | null = null;
let sessionRevision = 0;
const listeners = new Set<(event: SessionEvent) => void>();
const channel =
  typeof BroadcastChannel === "undefined"
    ? null
    : new BroadcastChannel("simaud-auth");

export function getAccessToken() {
  return accessToken;
}
export function getSessionRevision() {
  return sessionRevision;
}
export function subscribeSession(listener: (event: SessionEvent) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function notifySession(type: SessionEvent) {
  for (const listener of listeners) listener(type);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(type));
}
export function updateSession(
  type: SessionEvent,
  token?: string,
  broadcast = true,
) {
  sessionRevision += 1;
  accessToken = token ?? null;
  notifySession(type);
  if (broadcast) channel?.postMessage({ type, token } satisfies SessionMessage);
}
if (channel) {
  channel.onmessage = (event: MessageEvent<unknown>) => {
    const message = event.data;
    if (!message || typeof message !== "object" || !("type" in message)) return;
    if (
      !["login", "logout", "token-renewed", "session-expired"].includes(
        String(message.type),
      )
    )
      return;
    const token =
      "token" in message && typeof message.token === "string"
        ? message.token
        : undefined;
    if (["login", "token-renewed"].includes(String(message.type)) && !token)
      return;
    updateSession(message.type as SessionEvent, token, false);
  };
}
