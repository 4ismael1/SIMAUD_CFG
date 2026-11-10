import type { QueryClient } from "@tanstack/react-query";
import { apiFetch, apiUrl, refreshSession } from "./client";
import { keys } from "./keys";
import { getAccessToken, subscribeSession, type SessionEvent } from "./session";
import type { EventTicket, Notification, Paginated } from "./types";
function parseEvent(event: MessageEvent<string>): unknown {
  try {
    return JSON.parse(event.data) as unknown;
  } catch {
    return null;
  }
}
function receiveNotification(client: QueryClient, event: MessageEvent<string>) {
  const notification = parseEvent(event);
  if (
    notification &&
    typeof notification === "object" &&
    "id" in notification &&
    "readAt" in notification
  ) {
    for (const query of client
      .getQueryCache()
      .findAll({ queryKey: keys.notifications.lists })) {
      const filters = query.queryKey[2];
      const unread =
        filters && typeof filters === "object" && "unread" in filters
          ? filters.unread
          : undefined;
      if (unread === false && notification.readAt === null) continue;
      if (unread === true && notification.readAt !== null) continue;
      client.setQueryData<Paginated<Notification>>(
        query.queryKey,
        (previous) => {
          if (
            !previous ||
            previous.meta.page !== 1 ||
            previous.data.some((item) => item.id === notification.id)
          )
            return previous;
          return {
            data: [notification as Notification, ...previous.data].slice(
              0,
              previous.meta.pageSize,
            ),
            meta: { ...previous.meta, total: previous.meta.total + 1 },
          };
        },
      );
    }
  }
  void client.invalidateQueries({ queryKey: keys.notifications.all });
}
function receiveUnreadCount(client: QueryClient, event: MessageEvent<string>) {
  const payload = parseEvent(event);
  if (
    payload &&
    typeof payload === "object" &&
    "count" in payload &&
    typeof payload.count === "number"
  ) {
    client.setQueryData(keys.notifications.unread, { count: payload.count });
  } else {
    void client.invalidateQueries({ queryKey: keys.notifications.unread });
  }
}
class ServerEventConnection {
  private disposed = false;
  private source: EventSource | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private controller: AbortController | null = null;
  private failures = 0;
  private unsubscribe: () => void;
  constructor(private client: QueryClient) {
    this.unsubscribe = subscribeSession((event) => this.onSession(event));
    void this.open();
  }
  dispose() {
    this.disposed = true;
    this.stop();
    this.unsubscribe();
  }
  private stop() {
    this.source?.close();
    this.source = null;
    this.controller?.abort();
    this.controller = null;
    clearTimeout(this.timer);
    this.timer = undefined;
  }
  private onSession(event: SessionEvent) {
    if (event === "logout" || event === "session-expired") this.stop();
    else if (event === "login") {
      this.stop();
      void this.open();
    } else if (!this.source && !this.controller && !this.timer)
      void this.open();
  }
  private scheduleReconnect() {
    if (this.disposed || this.timer || !getAccessToken()) return;
    this.source?.close();
    this.source = null;
    this.controller = null;
    const delay = Math.min(1000 * 2 ** this.failures, 30_000);
    this.failures += 1;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.open();
    }, delay);
  }
  private async open() {
    if (this.disposed || !getAccessToken()) return;
    const controller = new AbortController();
    this.controller = controller;
    try {
      const { ticket } = await apiFetch<EventTicket>("/events/ticket", {
        method: "POST",
        signal: controller.signal,
      });
      if (this.disposed || controller.signal.aborted) return;
      // The API reads the one-time ticket from the `token` query parameter.
      this.source = new EventSource(apiUrl("/events", { token: ticket }), {
        withCredentials: true,
      });
      this.listen(this.source);
    } catch {
      // Cada reconexión solicita un ticket nuevo; los tickets anteriores son de un solo uso.
      if (!controller.signal.aborted && !this.disposed)
        this.scheduleReconnect();
    }
  }
  private listen(source: EventSource) {
    source.onopen = () => {
      this.failures = 0;
    };
    source.onerror = () => this.scheduleReconnect();
    source.addEventListener("notification", (event) =>
      receiveNotification(this.client, event as MessageEvent<string>),
    );
    source.addEventListener("unread-count", (event) =>
      receiveUnreadCount(this.client, event as MessageEvent<string>),
    );
    source.addEventListener("role-changed", () => {
      void this.reloadRole();
    });
  }
  private async reloadRole() {
    this.client.removeQueries({
      predicate: (query) => query.queryKey[0] !== "me",
    });
    await this.client.invalidateQueries({ queryKey: keys.me });
    try {
      await refreshSession();
    } catch {
      /* El cliente comunica session-expired si el cambio de rol revocó la sesión. */
    }
  }
}
export function connectServerEvents(client: QueryClient) {
  const connection = new ServerEventConnection(client);
  return () => connection.dispose();
}
