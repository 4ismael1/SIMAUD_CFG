import { useState, type FormEvent, type ReactNode } from 'react';
import { Building2, CalendarClock, Mail, Play, Timer } from 'lucide-react';
import { Alert, Badge, Button, Card, CardHeader, Field, Input, PageHeader, Skeleton, useAction } from '../../ui';
import { useJobs, useRunJob, useSendTestMail, useSettings, useUpdateSettings } from '../../lib/api/hooks/system';
import type { JobName, SystemSettings } from '../../lib/api/lifecycle-types';
import { useAuth } from '../../lib/auth';
import { errorMessage } from '../../lib/errors';
import { formatDateTime } from '../../lib/format';
import { validateEmail, validateRnc } from '../../lib/validation';

const JOB_INFO: Record<JobName, { label: string; description: string }> = {
  'contract-status': { label: 'Estados de vigencia', description: 'Marca contratos por vencer y vencidos (diario, 00:15).' },
  'expiry-notifications': { label: 'Avisos de vencimiento', description: 'Envía los avisos 30, 15, 7 y 1 día antes (diario, 08:00).' },
  cleanup: { label: 'Limpieza', description: 'Borra avisos leídos antiguos, tokens caducados y la papelera (semanal).' },
  'email-dispatch': { label: 'Envío de correos', description: 'Entrega la cola de correos con reintentos (cada minuto).' },
};

export function SettingsPage() {
  const settings = useSettings();

  return (
    <>
      <PageHeader title="Configuración" description="Ajustes generales de la institución y del sistema." />
      {settings.isError && <Alert tone="danger">{errorMessage(settings.error)}</Alert>}
      {settings.isPending ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : settings.data ? (
        <div className="stagger grid items-start gap-5 lg:grid-cols-2">
          <InstitutionSection settings={settings.data} />
          <ExpirySection settings={settings.data} />
          <JobsSection />
          <MailSection />
        </div>
      ) : null}
    </>
  );
}

function Section({ icon, title, description, children }: { icon: ReactNode; title: string; description?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <span className="text-vino-600 [&_svg]:size-4">{icon}</span>
            {title}
          </span>
        }
        description={description}
      />
      <div className="flex flex-col gap-4 p-5">{children}</div>
    </Card>
  );
}

function InstitutionSection({ settings }: { settings: SystemSettings }) {
  const update = useUpdateSettings();
  const { runAction } = useAction();
  const [form, setForm] = useState(settings.institution);
  const [rncError, setRncError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const rnc = form.rnc.trim() ? validateRnc(form.rnc) : null;
    setRncError(rnc && !rnc.ok ? rnc.message : null);
    if (rnc && !rnc.ok) return;
    await runAction({
      run: () => update.mutateAsync({ institution: { ...form, name: form.name.trim(), rnc: rnc?.ok ? rnc.value : '', address: form.address.trim() } }),
      success: 'Datos de la institución guardados.',
    });
  }

  return (
    <Section icon={<Building2 />} title="Institución" description="Aparecen en el PDF de cada contrato y en la constancia de firmas.">
      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        <Field label="Nombre">
          <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </Field>
        <Field label="RNC" optional error={rncError}>
          <Input className="font-mono" value={form.rnc} onChange={(event) => setForm({ ...form, rnc: event.target.value })} />
        </Field>
        <Field label="Dirección">
          <Input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
        </Field>
        <Button type="submit" variant="primary" loading={update.isPending} className="self-end">Guardar</Button>
      </form>
    </Section>
  );
}

