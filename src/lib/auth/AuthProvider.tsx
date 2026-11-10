import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import {
  login as loginRequest,
  logout as logoutRequest,
  register as registerRequest,
} from "../api/hooks/auth";
import type {
  LoginInput,
  RegisterInput,
  RegisterResponse,
  Role,
} from "../api/types";
import { useSessionState, type AuthState } from "./useSessionState";
export type { AuthStatus } from "./useSessionState";
export interface AuthContextValue extends AuthState {
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  register: (input: RegisterInput) => Promise<RegisterResponse>;
  hasRole: (...roles: Role[]) => boolean;
}
const AuthContext = createContext<AuthContextValue | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const { status, user, setUser } = useSessionState();
  const login = useCallback(
    async (input: LoginInput) => {
      const response = await loginRequest(input);
      setUser(response.user);
    },
    [setUser],
  );
  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      setUser(null);
    }
  }, [setUser]);
  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      login,
      logout,
      register: registerRequest,
      hasRole: (...roles) => Boolean(user && roles.includes(user.role)),
    }),
    [status, user, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth debe usarse dentro de AuthProvider.");
  return context;
}
