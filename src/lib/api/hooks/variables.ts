import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../client";
import { keys } from "../keys";
import { invalidateKeys } from "./cache";
import type { Variable, VariableInput, MessageResponse } from "../types";
export function useVariables() {
  return useQuery({
    queryKey: keys.variables,
    queryFn: ({ signal }) => apiFetch<Variable[]>("/variables", { signal }),
  });
}
function useVariableMutation<T>(
  mutationFn: (input: T) => Promise<Variable | MessageResponse>,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      invalidateKeys(client, [keys.variables, keys.templates.all]),
  });
}
export function useCreateVariable() {
  return useVariableMutation((body: VariableInput) =>
    apiFetch<Variable>("/variables", { method: "POST", body }),
  );
}
export function useUpdateVariable(id: string) {
  return useVariableMutation((body: Partial<VariableInput>) =>
    apiFetch<Variable>("/variables/" + id, { method: "PATCH", body }),
  );
}
export function useDeleteVariable(id: string) {
  return useVariableMutation(() =>
    apiFetch<MessageResponse>("/variables/" + id, { method: "DELETE" }),
  );
}
