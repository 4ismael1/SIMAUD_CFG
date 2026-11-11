import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Check, Ellipsis, RefreshCw, Undo2, X } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  DataTable,
  Dialog,
  EmptyState,
  Field,
  IconButton,
  Input,
  Menu,
  PageHeader,
  Pagination,
  Select,
  Tabs,
  Textarea,
  useAction,
  type Column,
  type MenuItem,
  type Tone,
  revealFirstError,
} from '../../ui';
import { useApproveRenewal, useCancelRenewal, useCreateRenewal, useEligibleRenewals, useRejectRenewal, useRenewals } from '../../lib/api/hooks/renewals';
import type { Priority, RenewalListItem, RenewalStatus } from '../../lib/api/lifecycle-types';
import { useAuth } from '../../lib/auth';
import { formatDate, formatMoney } from '../../lib/format';
import { validateDateRange, validateIsoDate, validateMoney } from '../../lib/validation';
import { daysLabel } from '../contracts/components/ContractBits';

const PAGE_SIZE = 20;
const PRIORITY: Record<Priority, { label: string; tone: Tone }> = {
  urgent: { label: 'Urgente', tone: 'danger' },
  high: { label: 'Alta', tone: 'warning' },
  medium: { label: 'Media', tone: 'info' },
  low: { label: 'Baja', tone: 'neutral' },
};
const STATUS_TABS: { value: RenewalStatus; label: string }[] = [
  { value: 'pending', label: 'Pendientes' },
  { value: 'approved', label: 'Aprobadas' },
  { value: 'rejected', label: 'Rechazadas' },
  { value: 'cancelled', label: 'Canceladas' },
];

export function RenewalsPage() {
  const [status, setStatus] = useState<RenewalStatus>('pending');
  const [priority, setPriority] = useState<Priority | ''>('');
  const [page, setPage] = useState(1);
  const [requesting, setRequesting] = useState(false);
  const renewals = useRenewals({ status, priority: priority || undefined, page, pageSize: PAGE_SIZE });

  const columns: Column<RenewalListItem>[] = [
    {
      key: 'contract',
      header: 'Contrato',
      cell: (row) => (
        <span className="min-w-0">
          <Link to={`/app/contratos/${row.originalContractId}`} className="block truncate font-medium hover:text-vino-700">{row.contract.title}</Link>
          <span className="block text-xs text-slate-500"><span className="font-mono">{row.contract.code}</span> · {row.requester?.name ?? '—'}</span>
        </span>
      ),
    },
    { key: 'priority', header: 'Prioridad', cell: (row) => <Badge tone={PRIORITY[row.priority].tone}>{PRIORITY[row.priority].label}</Badge> },
    {
      key: 'expiry',
      header: 'Vence',
      hideOnMobile: true,
      cell: (row) => (row.daysToExpiry === null ? '—' : row.daysToExpiry < 0 ? <span className="text-red-600">Vencido</span> : daysLabel(row.daysToExpiry)),
    },
    {
      key: 'value',
      header: 'Valor propuesto',
      align: 'right',
      cell: (row) => (
        <span className="tabular">
          {row.proposedValue ? formatMoney(row.proposedValue) : '—'}
          {row.variationPercent && (
            <span className={Number(row.variationPercent) > 0 ? 'block text-xs text-amber-700' : 'block text-xs text-green-700'}>
              {Number(row.variationPercent) > 0 ? '+' : ''}
              {row.variationPercent}%
            </span>
          )}
        </span>
      ),
    },
    { key: 'period', header: 'Nueva vigencia', hideOnMobile: true, cell: (row) => (row.proposedStartDate && row.proposedEndDate ? `${formatDate(row.proposedStartDate)} → ${formatDate(row.proposedEndDate)}` : '—') },
    { key: 'actions', header: <span className="sr-only">Acciones</span>, align: 'right', cell: (row) => <RenewalActions row={row} /> },
  ];

  return (
    <>
      <PageHeader
        title="Renovaciones"
        description="Solicitudes para prorrogar contratos, ordenadas por urgencia."
        actions={<Button variant="primary" icon={<RefreshCw />} onClick={() => setRequesting(true)}>Solicitar renovación</Button>}
      />
      <Tabs label="Estado de las renovaciones" value={status} onChange={(value) => { setStatus(value); setPage(1); }} items={STATUS_TABS} />
      <Select value={priority} onChange={(event) => { setPriority(event.target.value as Priority | ''); setPage(1); }} className="sm:w-56" aria-label="Filtrar por prioridad">
        <option value="">Todas las prioridades</option>
        {(Object.keys(PRIORITY) as Priority[]).map((value) => <option key={value} value={value}>{PRIORITY[value].label}</option>)}
      </Select>
      <Card>
        <DataTable
          caption="Renovaciones"
          columns={columns}
          rows={renewals.data?.data}
          rowKey={(row) => row.id}
          loading={renewals.isPending}
          empty={<EmptyState icon={<RefreshCw />} title="Sin solicitudes" description="No hay renovaciones en esta lista." />}
          footer={renewals.data && renewals.data.meta.total > PAGE_SIZE ? <Pagination page={page} pageSize={PAGE_SIZE} total={renewals.data.meta.total} onPageChange={setPage} /> : undefined}
        />
      </Card>
      <RequestRenewalDialog open={requesting} onClose={() => setRequesting(false)} />
    </>
  );
}

