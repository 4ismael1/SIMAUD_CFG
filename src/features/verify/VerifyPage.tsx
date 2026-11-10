import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CircleCheck, CircleX, FileSearch, FileUp, Fingerprint, SearchX, ShieldAlert, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Alert, Button, Card, Field, Input, Logo, Skeleton, cn } from '../../ui';
import {
  VERIFICATION_CODE,
  normalizeVerificationCode,
  useVerification,
  useVerifyFile,
  type VerificationResult,
  type VerificationStatus,
} from '../../lib/api/hooks/verify';
import { errorMessage } from '../../lib/errors';
import { formatDateTime } from '../../lib/format';

/**
 * /verificar and /verificar/:code — public page anyone can use to check a signed contract: by the
 * code printed on its certificate (the QR opens this page with the code) or by uploading the PDF.
 */
export function VerifyPage() {
  const { code } = useParams();
  const normalized = code ? normalizeVerificationCode(code) : undefined;

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link to="/" aria-label="Ir al inicio">
            <Logo />
          </Link>
          <span className="flex items-center gap-1.5 text-xs text-slate-500">
            <ShieldCheck className="size-4" aria-hidden="true" />
            Verificación de documentos
          </span>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 animate-page-in flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[26px] font-semibold text-slate-900">Verificar un contrato firmado</h1>
          <p className="text-slate-500">
            Comprueba que un contrato es auténtico y no ha sido modificado. Escribe el código de la constancia o sube el PDF.
          </p>
        </div>
        <SearchForms initialCode={normalized} />
        {normalized && <CodeResult code={normalized} />}
      </main>
      <footer className="py-6 text-center text-xs text-slate-400">
        La verificación no muestra el contenido del contrato ni datos personales completos.
      </footer>
    </div>
  );
}

function SearchForms({ initialCode }: { initialCode?: string }) {
  const navigate = useNavigate();
  const [value, setValue] = useState(initialCode ?? '');
  const [error, setError] = useState<string | null>(null);
  const verifyFile = useVerifyFile();
  const fileInput = useRef<HTMLInputElement>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const normalized = normalizeVerificationCode(value);
    if (!VERIFICATION_CODE.test(normalized)) {
      setError('El código tiene la forma SIM-XXXX-XXXX-XXXX-XXXX-XXXX.');
      return;
    }
    setError(null);
    verifyFile.reset();
    navigate(`/verificar/${normalized}`, { viewTransition: true });
  }

  function pickFile(file: File | undefined) {
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Sube el contrato en PDF.');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setError('El PDF no puede superar 15 MB.');
      return;
    }
    setError(null);
    verifyFile.mutate(file);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card className="p-5">
          <form className="flex flex-col gap-3" onSubmit={submit} noValidate>
            <Field label="Código de verificación" hint="Está en la constancia final del contrato, junto al QR." error={error}>
              <Input
                value={value}
                onChange={(event) => setValue(event.target.value.toUpperCase())}
                placeholder="SIM-XXXX-XXXX-XXXX-XXXX-XXXX"
                className="font-mono tracking-wide"
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
            <Button type="submit" variant="primary" icon={<FileSearch />} className="self-start">
              Verificar
            </Button>
          </form>
        </Card>
        <Card className="p-5">
          <div className="flex h-full flex-col gap-3">
            <span className="text-sm font-medium text-slate-900">O sube el PDF</span>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                pickFile(event.dataTransfer.files[0]);
              }}
              className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 hover:border-vino-400 hover:bg-vino-50/40"
            >
              <FileUp className="size-6 text-slate-400" aria-hidden="true" />
              {verifyFile.isPending ? 'Comprobando…' : 'Arrastra el archivo o haz clic para elegirlo'}
              <span className="text-xs text-slate-400">No se guarda; solo se compara.</span>
            </button>
            <input ref={fileInput} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(event) => pickFile(event.target.files?.[0])} />
          </div>
        </Card>
      </div>
      {verifyFile.isError && (
        <div className="animate-pop-in">
          <Alert tone="danger">{errorMessage(verifyFile.error)}</Alert>
        </div>
      )}
      {verifyFile.data && <FileResult key={verifyFile.submittedAt} matches={verifyFile.data.matches} status={verifyFile.data.status} code={verifyFile.data.code} signatureValid={verifyFile.data.systemSignatureValid} />}
    </div>
  );
}

function FileResult({ matches, status, code, signatureValid }: { matches: boolean; status: VerificationStatus; code?: string; signatureValid: boolean }) {
  if (!matches) {
    return (
      <div className="animate-pop-in">
        <Alert tone="danger" title="Este PDF no coincide con ningún contrato firmado">
          Puede ser una copia modificada, otra versión o un documento que no salió de este sistema.
        </Alert>
      </div>
    );
  }
  const ok = status === 'valid' && signatureValid;
  return (
    <div className="animate-pop-in">
      <Alert tone={ok ? 'success' : 'warning'} title={ok ? 'El PDF es idéntico al contrato firmado' : 'El PDF coincide, pero revisa su estado'}>
        <span>
          Corresponde al contrato <span className="font-mono">{code}</span>.{' '}
          {code && (
            <Link to={`/verificar/${code}`} viewTransition className="font-medium underline">
              Ver la verificación completa
            </Link>
          )}
        </span>
      </Alert>
    </div>
  );
}

