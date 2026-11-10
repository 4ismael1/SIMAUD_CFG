import { useEffect } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch } from "../client";
import { keys } from "../keys";
import { connectServerEvents } from "../server-events";
import type {
  Notification,
  PageQuery,
  Paginated,
  MessageResponse,
} from "../types";
export interface NotificationQuery extends PageQuery {
  unread?: boolean;
}
export function useNotifications(query: NotificationQuery = {}) {
  return useQuery({
    queryKey: keys.notifications.list({ ...query }),
    queryFn: ({ signal }) =>
      apiFetch<Paginated<Notification>>("/notifications", {
        query: { ...query },
        signal,
      }),
    placeholderData: keepPreviousData,
  });
}
export function useUnreadCount() {
  return useQuery({
    queryKey: keys.notifications.unread,
    queryFn: ({ signal }) =>
      apiFetch<{ count: number }>("/notifications/unread-count", { signal }),
  });
}
function useNotificationMutation<T>(
  mutationFn: (input: T) => Promise<unknown>,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      client.invalidateQueries({ queryKey: keys.notifications.all }),
  });
}
export function useReadNotification() {
  return useNotificationMutation((id: string) =>
    apiFetch<MessageResponse>("/notifications/" + id + "/read", {
      method: "POST",
    }),
  );
}
export function useReadAllNotifications() {
  return useNotificationMutation(() =>
    apiFetch<MessageResponse>("/notifications/read-all", { method: "POST" }),
  );
}
export function useDeleteNotification() {
  return useNotificationMutation((id: string) =>
    apiFetch<MessageResponse>("/notifications/" + id, { method: "DELETE" }),
  );
}
export function useServerEvents(enabled = true) {
  const client = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    return connectServerEvents(client);
  }, [client, enabled]);
}
