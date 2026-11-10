import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, refreshSession } from "../api/client";
import {
  getAccessToken,
  subscribeSession,
  updateSession,
} from "../api/session";
import type { User } from "../api/types";
export type AuthStatus = "loading" | "authenticated" | "anonymous";
export interface AuthState {
  status: AuthStatus;
  user: User | null;
}
export function useSessionState() {
  const [state, setState] = useState<AuthState>({
    status: "loading",
    user: null,
  });
  const generation = useRef(0);
  const setUser = useCallback((user: User | null) => {
    generation.current += 1;
    setState({ status: user ? "authenticated" : "anonymous", user });
  }, []);
  const loadUser = useCallback(async () => {
    const requestGeneration = ++generation.current;
    try {
      const user = await apiFetch<User>("/me");
      if (generation.current === requestGeneration)
        setState({ status: "authenticated", user });
    } catch {
      if (generation.current === requestGeneration)
        updateSession("session-expired");
    }
  }, []);
  useRestoreSession(loadUser, setUser, generation);
  return { ...state, setUser };
}
function useRestoreSession(
  loadUser: () => Promise<void>,
  setUser: (user: User | null) => void,
  generation: { current: number },
) {
  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeSession((event) => {
      if (event === "logout" || event === "session-expired") setUser(null);
      else void loadUser();
    });
    async function restore() {
      try {
        if (getAccessToken()) await loadUser();
        else await refreshSession();
      } catch {
        // Un navegador sin cookie inicia como anónimo; el cliente ya comunica la expiración.
        if (active) setUser(null);
      }
    }
    void restore();
    return () => {
      active = false;
      generation.current += 1;
      unsubscribe();
    };
  }, [loadUser, setUser, generation]);
}
