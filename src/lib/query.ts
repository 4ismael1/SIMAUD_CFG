import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api/client";
import { subscribeSession } from "./api/session";
export function shouldRetry(failureCount: number, error: Error) {
  return (
    failureCount < 2 &&
    error instanceof ApiError &&
    (error.code === "NETWORK" || error.status >= 500)
  );
}
export function createQueryClient() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: shouldRetry },
      mutations: { retry: false },
    },
  });
  const disposeSessionListener = subscribeSession((event) => {
    if (event === "session-expired" || event === "logout" || event === "login")
      client.clear();
  });
  return Object.assign(client, { disposeSessionListener });
}
