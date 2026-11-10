import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  CircleCheck,
  CircleX,
  Download,
  FileCheck2,
  FileSearch,
  FileUp,
  FileX2,
  Fingerprint,
  Info,
  SearchX,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import { Alert, Button, Card, Field, Input, Logo, Skeleton, cn, useAction } from '../../ui';
import {
  isVerificationCode,
  normalizeVerificationCode,
  useVerification,
  useVerifyFile,
  useVerifyHash,
  type VerificationResult,
  type VerificationStatus,
} from '../../lib/api/hooks/verify';
import { downloadFromApi } from '../../lib/download';
import { errorMessage } from '../../lib/errors';
import { formatDateTime } from '../../lib/format';

const MAX_PDF_BYTES = 15 * 1024 * 1024;

/** Checks the picked file before hashing or uploading it; returns an error message or null. */
function pdfProblem(file: File): string | null {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) return 'Elige el contrato en PDF.';
  if (file.size > MAX_PDF_BYTES) return 'El PDF no puede superar 15 MB.';
  return null;
}

/**
 * /verificar and /verificar/:code — public page. A code (typed or from the QR) shows data to compare
 * with the paper; only comparing the file itself proves that a document is the authentic original.
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
            Escribe el código de la constancia (o escanea su QR) y compara el documento que tienes con el original firmado.
          </p>
        </div>
        <CodeForm key={normalized ?? ''} initialCode={normalized} />
        {normalized ? <CodeResult code={normalized} /> : <FileWithoutCode />}
      </main>
      <footer className="px-4 py-6 text-center text-xs text-slate-400">
        Los documentos se comparan por su huella digital (SHA-256). La verificación no muestra datos personales completos.
      </footer>
    </div>
  );
}

function CodeForm({ initialCode }: { initialCode?: string }) {
  const navigate = useNavigate();
  const [value, setValue] = useState(initialCode ?? '');
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!isVerificationCode(value)) {
      setError('El código tiene 16 caracteres, en grupos de cuatro: XXXX-XXXX-XXXX-XXXX.');
      return;
    }
    setError(null);
    navigate(`/verificar/${normalizeVerificationCode(value)}`, { viewTransition: true });
  }

  return (
    <Card className="p-5">
      <form className="flex flex-col gap-3 sm:flex-row sm:items-start" onSubmit={submit} noValidate>
        <div className="min-w-0 flex-1">
          <Field label="Código de verificación" hint="Está en la constancia final del contrato, junto al QR." error={error}>
            <Input
              value={value}
              onChange={(event) => setValue(event.target.value.toUpperCase())}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              className="font-mono tracking-wide"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
        </div>
        <Button type="submit" variant="primary" icon={<FileSearch />} className="sm:mt-6">
          Verificar
        </Button>
      </form>
    </Card>
  );
}

/** Drop zone for a PDF; `busy` replaces the prompt while the file is being checked. */
function PdfDropZone({ busy, onFile, note }: { busy: boolean; onFile: (file: File) => void; note: string }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files[0];
          if (file) onFile(file);
        }}
        disabled={busy}
        className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-7 text-center text-sm text-slate-500 transition-colors hover:border-vino-400 hover:bg-vino-50/40 disabled:cursor-wait"
      >
        <FileUp className="size-6 text-slate-400" aria-hidden="true" />
        {busy ? 'Comprobando…' : 'Arrastra el PDF o haz clic para elegirlo'}
        <span className="text-xs text-slate-400">{note}</span>
      </button>
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.target.value = '';
        }}
      />
    </>
  );
}

