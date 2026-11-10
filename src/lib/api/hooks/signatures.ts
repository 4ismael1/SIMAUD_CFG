import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDownload, apiFetch } from "../client";
import { keys } from "../keys";
import { invalidateContract } from "./cache";
import type {
  SignatureInboxItem,
  SignatureInput,
  ContractDetail,
  MessageResponse,
} from "../types";
export function useSignatures(status: "pending" | "signed" = "pending") {
  return useQuery({
    queryKey: keys.signatures.list(status),
    queryFn: ({ signal }) =>
      apiFetch<SignatureInboxItem[]>("/me/signatures", {
        query: { status },
        signal,
      }),
  });
}
export function useSignContract(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SignatureInput) => {
      const formData = new FormData();
      formData.set("signature", input.signature, "firma.png");
      formData.set("acceptedDeclaration", String(input.acceptedDeclaration));
      formData.set("viewedAt", input.viewedAt);
      return apiFetch<MessageResponse>("/contracts/" + id + "/sign", {
        method: "POST",
        formData,
      });
    },
    onSuccess: () => invalidateContract(client, id),
  });
}
export function useDeclineSignature(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) =>
      apiFetch<ContractDetail>("/contracts/" + id + "/decline", {
        method: "POST",
        body: { reason },
      }),
    onSuccess: () => invalidateContract(client, id),
  });
}
export function downloadSignature(fileId: string) {
  return apiDownload("/files/signatures/" + fileId);
}
