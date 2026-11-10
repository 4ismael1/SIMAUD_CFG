import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch } from "../client";
import { keys } from "../keys";
import { invalidateKeys } from "./cache";
import type {
  User,
  UserResponse,
  UserInput,
  UserPatch,
  UserQuery,
  UserLookup,
  Paginated,
  MessageResponse,
} from "../types";
export function useUsers(query: UserQuery = {}, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: keys.users.list({ ...query }),
    queryFn: ({ signal }) =>
      apiFetch<Paginated<User>>("/users", { query: { ...query }, signal }),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}
export function useUser(id: string) {
  return useQuery({
    queryKey: keys.users.detail(id),
    queryFn: ({ signal }) => apiFetch<User>("/users/" + id, { signal }),
    enabled: Boolean(id),
  });
}
export function useUserLookup(cedula: string) {
  return useQuery({
    queryKey: keys.users.lookup(cedula),
    queryFn: ({ signal }) =>
      apiFetch<UserLookup | null>("/users/lookup", {
        query: { cedula },
        signal,
      }),
    enabled: Boolean(cedula),
  });
}
export function useCreateUser() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: UserInput) =>
      apiFetch<UserResponse>("/users", { method: "POST", body }),
    onSuccess: () => invalidateKeys(client, [keys.users.all, keys.reports.all]),
  });
}
export function useUpdateUser(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: UserPatch) =>
      apiFetch<UserResponse>("/users/" + id, { method: "PATCH", body }),
    onSuccess: () =>
      invalidateKeys(client, [
        keys.users.all,
        keys.me,
        keys.dashboard.all,
        keys.reports.all,
      ]),
  });
}
export function useDeleteUser(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<MessageResponse>("/users/" + id, { method: "DELETE" }),
    onSuccess: () =>
      invalidateKeys(client, [
        keys.users.all,
        keys.reports.all,
        keys.dashboard.all,
      ]),
  });
}

/** Email the user a one-hour link to set a new password; their sessions are closed (T12b). */
export function useSendPasswordReset(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<MessageResponse>("/users/" + id + "/password-reset", { method: "POST" }),
    onSuccess: () => invalidateKeys(client, [keys.users.all]),
  });
}

/** Send a fresh invitation to an account that has not accepted it yet (409 once active). */
export function useResendInvite(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<MessageResponse>("/users/" + id + "/resend-invite", { method: "POST" }),
    onSuccess: () => invalidateKeys(client, [keys.users.all]),
  });
}