const STATUS_VIEW: Record<VerificationStatus, { title: string; detail: string; tone: string; icon: ReactNode }> = {
  valid: {
    title: 'Contrato válido',
    detail: 'El documento está firmado por todas las partes y no ha sido modificado desde entonces.',
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    icon: <ShieldCheck className="size-7 text-emerald-600" />,
  },
  revoked: {
    title: 'Contrato revocado',
    detail: 'El contrato fue firmado, pero después se canceló. Ya no tiene efecto.',
    tone: 'border-amber-200 bg-amber-50 text-amber-900',
    icon: <ShieldAlert className="size-7 text-amber-600" />,
  },
  invalid: {
    title: 'La comprobación de integridad falló',
    detail: 'Los registros del contrato no coinciden con su sello. No confíes en este documento y avisa a la institución.',
    tone: 'border-red-200 bg-red-50 text-red-900',
    icon: <TriangleAlert className="size-7 text-red-600" />,
  },
  not_found: {
    title: 'No encontramos ese código',
    detail: 'Revisa que esté bien escrito. Si lo copiaste de un documento, puede que no sea auténtico.',
    tone: 'border-slate-200 bg-white text-slate-900',
    icon: <SearchX className="size-7 text-slate-400" />,
  },
};

function CodeResult({ code }: { code: string }) {
  const result = useVerification(code);
  if (result.isPending) return <Skeleton className="h-64 animate-fade-in rounded-xl" />;
  if (result.isError)
    return (
      <div className="animate-pop-in">
        <Alert tone="danger">{errorMessage(result.error)}</Alert>
      </div>
    );
  return <ResultCard result={result.data} code={code} />;
}

function ResultCard({ result, code }: { result: VerificationResult; code: string }) {
  const view = STATUS_VIEW[result.status];
  return (
    <section aria-live="polite" className="flex animate-rise-in flex-col gap-4">
      <div className={cn('flex items-start gap-4 rounded-xl border p-5', view.tone)}>
        <span className="shrink-0">{view.icon}</span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{view.title}</h2>
          <p className="mt-0.5 text-sm opacity-80">{view.detail}</p>
          <p className="mt-2 font-mono text-xs break-all opacity-70">{code}</p>
        </div>
      </div>

      {result.status !== 'not_found' && (
        <Card className="divide-y divide-slate-100">
          <dl className="grid gap-x-6 gap-y-3 p-5 sm:grid-cols-2">
            <Detail label="Contrato">{result.title ?? '—'}</Detail>
            <Detail label="Firmado (completo)">{result.activatedAt ? formatDateTime(result.activatedAt) : '—'}</Detail>
            {result.revokedAt && <Detail label="Revocado">{formatDateTime(result.revokedAt)}</Detail>}
            <Detail label="Firmantes">{result.signatoryCount ?? result.signatories?.length ?? 0}</Detail>
          </dl>
          {result.signatories && result.signatories.length > 0 && (
            <div className="p-5">
              <h3 className="mb-2 text-sm font-medium text-slate-900">Firmas</h3>
              <ul className="flex flex-col gap-1.5">
                {result.signatories.map((signer, index) => (
                  <li key={index} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 text-slate-800">
                      <Fingerprint className="size-4 text-slate-400" aria-hidden="true" />
                      {signer.name}
                    </span>
                    <span className="text-slate-500">{signer.signedAt ? formatDateTime(signer.signedAt) : 'Sin fecha'}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="p-5">
            <h3 className="mb-2 text-sm font-medium text-slate-900">Comprobaciones</h3>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              <Check ok={result.systemSignatureValid} label="Sello del sistema" />
              <Check ok={result.pdfIntegrityValid} label="PDF sin modificar" />
              <Check ok={result.evidenceChainValid} label="Registro de firmas íntegro" />
              <Check ok={result.auditChainValid} label="Historial del contrato íntegro" />
            </ul>
          </div>
          {(result.documentSha256 || result.finalPdfSha256) && (
            <details className="p-5 text-xs text-slate-500">
              <summary className="cursor-pointer font-medium text-slate-700">Huellas técnicas (SHA-256)</summary>
              <dl className="mt-3 flex flex-col gap-2">
                {result.documentSha256 && <Hash label="Documento" value={result.documentSha256} />}
                {result.finalPdfSha256 && <Hash label="PDF final" value={result.finalPdfSha256} />}
              </dl>
            </details>
          )}
        </Card>
      )}
    </section>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="truncate text-sm font-medium text-slate-900">{children}</dd>
    </div>
  );
}

function Check({ ok, label }: { ok: boolean | undefined; label: string }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      {ok ? <CircleCheck className="size-4 text-emerald-600" /> : <CircleX className="size-4 text-red-600" />}
      <span className={ok ? 'text-slate-700' : 'text-red-700'}>{label}</span>
      <span className="sr-only">{ok ? 'correcto' : 'falló'}</span>
    </li>
  );
}

function Hash({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className="font-mono break-all text-slate-700">{value}</dd>
    </div>
  );
}
