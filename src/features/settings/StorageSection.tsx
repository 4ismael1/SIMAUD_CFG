import { useState, type FormEvent } from 'react';
import { ArrowRightLeft, CircleCheck, CircleX, Cloud, HardDrive, PlugZap } from 'lucide-react';
import { Alert, Badge, Button, Card, CardHeader, Field, Input, Segmented, Skeleton, Spinner, useAction } from '../../ui';
import { useMigrateStorage, useStorageSettings, useTestStorage, useUpdateStorage } from '../../lib/api/hooks/storage';
import type { StorageInput, StorageSettings, StorageTestResult, StorageView } from '../../lib/api/types';
import { errorMessage } from '../../lib/errors';

type Driver = StorageView['driver'];

interface S3Form {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix: string;
  forcePathStyle: boolean;
}

const STEP_LABELS: Record<string, string> = { put: 'Escribir', get: 'Leer', compare: 'Verificar contenido', immutability: 'Impedir sobrescritura', delete: 'Limpiar' };

function describe(view: StorageView): string {
  return view.driver === 'disk' ? 'Disco del servidor' : `${view.bucket} · ${new URL(view.endpoint).host}`;
}

function initialForm(settings: StorageSettings): S3Form {
  const source = settings.pending?.driver === 's3' ? settings.pending : settings.driver === 's3' ? settings : null;
  return {
    endpoint: source?.endpoint ?? '',
    region: source?.region ?? '',
    bucket: source?.bucket ?? '',
    accessKeyId: '',
    secretAccessKey: '',
    prefix: source?.prefix ?? '',
    forcePathStyle: source?.forcePathStyle ?? false,
  };
}

function toInput(driver: Driver, form: S3Form): StorageInput {
  if (driver === 'disk') return { driver: 'disk' };
  return {
    driver: 's3',
    endpoint: form.endpoint.trim(),
    region: form.region.trim(),
    bucket: form.bucket.trim(),
    accessKeyId: form.accessKeyId.trim(),
    secretAccessKey: form.secretAccessKey || undefined,
    prefix: form.prefix.trim(),
    forcePathStyle: form.forcePathStyle,
  };
}

