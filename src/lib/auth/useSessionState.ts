import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiFetch, refreshSession } from "../api/client";
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
    } catch (error) {
      if (generation.current !== requestGeneration) return;
      // A temporary password blocks /me but the session is valid: keep it and let the guards
      // send the user to /auth/cambiar-clave instead of logging them out.
      if (error instanceof ApiError && error.code === "PASSWORD_CHANGE_REQUIRED") {
        setState((current) =>
          current.user
            ? { status: "authenticated", user: { ...current.user, mustChangePassword: true } }
            : current,
        );
        return;
      }
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