/** No code at hand: the server looks the PDF up by its hash. */
function FileWithoutCode() {
  const verifyFile = useVerifyFile();
  const [problem, setProblem] = useState<string | null>(null);

  function pick(file: File) {
    const issue = pdfProblem(file);
    setProblem(issue);
    if (!issue) verifyFile.mutate(file);
  }

  const data = verifyFile.data;
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div>
        <h2 className="text-sm font-medium text-slate-900">¿No tienes el código?</h2>
        <p className="text-sm text-slate-500">Sube el PDF y buscaremos el contrato original que le corresponde.</p>
      </div>
      <PdfDropZone busy={verifyFile.isPending} onFile={pick} note="Se envía solo para compararlo; no se guarda." />
      {problem && (
        <p className="text-xs text-red-600" role="alert">
          {problem}
        </p>
      )}
      {verifyFile.isError && (
        <div className="animate-pop-in">
          <Alert tone="danger">{errorMessage(verifyFile.error)}</Alert>
        </div>
      )}
      {data && (
        <div key={verifyFile.submittedAt} className="animate-pop-in">
          {data.matches ? (
            <Alert
              tone={data.status === 'registered' ? 'success' : 'warning'}
              title={data.status === 'registered' ? 'Documento auténtico' : 'El PDF coincide, pero revisa su estado'}
            >
              Es idéntico al original firmado del contrato con código <span className="font-mono">{data.code}</span>.{' '}
              {data.code && (
                <Link to={`/verificar/${data.code}`} viewTransition className="font-medium underline">
                  Ver los datos del contrato
                </Link>
              )}
            </Alert>
          ) : (
            <Alert tone="danger" title="Este PDF no coincide con ningún contrato firmado">
              Puede ser una copia modificada, otra versión, la copia de verificación marcada o un documento que no salió de este sistema.
            </Alert>
          )}
        </div>
      )}
    </Card>
  );
}

const STATUS_VIEW: Record<VerificationStatus, { title: string; detail: string; tone: string; icon: ReactNode }> = {
  registered: {
    title: 'Código registrado',
    detail:
      'Corresponde a un contrato firmado por todas las partes y sus registros están íntegros. Para confirmar que tu documento es el original, compáralo abajo.',
    tone: 'border-sky-200 bg-sky-50 text-sky-950',
    icon: <ShieldCheck className="size-7 text-sky-600" />,
  },
  cancelled: {
    title: 'Contrato cancelado',
    detail: 'El contrato se firmó, pero después se canceló. Ya no tiene efecto.',
    tone: 'border-amber-200 bg-amber-50 text-amber-950',
    icon: <ShieldAlert className="size-7 text-amber-600" />,
  },
  revoked: {
    title: 'Código revocado',
    detail: 'Este código ya no es válido. Si lo copiaste de un documento, pide a la institución el código vigente.',
    tone: 'border-amber-200 bg-amber-50 text-amber-950',
    icon: <ShieldAlert className="size-7 text-amber-600" />,
  },
  integrity_error: {
    title: 'La comprobación de integridad falló',
    detail: 'Los registros del contrato no coinciden con su sello. No confíes en este documento y avisa a la institución.',
    tone: 'border-red-200 bg-red-50 text-red-950',
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
  const hasData = result.status === 'registered' || result.status === 'cancelled' || result.status === 'integrity_error';

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

      {hasData && <CompareDocument code={code} />}

      {hasData && (
        <Card className="divide-y divide-slate-100">
          <div className="p-5 pb-3">
            <h3 className="text-sm font-medium text-slate-900">Datos para comparar con tu documento</h3>
            <p className="text-xs text-slate-500">Si alguno no coincide con el papel que tienes, el documento no es este contrato.</p>
          </div>
          <dl className="grid gap-x-6 gap-y-3 p-5 sm:grid-cols-2">
            <Detail label="Contrato">{result.title ?? '—'}</Detail>
            <Detail label="Firmado por todas las partes">{result.activatedAt ? formatDateTime(result.activatedAt) : '—'}</Detail>
            <Detail label="Páginas del PDF original">{result.pageCount ?? '—'}</Detail>
            <Detail label="Firmantes">{result.signatoryCount ?? result.signatories?.length ?? 0}</Detail>
            {result.revokedAt && <Detail label="Cancelado">{formatDateTime(result.revokedAt)}</Detail>}
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
            <h3 className="mb-2 text-sm font-medium text-slate-900">Comprobaciones del sistema</h3>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              <Check ok={result.systemSignatureValid} label="Sello del sistema" />
              <Check ok={result.pdfIntegrityValid} label="PDF original sin modificar" />
              <Check ok={result.evidenceChainValid} label="Registro de firmas íntegro" />
              <Check ok={result.auditChainValid} label="Historial del contrato íntegro" />
            </ul>
          </div>
          <OfficialCopy code={code} result={result} />
          {(result.documentSha256 || result.finalPdfSha256) && (
            <details className="p-5 text-xs text-slate-500">
              <summary className="cursor-pointer font-medium text-slate-700">Huellas técnicas (SHA-256)</summary>
              <dl className="mt-3 flex flex-col gap-2">
                {result.documentSha256 && <Hash label="Documento" value={result.documentSha256} />}
                {result.finalPdfSha256 && <Hash label="PDF original" value={result.finalPdfSha256} />}
              </dl>
            </details>
          )}
        </Card>
      )}
    </section>
  );
}

