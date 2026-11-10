import { updateSession } from "../session";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../client";
import { keys } from "../keys";
import type {
  User,
  UserResponse,
  ProfileInput,
  PasswordInput,
  EmailInput,
  MessageResponse,
  NotificationPreferences,
} from "../types";
export function useMe(enabled = true) {
  return useQuery({
    queryKey: keys.me,
    queryFn: ({ signal }) => apiFetch<User>("/me", { signal }),
    enabled,
  });
}
export function useUpdateMe() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<ProfileInput>) =>
      apiFetch<UserResponse>("/me", { method: "PATCH", body }),
    onSuccess: (response) => {
      client.setQueryData(keys.me, response.user);
    },
  });
}
export interface PasswordChangeResponse extends MessageResponse {
  /** The API revokes every other session and issues a new access token for this one. */
  accessToken: string;
}
/** Changing the password replaces the in-memory access token; the old one is rejected (401). */
export async function changePassword(body: PasswordInput) {
  const response = await apiFetch<PasswordChangeResponse>("/me/password", { method: "PATCH", body });
  updateSession("token-renewed", response.accessToken);
  return response;
}
export function useChangePassword() {
  return useMutation({ mutationFn: changePassword });
}
export function useChangeEmail() {
  return useMutation({
    mutationFn: (body: EmailInput) =>
      apiFetch<MessageResponse>("/me/email", { method: "PATCH", body }),
  });
}
export function useUploadAvatar() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (avatar: File) => {
      const formData = new FormData();
      formData.set("avatar", avatar);
      return apiFetch<UserResponse>("/me/avatar", { method: "PUT", formData });
    },
    onSuccess: (response) => {
      client.setQueryData(keys.me, response.user);
    },
  });
}
export function useDeleteAvatar() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<MessageResponse>("/me/avatar", { method: "DELETE" }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.me }),
  });
}
export function useNotificationPreferences() {
  return useQuery({
    queryKey: keys.preferences,
    queryFn: ({ signal }) =>
      apiFetch<NotificationPreferences>("/me/notification-preferences", {
        signal,
      }),
  });
}
export function useUpdateNotificationPreferences() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<NotificationPreferences>) =>
      apiFetch<NotificationPreferences>("/me/notification-preferences", {
        method: "PATCH",
        body,
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.preferences }),
  });
}
