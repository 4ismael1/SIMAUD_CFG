import type { ReactNode } from "react";
import { Outlet } from "react-router-dom";
import type { Role } from "../api/types";
import { useAuth } from "./AuthProvider";
interface GuardProps {
  children?: ReactNode;
  fallback?: ReactNode;
}
export function RequireAuth({ children, fallback = null }: GuardProps) {
  const { status } = useAuth();
  if (status !== "authenticated") return fallback;
  return children === undefined ? <Outlet /> : children;
}
export function RequireRole({
  roles,
  children,
  fallback = null,
}: GuardProps & { roles: Role[] }) {
  const { status, hasRole } = useAuth();
  if (status !== "authenticated" || !hasRole(...roles)) return fallback;
  return children === undefined ? <Outlet /> : children;
}