/** The only check that proves authenticity: the file's hash, computed here, against the original's. */
function CompareDocument({ code }: { code: string }) {
  const verifyHash = useVerifyHash(code);
  const [problem, setProblem] = useState<string | null>(null);

  function pick(file: File) {
    const issue = pdfProblem(file);
    setProblem(issue);
    if (!issue) verifyHash.mutate(file);
  }

  const data = verifyHash.data;
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div>
        <h3 className="text-sm font-medium text-slate-900">Comprueba tu documento</h3>
        <p className="text-sm text-slate-500">Elige el PDF que recibiste. Se compara su huella digital con la del original firmado.</p>
      </div>
      <PdfDropZone busy={verifyHash.isPending} onFile={pick} note="El archivo no sale de tu equipo: solo se envía su huella." />
      {problem && (
        <p className="text-xs text-red-600" role="alert">
          {problem}
        </p>
      )}
      {verifyHash.isError && (
        <div className="animate-pop-in">
          <Alert tone="danger">{errorMessage(verifyHash.error)}</Alert>
        </div>
      )}
      {data && (
        <div key={verifyHash.submittedAt} className="animate-pop-in">
          {data.match && data.status === 'registered' && (
            <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
              <FileCheck2 className="size-6 shrink-0 text-emerald-600" aria-hidden="true" />
              <div>
                <p className="font-semibold">Documento auténtico</p>
                <p className="text-sm opacity-80">Es idéntico, byte a byte, al original firmado por todas las partes.</p>
              </div>
            </div>
          )}
          {data.match && data.status !== 'registered' && (
            <Alert tone="warning" title="El archivo es el original, pero revisa su estado">
              {STATUS_VIEW[data.status].detail}
            </Alert>
          )}
          {!data.match && (
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-950">
              <FileX2 className="size-6 shrink-0 text-red-600" aria-hidden="true" />
              <div>
                <p className="font-semibold">Este archivo NO coincide con el original</p>
                <p className="text-sm opacity-80">
                  Puede estar modificado, ser otra versión o ser la copia de verificación marcada. No lo des por auténtico.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function OfficialCopy({ code, result }: { code: string; result: VerificationResult }) {
  const { runAction } = useAction();

  if (!result.downloadAvailable) {
    if (!result.legacy) return null;
    return (
      <p className="flex items-start gap-2 p-5 text-xs text-slate-500">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        Este código es de un formato anterior: permite verificar, pero no descargar la copia oficial.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h3 className="text-sm font-medium text-slate-900">Copia oficial</h3>
        <p className="text-xs text-slate-500">
          Para comparar página por página con un documento impreso. Lleva la marca «Copia de verificación», así que su huella no coincide con
          la del original.
        </p>
      </div>
      <Button
        icon={<Download />}
        className="shrink-0"
        onClick={() =>
          void runAction({
            run: () => downloadFromApi(`/verify/${encodeURIComponent(code)}/pdf`, 'copia-verificacion.pdf'),
            pending: 'Preparando la copia…',
            success: 'Copia descargada.',
            error: 'No se pudo descargar la copia.',
          })
        }
      >
        Descargar copia
      </Button>
    </div>
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