function TestResult({ result }: { result: StorageTestResult }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
      <p className="flex items-center justify-between gap-3 text-[13px] font-medium text-slate-900">
        {result.ok ? 'La prueba pasó' : 'La prueba falló'}
        <span className="tabular text-xs font-normal text-slate-500">{result.latencyMs} ms</span>
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {result.steps.map((step) => (
          <li key={step.name} className="flex items-start gap-2 text-[13px] text-slate-700">
            {step.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-green-700" aria-hidden="true" /> : <CircleX className="mt-0.5 size-4 shrink-0 text-red-600" aria-hidden="true" />}
            <span>
              <b className="font-medium">{STEP_LABELS[step.name] ?? step.name}.</b> {step.message}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MigrationNotice({ settings }: { settings: StorageSettings }) {
  const migrate = useMigrateStorage();
  const { runAction } = useAction();
  if (settings.migrating) {
    return (
      <Alert tone="info" title="Migración en curso">
        <span className="flex items-center gap-2">
          <Spinner className="size-4" label="Migrando" /> Se están copiando los archivos al nuevo destino. Puedes seguir trabajando.
        </span>
      </Alert>
    );
  }
  if (!settings.pending) return null;
  const target = describe(settings.pending);

  return (
    <Alert
      tone="warning"
      title="Hay un destino guardado pendiente de migrar"
      action={
        <Button
          size="sm"
          icon={<ArrowRightLeft />}
          loading={migrate.isPending}
          onClick={() =>
            void runAction({
              confirm: {
                title: '¿Migrar los archivos ahora?',
                description: `Se copiarán todas las firmas y documentos a «${target}» y se verificará cada copia. Al terminar, ese destino pasa a ser el activo. Los originales no se borran.`,
                confirmLabel: 'Migrar archivos',
              },
              run: () => migrate.mutateAsync(),
              success: 'Se inició la migración. Verás el resultado en «Tareas automáticas».',
            })
          }
        >
          Migrar ahora
        </Button>
      }
    >
      Los archivos siguen en «{describe(settings)}» hasta que se migren a «{target}».
    </Alert>
  );
}

function S3Fields({ form, onChange, current }: { form: S3Form; onChange: (patch: Partial<S3Form>) => void; current: StorageView | null }) {
  const stored = current?.driver === 's3' ? current : null;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Endpoint" hint="HTTPS, sin ruta. Ej.: https://s3.us-east-1.amazonaws.com" className="sm:col-span-2" required>
        <Input type="url" className="font-mono" value={form.endpoint} onChange={(event) => onChange({ endpoint: event.target.value })} />
      </Field>
      <Field label="Región" required>
        <Input className="font-mono" value={form.region} onChange={(event) => onChange({ region: event.target.value })} />
      </Field>
      <Field label="Bucket" required>
        <Input className="font-mono" value={form.bucket} onChange={(event) => onChange({ bucket: event.target.value })} />
      </Field>
      <Field label="Identificador de acceso" hint={stored ? `El guardado termina en ${stored.accessKeyLast4}. Vuelve a escribirlo para guardar.` : undefined} required>
        <Input className="font-mono" autoComplete="off" value={form.accessKeyId} onChange={(event) => onChange({ accessKeyId: event.target.value })} />
      </Field>
      <Field label="Clave secreta" hint={stored?.hasSecret ? 'Déjala vacía para conservar la guardada.' : 'Se guarda cifrada y nunca se vuelve a mostrar.'} required={!stored?.hasSecret}>
        <Input type="password" autoComplete="new-password" value={form.secretAccessKey} onChange={(event) => onChange({ secretAccessKey: event.target.value })} />
      </Field>
      <Field label="Prefijo" optional hint="Carpeta dentro del bucket.">
        <Input className="font-mono" value={form.prefix} onChange={(event) => onChange({ prefix: event.target.value })} />
      </Field>
      <label className="flex items-center gap-2.5 self-end pb-2 text-[13.5px] text-slate-700">
        <input type="checkbox" className="size-4 rounded border-slate-300 accent-vino-600" checked={form.forcePathStyle} onChange={(event) => onChange({ forcePathStyle: event.target.checked })} />
        Direcciones con ruta (MinIO y similares)
      </label>
    </div>
  );
}

function StorageForm({ settings }: { settings: StorageSettings }) {
  const test = useTestStorage();
  const update = useUpdateStorage();
  const { runAction } = useAction();
  const [driver, setDriver] = useState<Driver>(settings.pending?.driver ?? settings.driver);
  const [form, setForm] = useState<S3Form>(() => initialForm(settings));
  const [result, setResult] = useState<StorageTestResult | null>(null);
  const locked = settings.migrating;
  const incomplete = driver === 's3' && !(form.endpoint.trim() && form.region.trim() && form.bucket.trim() && form.accessKeyId.trim());

  function patch(changes: Partial<S3Form>) {
    setForm({ ...form, ...changes });
    setResult(null);
  }

  async function runTest() {
    const outcome = await runAction({
      run: () => test.mutateAsync(toInput(driver, form)),
      pending: 'Probando el almacenamiento…',
      success: (value) => (value.ok ? `La conexión funciona (${value.latencyMs} ms).` : 'La prueba terminó con fallos. Revisa el detalle.'),
    });
    if (outcome.ok) setResult(outcome.value);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const changesPlace = driver !== settings.driver || driver === 's3';
    await runAction({
      confirm: changesPlace
        ? {
            title: '¿Guardar este destino de almacenamiento?',
            description: 'Primero se prueba la conexión. Si ya hay archivos guardados, el destino queda pendiente hasta que los migres; nada se borra.',
            confirmLabel: 'Guardar destino',
          }
        : undefined,
      run: () => update.mutateAsync(toInput(driver, form)),
      pending: 'Probando y guardando…',
      success: (value) => (value.pending ? 'Se guardó el destino. Falta migrar los archivos.' : 'Se guardó el almacenamiento.'),
    });
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <Segmented
        label="Tipo de almacenamiento"
        value={driver}
        onChange={(value) => {
          setDriver(value);
          setResult(null);
        }}
        items={[
          { value: 'disk', label: 'Disco del servidor' },
          { value: 's3', label: 'Compatible con S3' },
        ]}
      />
      {driver === 'disk' ? (
        <p className="flex items-start gap-2.5 rounded-lg bg-slate-50 p-3.5 text-[13px] text-slate-600">
          <HardDrive className="mt-0.5 size-4 shrink-0 text-slate-500" aria-hidden="true" />
          Los archivos se guardan en el volumen del servidor. Inclúyelo en las copias de seguridad.
        </p>
      ) : (
        <S3Fields form={form} onChange={patch} current={settings.pending ?? settings} />
      )}
      {result && <TestResult result={result} />}
      <div className="flex flex-wrap justify-end gap-2">
        <Button icon={<PlugZap />} loading={test.isPending} disabled={incomplete || locked} onClick={() => void runTest()}>
          Probar conexión
        </Button>
        <Button type="submit" variant="primary" loading={update.isPending} disabled={incomplete || locked}>
          Guardar
        </Button>
      </div>
    </form>
  );
}

/** Configuración › Almacenamiento: where signatures and documents live, with a connection test and a guided migration. */
export function StorageSection() {
  const storage = useStorageSettings();

  return (
    <Card className="lg:col-span-2">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <span className="text-vino-600 [&_svg]:size-4">
              <Cloud />
            </span>
            Almacenamiento
          </span>
        }
        description="Dónde se guardan las firmas y los documentos. Nunca se sobrescribe ni se borra un archivo al cambiar de destino."
        action={storage.data && <Badge tone={storage.data.driver === 's3' ? 'info' : 'neutral'}>Activo: {describe(storage.data)}</Badge>}
      />
      <div className="flex flex-col gap-4 p-5">
        {storage.isPending && <Skeleton className="h-40" />}
        {storage.isError && <Alert tone="danger">{errorMessage(storage.error)}</Alert>}
        {storage.data && (
          <>
            <MigrationNotice settings={storage.data} />
            <StorageForm key={`${storage.data.driver}-${storage.data.pending?.driver ?? 'none'}`} settings={storage.data} />
          </>
        )}
      </div>
    </Card>
  );
}