function ExpirySection({ settings }: { settings: SystemSettings }) {
  const update = useUpdateSettings();
  const { runAction } = useAction();
  const [warningDays, setWarningDays] = useState(String(settings.expiryWarningDays));
  const [noticeDays, setNoticeDays] = useState(settings.expiryNotificationDays.join(', '));
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const warning = Number(warningDays);
    const notices = noticeDays
      .split(/[,\s]+/)
      .filter(Boolean)
      .map(Number);
    const valid = Number.isInteger(warning) && warning >= 1 && warning <= 365 && notices.length > 0 && notices.every((day) => Number.isInteger(day) && day >= 1 && day <= 365);
    setError(valid ? null : 'Usa números enteros entre 1 y 365.');
    if (!valid) return;
    const sorted = [...new Set(notices)].sort((a, b) => b - a);
    const result = await runAction({
      run: () => update.mutateAsync({ expiryWarningDays: warning, expiryNotificationDays: sorted }),
      success: 'Avisos de vencimiento actualizados.',
    });
    if (result.ok) setNoticeDays(sorted.join(', '));
  }

  return (
    <Section icon={<CalendarClock />} title="Vencimientos" description="Cuándo un contrato pasa a «por vencer» y cuándo se avisa.">
      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        <Field label="Días para marcar «por vencer»" error={error}>
          <Input type="number" min={1} max={365} className="tabular" value={warningDays} onChange={(event) => setWarningDays(event.target.value)} />
        </Field>
        <Field label="Días de aviso antes del vencimiento" hint="Separados por comas, p. ej. 30, 15, 7, 1">
          <Input className="tabular" value={noticeDays} onChange={(event) => setNoticeDays(event.target.value)} />
        </Field>
        <Button type="submit" variant="primary" loading={update.isPending} className="self-end">Guardar</Button>
      </form>
    </Section>
  );
}

function JobsSection() {
  const jobs = useJobs();
  const run = useRunJob();
  const { runAction } = useAction();

  return (
    <Section icon={<Timer />} title="Tareas automáticas" description="Se ejecutan solas; puedes lanzarlas a mano si hace falta.">
      {jobs.isPending ? (
        <Skeleton className="h-40" />
      ) : (
        <ul className="flex flex-col divide-y divide-slate-100">
          {(jobs.data ?? []).map((job) => {
            const info = JOB_INFO[job.name] ?? { label: job.name, description: '' };
            const last = job.lastRun;
            return (
              <li key={job.name} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{info.label}</p>
                  <p className="text-xs text-slate-500">{info.description}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {last ? (
                      <>
                        Última ejecución: {formatDateTime(last.startedAt)}{' '}
                        {last.ok === false ? <Badge tone="danger">Falló</Badge> : last.ok ? <Badge tone="success">Correcta</Badge> : <Badge tone="info">En curso</Badge>}
                      </>
                    ) : (
                      'Aún no se ha ejecutado.'
                    )}
                  </p>
                </div>
                <Button
                  size="sm"
                  icon={<Play />}
                  onClick={() =>
                    void runAction({
                      confirm: { title: `¿Ejecutar «${info.label}» ahora?`, description: info.description, confirmLabel: 'Ejecutar' },
                      run: () => run.mutateAsync(job.name),
                      pending: `Ejecutando «${info.label}»…`,
                      success: (result) => (result.skipped ? `«${info.label}» ya se estaba ejecutando.` : `«${info.label}» terminó correctamente.`),
                    })
                  }
                >
                  Ejecutar ahora
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

function MailSection() {
  const { user } = useAuth();
  const send = useSendTestMail();
  const { runAction } = useAction();
  const [to, setTo] = useState(user?.email ?? '');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const check = validateEmail(to);
    setError(check.ok ? null : check.message);
    if (!check.ok) return;
    await runAction({
      run: () => send.mutateAsync(check.value),
      success: `Correo de prueba en cola para ${check.value}. Debería llegar en un minuto.`,
    });
  }

  return (
    <Section icon={<Mail />} title="Correo" description="Comprueba que el proveedor de correo configurado entrega los mensajes.">
      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        <Field label="Enviar un correo de prueba a" error={error}>
          <Input type="email" value={to} onChange={(event) => setTo(event.target.value)} />
        </Field>
        <Button type="submit" loading={send.isPending} className="self-end" icon={<Mail />}>Enviar prueba</Button>
      </form>
    </Section>
  );
}
