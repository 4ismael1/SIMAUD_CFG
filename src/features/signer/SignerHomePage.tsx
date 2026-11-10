import { Link } from 'react-router-dom';
import { ArrowRight, BookOpenCheck, CircleCheck, Clock, FileCheck2, PenLine, ShieldCheck } from 'lucide-react';
import { Alert, ButtonLink, Card, CardHeader, EmptyState, Kpi, PageHeader, Skeleton } from '../../ui';
import { useAuth } from '../../lib/auth';
import { errorMessage } from '../../lib/errors';
import { formatDate } from '../../lib/format';
import { StatusBadge } from '../contracts/components/ContractBits';
import { useMyContracts } from './useMyContracts';

/** /app for a signer: what needs their signature now, what is waiting on others, and their contracts. */
export function SignerHomePage() {
  const { user } = useAuth();
  const { groups, isPending, error } = useMyContracts();
  const firstName = user?.name.split(' ')[0] ?? '';

  return (
    <>
      <PageHeader
        title={firstName ? `Hola, ${firstName}` : 'Inicio'}
        description={
          groups.turn.length > 0
            ? `Tienes ${groups.turn.length} ${groups.turn.length === 1 ? 'contrato esperando tu firma' : 'contratos esperando tu firma'}.`
            : 'No tienes firmas pendientes ahora mismo.'
        }
      />
      {error && <Alert tone="danger">{errorMessage(error)}</Alert>}

      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi label="Es tu turno" icon={<PenLine />} value={isPending ? '…' : String(groups.turn.length)} emphasis={groups.turn.length > 0 ? 'warning' : undefined} />
        <Kpi label="Esperando a otras partes" icon={<Clock />} value={isPending ? '…' : String(groups.waiting.length)} />
        <Kpi label="Contratos vigentes" icon={<FileCheck2 />} value={isPending ? '…' : String(groups.active.length)} />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardHeader
              title="Pendiente de tu firma"
              description="Léelo con calma: firmar tiene la misma validez que tu firma en papel."
              action={groups.turn.length > 0 ? <ButtonLink to="/app/firmas" variant="ghost" size="sm">Ver todos</ButtonLink> : undefined}
            />
            {isPending ? (
              <div className="flex flex-col gap-2 px-5 pb-5">
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
              </div>
            ) : groups.turn.length === 0 ? (
              <EmptyState icon={<CircleCheck />} title="Estás al día" description="Te avisaremos cuando un contrato necesite tu firma." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {groups.turn.slice(0, 5).map((row) => (
                  <li key={row.id} className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                    <span className="min-w-0">
                      <Link to={`/app/contratos/${row.id}`} className="block truncate font-medium text-slate-900 hover:text-vino-700">
                        {row.title}
                      </Link>
                      <span className="font-mono text-xs text-slate-500">{row.code}</span>
                    </span>
                    <ButtonLink to={`/app/contratos/${row.id}/firmar`} viewTransition variant="primary" size="sm" icon={<PenLine />}>
                      Revisar y firmar
                    </ButtonLink>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Tus contratos recientes"
              action={<ButtonLink to="/app/mis-contratos" variant="ghost" size="sm">Mis contratos <ArrowRight className="size-4" /></ButtonLink>}
            />
            {isPending ? (
              <div className="px-5 pb-5"><Skeleton className="h-24" /></div>
            ) : [...groups.waiting, ...groups.active, ...groups.finished].length === 0 ? (
              <EmptyState icon={<FileCheck2 />} title="Aún no participas en ningún contrato" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {[...groups.waiting, ...groups.active, ...groups.finished].slice(0, 5).map((row) => (
                  <li key={row.id}>
                    <Link to={`/app/contratos/${row.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-slate-900">{row.title}</span>
                        <span className="text-xs text-slate-500">
                          {row.endDate ? `Vigente hasta ${formatDate(row.endDate)}` : row.code}
                        </span>
                      </span>
                      <StatusBadge status={row.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <aside className="flex flex-col gap-4">
          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <BookOpenCheck className="size-4 text-vino-600" /> Cómo se firma
            </h2>
            <ol className="mt-3 flex flex-col gap-2.5 text-[13px] text-slate-600">
              <li><b className="text-slate-800">1. Lee el documento completo.</b> Es la versión exacta que quedará firmada.</li>
              <li><b className="text-slate-800">2. Acepta la declaración</b> y firma: dibujando, escribiendo tu nombre o subiendo una imagen.</li>
              <li><b className="text-slate-800">3. Listo.</b> Cuando firmen todas las partes recibirás el PDF final con su constancia.</li>
            </ol>
          </Card>
          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <ShieldCheck className="size-4 text-emerald-600" /> ¿Te enviaron un contrato?
            </h2>
            <p className="mt-2 text-[13px] text-slate-600">Comprueba si es auténtico y no ha sido modificado con el código de su constancia.</p>
            <ButtonLink to="/verificar" viewTransition size="sm" className="mt-3">Verificar un contrato</ButtonLink>
          </Card>
        </aside>
      </div>
    </>
  );
}