function RenewalActions({ row }: { row: RenewalListItem }) {
  const { user, hasRole } = useAuth();
  const { runAction } = useAction();
  const approve = useApproveRenewal(row.id);
  const reject = useRejectRenewal(row.id);
  const cancel = useCancelRenewal(row.id);
  if (row.status !== 'pending') {
    return row.newContractId ? <Link to={`/app/contratos/${row.newContractId}`} className="text-sm font-medium text-vino-600">Ver contrato nuevo</Link> : null;
  }
  // The API is the authority; these checks only hide options that would be refused.
  const canProcess = hasRole('admin', 'supervisor') || row.contract.creator?.id === user?.id;
  const isRequester = row.requestedBy === user?.id;

  const items: MenuItem[] = [];
  if (canProcess) {
    items.push(
      {
        label: 'Aprobar',
        icon: <Check />,
        onSelect: () =>
          void runAction({
            confirm: {
              title: `¿Aprobar la renovación de «${row.contract.title}»?`,
              description: 'Se creará un borrador con las nuevas fechas y valor, que seguirá el flujo normal de aprobación y firmas.',
              confirmLabel: 'Aprobar renovación',
            },
            run: () => approve.mutateAsync(undefined),
            success: 'Renovación aprobada. Se creó el borrador del contrato nuevo.',
          }),
      },
      {
        label: 'Rechazar',
        icon: <X />,
        danger: true,
        onSelect: () =>
          void runAction({
            confirm: { title: 'Rechazar renovación', description: 'Quien la pidió verá tu respuesta.', confirmLabel: 'Rechazar', reasonLabel: 'Motivo del rechazo' },
            run: (reason) => reject.mutateAsync({ response: reason ?? '' }),
            success: 'Renovación rechazada.',
          }),
      },
    );
  }
  if (isRequester) {
    items.push({
      label: 'Cancelar solicitud',
      icon: <Undo2 />,
      separatorBefore: items.length > 0,
      onSelect: () =>
        void runAction({
          confirm: { title: '¿Cancelar tu solicitud de renovación?', confirmLabel: 'Cancelar solicitud' },
          run: () => cancel.mutateAsync(undefined),
          success: 'Solicitud cancelada.',
        }),
    });
  }
  if (items.length === 0) return null;
  return <Menu items={items} trigger={(props) => <IconButton size="sm" label={`Acciones de ${row.contract.title}`} {...props}><Ellipsis /></IconButton>} />;
}

function RequestRenewalDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const eligible = useEligibleRenewals();
  const create = useCreateRenewal();
  const { runAction, running } = useAction();
  const [form, setForm] = useState({ contractId: '', start: '', end: '', value: '', reason: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const contract = eligible.data?.find((item) => item.id === form.contractId);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!form.contractId) next.contractId = 'Elige un contrato.';
    if (!validateIsoDate(form.start).ok) next.start = 'Indica el inicio.';
    if (!validateIsoDate(form.end).ok) next.end = 'Indica el fin.';
    else if (validateIsoDate(form.start).ok) {
      const range = validateDateRange(form.start, form.end);
      if (!range.ok) next.end = range.message;
    }
    const money = validateMoney(form.value);
    if (!money.ok) next.value = money.message;
    if (form.reason.trim().length < 5) next.reason = 'Explica brevemente el motivo.';
    setErrors(next);
    if (Object.keys(next).length > 0 || !money.ok) {
      revealFirstError();
      return;
    }
    const result = await runAction({
      run: () => create.mutateAsync({ contractId: form.contractId, proposedStartDate: form.start, proposedEndDate: form.end, proposedValue: money.value, reason: form.reason.trim() }),
      success: 'Solicitud de renovación enviada.',
    });
    if (result.ok) {
      setForm({ contractId: '', start: '', end: '', value: '', reason: '' });
      onClose();
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      variant="drawer"
      title="Solicitar renovación"
      description="Propón nuevas fechas y valor. Lo revisará el responsable del contrato."
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="renewal-form" loading={running}>Enviar solicitud</Button>
        </>
      }
    >
      <form id="renewal-form" className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        <Field label="Contrato" error={errors.contractId} hint={eligible.data?.length === 0 ? 'No tienes contratos que se puedan renovar ahora.' : undefined}>
          <Select
            value={form.contractId}
            onChange={(event) => {
              const picked = eligible.data?.find((item) => item.id === event.target.value);
              setForm({ ...form, contractId: event.target.value, value: picked?.contractValue ?? form.value });
            }}
          >
            <option value="">Elige un contrato…</option>
            {(eligible.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.code} · {item.title}</option>)}
          </Select>
        </Field>
        {contract && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Vigencia actual: {contract.startDate ? formatDate(contract.startDate) : '—'} → {contract.endDate ? formatDate(contract.endDate) : '—'} ·{' '}
            {contract.contractValue ? formatMoney(contract.contractValue) : 'sin valor'}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nuevo inicio" error={errors.start}>
            <Input type="date" value={form.start} onChange={(event) => setForm({ ...form, start: event.target.value })} />
          </Field>
          <Field label="Nuevo fin" error={errors.end}>
            <Input type="date" min={form.start || undefined} value={form.end} onChange={(event) => setForm({ ...form, end: event.target.value })} />
          </Field>
        </div>
        <Field label="Valor propuesto (RD$)" error={errors.value}>
          <Input inputMode="decimal" className="tabular" value={form.value} onChange={(event) => setForm({ ...form, value: event.target.value })} />
        </Field>
        <Field label="Motivo" error={errors.reason}>
          <Textarea value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} maxLength={1000} />
        </Field>
      </form>
    </Dialog>
  );
}
