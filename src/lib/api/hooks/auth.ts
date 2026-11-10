import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch } from "../client";
import { keys } from "../keys";
import { updateSession } from "../session";
import type {
  AvailabilityQuery,
  AvailabilityResponse,
  LoginInput,
  LoginResponse,
  RegisterInput,
  RegisterResponse,
  MessageResponse,
  ResetPasswordInput,
} from "../types";
export async function login(input: LoginInput) {
  const response = await apiFetch<LoginResponse>("/auth/login", {
    method: "POST",
    body: input,
  });
  updateSession("login", response.accessToken);
  return response;
}
export async function logout(all = false) {
  try {
    await apiFetch<MessageResponse>(all ? "/auth/logout-all" : "/auth/logout", {
      method: "POST",
    });
  } finally {
    updateSession("logout");
  }
}
export function register(input: RegisterInput) {
  return apiFetch<RegisterResponse>("/auth/register", {
    method: "POST",
    body: input,
  });
}
export function useLogin() {
  return useMutation({ mutationFn: login });
}
export function useLogout() {
  return useMutation({ mutationFn: logout });
}
export function useRegister() {
  return useMutation({ mutationFn: register });
}
export function useAvailability(query: AvailabilityQuery) {
  return useQuery({
    queryKey: keys.availability({ ...query }),
    queryFn: ({ signal }) =>
      apiFetch<AvailabilityResponse>("/auth/availability", {
        query: { ...query },
        signal,
      }),
    enabled: Boolean(query.email || query.cedula),
    retry: false,
  });
}
export function useConfirmEmail() {
  return useMutation({
    mutationFn: (token: string) =>
      apiFetch<MessageResponse>("/auth/confirm-email", {
        method: "POST",
        body: { token },
      }),
  });
}
export function useResendConfirmation() {
  return useMutation({
    mutationFn: (email: string) =>
      apiFetch<MessageResponse>("/auth/resend-confirmation", {
        method: "POST",
        body: { email },
      }),
  });
}
export function useForgotPassword() {
  return useMutation({
    mutationFn: (email: string) =>
      apiFetch<MessageResponse>("/auth/forgot-password", {
        method: "POST",
        body: { email },
      }),
  });
}
export function useResetPassword() {
  return useMutation({
    mutationFn: (body: ResetPasswordInput) =>
      apiFetch<MessageResponse>("/auth/reset-password", {
        method: "POST",
        body,
      }),
  });
}
