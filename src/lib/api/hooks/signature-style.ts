import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch } from "../client";
import { keys } from "../keys";

/** The typed-signature style a user chose to reuse: only typed signatures are remembered, never drawn or uploaded images. */
export interface SignatureStylePreference {
  text: string;
  fontId: string;
}

export function useSignatureStyle() {
  return useQuery({
    queryKey: keys.signatureStyle,
    queryFn: async ({ signal }) => {
      try {
        return await apiFetch<SignatureStylePreference | null>("/me/signature-style", { signal });
      } catch (error) {
        // No preference saved yet (or the endpoint is not deployed): start from the defaults.
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    staleTime: Infinity,
    retry: false,
  });
}

export function useSaveSignatureStyle() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: SignatureStylePreference) =>
      apiFetch<SignatureStylePreference>("/me/signature-style", { method: "PUT", body }),
    onSuccess: (saved) => client.setQueryData(keys.signatureStyle, saved),
  });
}

export function useDeleteSignatureStyle() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>("/me/signature-style", { method: "DELETE" }),
    onSuccess: () => client.setQueryData(keys.signatureStyle, null),
  });
}
