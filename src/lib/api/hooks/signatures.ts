import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDownload, apiFetch } from "../client";
import { keys } from "../keys";
import { invalidateContract } from "./cache";
import type {
  SignatureInboxItem,
  SignatureInput,
  ContractDetail,
  MessageResponse,
  Paginated,
} from "../types";
export function useSignatures(status: "pending" | "signed" = "pending", page = 1, pageSize = 20) {
  return useQuery({
    queryKey: [...keys.signatures.list(status), page, pageSize],
    queryFn: ({ signal }) =>
      apiFetch<Paginated<SignatureInboxItem>>("/me/signatures", {
        query: { status, page, pageSize },
        signal,
      }),
    placeholderData: keepPreviousData,
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
