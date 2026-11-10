import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import { ButtonLink, EmptyState, Spinner } from '../ui';
import { useAuth } from '../lib/auth';
import type { Role } from '../lib/api/types';
import { homePathFor } from './navigation';

function FullPageSpinner() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <Spinner label="Verificando sesión" />
    </div>
  );
}

/** Only for signed-in users; others go to the login page and come back afterwards. */
export function ProtectedRoute() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'anonymous') {
    return <Navigate to="/auth/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <Outlet />;
}

/** Auth pages are pointless once signed in. */
export function PublicOnlyRoute() {
  const { status, user } = useAuth();
  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'authenticated' && user) return <Navigate to={homePathFor(user.role)} replace />;
  return <Outlet />;
}

/** Restricts a section to some roles. The API enforces the same rule; this only avoids showing a broken page. */
export function RoleRoute({ roles }: { roles: Role[] }) {
  const { hasRole } = useAuth();
  if (!hasRole(...roles)) return <Forbidden />;
  return <Outlet />;
}

/** /app shows the dashboard to staff; signers have no dashboard and land on their inbox. */
export function StaffHome({ dashboard }: { dashboard: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role === 'user') return <Navigate to={homePathFor(user.role)} replace />;
  return <>{dashboard}</>;
}

export function Forbidden() {
  return (
    <EmptyState
      icon={<ShieldOff />}
      title="No tienes acceso a esta sección"
      description="Si crees que deberías tenerlo, pide a un administrador que revise tu rol."
      action={<ButtonLink to="/app">Ir al inicio</ButtonLink>}
    />
  );
}
