import { useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { Alert, Button, ButtonLink, PageHeader, Segmented, Skeleton } from '../../ui';
import { useDashboard } from '../../lib/api/hooks/dashboard';
import { useAuth } from '../../lib/auth';
import { errorMessage } from '../../lib/errors';
import type { AdminDashboard, GestorDashboard, SupervisorDashboard } from '../../lib/api/dashboard-types';
import { AdminDashboardView } from './AdminDashboardView';
import { SupervisorDashboardView } from './SupervisorDashboardView';
import { GestorDashboardView } from './GestorDashboardView';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Buenos días';
  if (hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

export function DashboardPage() {
  const { user } = useAuth();
  const [months, setMonths] = useState<6 | 12>(6);
  const dashboard = useDashboard(months);

  if (!user) return null;
  const canCreate = user.role === 'admin' || user.role === 'gestor';

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${firstName(user.name)}`}
        description={new Date().toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        actions={
          <>
            {user.role === 'admin' && (
              <Segmented
                label="Periodo de los gráficos"
                value={String(months) as '6' | '12'}
                onChange={(value) => setMonths(value === '12' ? 12 : 6)}
                items={[
                  { value: '6', label: '6 meses' },
                  { value: '12', label: '12 meses' },
                ]}
              />
            )}
            {canCreate && (
              <ButtonLink to="/app/contratos/nuevo" variant="primary" icon={<Plus />}>
                Nuevo contrato
              </ButtonLink>
            )}
          </>
        }
      />

      {dashboard.isPending && <DashboardSkeleton />}
      {dashboard.isError && (
        <Alert
          tone="danger"
          title="No se pudo cargar el panel"
          action={
            <Button size="sm" icon={<RefreshCw />} onClick={() => dashboard.refetch()}>
              Reintentar
            </Button>
          }
        >
          {errorMessage(dashboard.error)}
        </Alert>
      )}
      {/* GET /dashboard answers with the shape of the caller's role (taken from the token). */}
      {dashboard.data && user.role === 'admin' && <AdminDashboardView data={dashboard.data as AdminDashboard} />}
      {dashboard.data && user.role === 'supervisor' && <SupervisorDashboardView data={dashboard.data as SupervisorDashboard} />}
      {dashboard.data && user.role === 'gestor' && <GestorDashboardView data={dashboard.data as GestorDashboard} />}
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((key) => (
          <Skeleton key={key} className="h-[118px] rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <Skeleton className="h-[300px] rounded-xl" />
        <Skeleton className="h-[300px] rounded-xl" />
      </div>
    </div>
  );
}
