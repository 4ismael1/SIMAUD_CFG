import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
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
import { Alert, Button, Card, Field, Input, Logo, PageHeader, Skeleton, cn, useAction } from '../../ui';
import { useAuth } from '../../lib/auth';
import {
  isVerificationCode,
  normalizeVerificationCode,
  useLookupFile,
  useVerification,
  type FileVerificationResult,
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

/** Where the verification page lives: inside the panel (/app/verificar) with a session, public otherwise. */
function useVerifyBase() {
  return useLocation().pathname.startsWith('/app/') ? '/app/verificar' : '/verificar';
}

/** Link to another verification code, staying in the panel or on the public page. */
function VerifyLink({ code, className, children }: { code: string; className?: string; children: ReactNode }) {
  return (
    <Link to={`${useVerifyBase()}/${code}`} viewTransition className={className}>
      {children}
    </Link>
  );
}

const INTRO = 'Sube el PDF del contrato: comprobamos que sea exactamente el original firmado y en qué estado está hoy.';
const FOOTNOTE = 'Los documentos se comparan por su huella digital (SHA-256). La verificación no muestra datos personales completos.';

/**
 * /verificar and /verificar/:code — public page. A code (typed or from the QR) shows data to compare
 * with the paper; only comparing the file itself proves that a document is the authentic original.
 * With a session open it moves into the panel (/app/verificar), so the sidebar stays.
 */
export function VerifyPage() {
  const { code } = useParams();
  const { status } = useAuth();
  const normalized = code ? normalizeVerificationCode(code) : undefined;
  if (status === 'authenticated') return <Navigate to={`/app/verificar${normalized ? `/${normalized}` : ''}`} replace />;

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
          <p className="text-slate-500">{INTRO}</p>
        </div>
        <VerifyContent code={normalized} />
      </main>
      <footer className="px-4 py-6 text-center text-xs text-slate-400">{FOOTNOTE}</footer>
    </div>
  );
}

/** /app/verificar — the same check inside the panel, keeping the sidebar. */
export function VerifyInAppPage() {
  const { code } = useParams();
  const normalized = code ? normalizeVerificationCode(code) : undefined;
  return (
    <>
      <PageHeader title="Verificar un contrato firmado" description={INTRO} />
      <div className="flex max-w-3xl flex-col gap-6">
        <VerifyContent code={normalized} />
        <p className="text-xs text-slate-400">{FOOTNOTE}</p>
      </div>
    </>
  );
}

/** The PDF is the main check; the code from the certificate (or its QR) is the alternative. */
function VerifyContent({ code }: { code?: string }) {
  if (code)
    return (
      <>
        <CodeResult code={code} />
        <SecondaryCode title="Verificar otro código" />
      </>
    );
  return (
    <>
      <PdfCheck />
      <SecondaryCode title="¿No tienes el PDF? Verifica con el código de la constancia" />
    </>
  );
}

function SecondaryCode({ title }: { title: string }) {
  return (
    <details className="rounded-xl border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 text-sm font-medium text-slate-700 hover:text-slate-900">
        <FileSearch className="size-4 text-slate-400" aria-hidden="true" />
        {title}
      </summary>
      <div className="border-t border-slate-100">
        <CodeForm />
      </div>
    </details>
  );
}

function CodeForm({ initialCode }: { initialCode?: string }) {
  const navigate = useNavigate();
  const base = useVerifyBase();
  const [value, setValue] = useState(initialCode ?? '');
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!isVerificationCode(value)) {
      setError('El código tiene 16 caracteres, en grupos de cuatro: XXXX-XXXX-XXXX-XXXX.');
      return;
    }
    setError(null);
    navigate(`${base}/${normalizeVerificationCode(value)}`, { viewTransition: true });
  }

  return (
    <div className="p-5">
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
    </div>
  );
}

/** Drop zone for a PDF; `busy` replaces the prompt while the file is being checked. */
function PdfDropZone({ busy, onFile, note, large }: { busy: boolean; onFile: (file: File) => void; note: string; large?: boolean }) {
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
        className={cn(
          'flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 text-center text-sm text-slate-500 transition-colors hover:border-vino-400 hover:bg-vino-50/40 disabled:cursor-wait',
          large ? 'py-12' : 'py-7',
        )}
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

/**
 * Upload check shared by both entries. The PDF's hash is computed in the browser and only the hash is
 * sent; `expectedCode` (from the URL) flags an authentic PDF that belongs to another contract.
 */
function PdfCheck({ expectedCode }: { expectedCode?: string }) {
  const lookup = useLookupFile();
  const [problem, setProblem] = useState<string | null>(null);

  function pick(file: File) {
    const issue = pdfProblem(file);
    setProblem(issue);
    if (!issue) lookup.mutate(file);
  }

  return (
    <Card className="flex flex-col gap-4 p-5 sm:p-6">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{expectedCode ? 'Comprueba tu documento' : 'Sube el contrato en PDF'}</h2>
        <p className="text-sm text-slate-500">
          Es la comprobación que prueba la autenticidad: el archivo debe ser idéntico, byte a byte, al que emitió el sistema.
        </p>
      </div>
      <PdfDropZone busy={lookup.isPending} onFile={pick} note="El archivo no sale de tu equipo: solo se envía su huella digital." large={!expectedCode} />
      {problem && (
        <p className="text-xs text-red-600" role="alert">
          {problem}
        </p>
      )}
      {lookup.isError && (
        <div className="animate-pop-in">
          <Alert tone="danger">{errorMessage(lookup.error)}</Alert>
        </div>
      )}
      {lookup.data && (
        <div key={lookup.submittedAt} className="animate-pop-in">
          <FileVerdict result={lookup.data} expectedCode={expectedCode} />
        </div>
      )}
    </Card>
  );
}

interface VerdictView {
  tone: string;
  icon: ReactNode;
  title: string;
  detail: ReactNode;
}

const RED = 'border-red-200 bg-red-50 text-red-950';
const AMBER = 'border-amber-200 bg-amber-50 text-amber-950';

/** What a file check means, in plain words. Only an exact original of a valid contract is green. */
function verdictFor(result: FileVerificationResult, expectedCode?: string): VerdictView {
  const since = result.revokedAt ? ` desde el ${formatDateTime(result.revokedAt)}` : '';
  if (result.matches && expectedCode && result.code && result.code !== expectedCode)
    return {
      tone: AMBER,
      icon: <TriangleAlert className="size-6 text-amber-600" />,
      title: 'Este PDF es de otro contrato',
      detail: (
        <>
          Es un original auténtico, pero su código es <span className="font-mono">{result.code}</span>, no el que estás consultando.
        </>
      ),
    };
  if (result.matches) return originalVerdict(result.status, since);
  if (result.issuedCopy) {
    const copy = result.issuedCopy;
    const what = copy.kind === 'verification' ? 'una copia de verificación' : `una copia marcada «${copy.stamp ?? ''}»`;
    const state = !copy.signed
      ? 'Cuando se emitió, el contrato aún no estaba firmado por todas las partes: no tiene validez como contrato.'
      : result.status === 'cancelled'
        ? `El contrato está CANCELADO${since}.`
        : result.status === 'amended'
          ? 'El contrato fue sustituido por una enmienda.'
          : result.status === 'registered'
            ? 'El contrato firmado sigue vigente.'
            : 'Revisa el estado del contrato con su código.';
    const valid = copy.signed && result.status === 'registered';
    return {
      tone: valid ? 'border-sky-200 bg-sky-50 text-sky-950' : AMBER,
      icon: <Info className={cn('size-6', valid ? 'text-sky-600' : 'text-amber-600')} />,
      title: 'Copia emitida por el sistema, no el original firmado',
      detail: `Es ${what}, entregada el ${formatDateTime(copy.issuedAt)}. ${state} Para probar la autenticidad del contrato, usa el PDF original firmado.`,
    };
  }
  return {
    tone: RED,
    icon: <FileX2 className="size-6 text-red-600" />,
    title: 'Este PDF no coincide con ningún documento del sistema',
    detail:
      'Puede estar modificado (aunque sea en un detalle), ser otra versión, estar escaneado o no haber salido de este sistema. No lo des por auténtico.',
  };
}

function originalVerdict(status: VerificationStatus, since: string): VerdictView {
  switch (status) {
    case 'registered':
      return {
        tone: 'border-emerald-200 bg-emerald-50 text-emerald-950',
        icon: <FileCheck2 className="size-6 text-emerald-600" />,
        title: 'Documento auténtico y vigente',
        detail: 'Es idéntico al original firmado por todas las partes, y el contrato sigue en vigor.',
      };
    case 'cancelled':
      return {
        tone: RED,
        icon: <ShieldAlert className="size-6 text-red-600" />,
        title: `Documento auténtico, pero el contrato está CANCELADO${since}`,
        detail: 'El archivo es el original firmado, pero el contrato se canceló después y ya no tiene efecto.',
      };
    case 'amended':
      return {
        tone: 'border-violet-200 bg-violet-50 text-violet-950',
        icon: <ShieldAlert className="size-6 text-violet-600" />,
        title: 'Documento auténtico, pero sustituido por una enmienda',
        detail: 'El archivo es el original firmado, pero ya no rige: lo sustituye una enmienda firmada después.',
      };
    case 'integrity_error':
      return {
        tone: RED,
        icon: <TriangleAlert className="size-6 text-red-600" />,
        title: 'La comprobación de integridad falló',
        detail: 'Los registros del contrato no coinciden con su sello. No confíes en este documento y avisa a la institución.',
      };
    default:
      return {
        tone: AMBER,
        icon: <ShieldAlert className="size-6 text-amber-600" />,
        title: 'Documento auténtico, pero su código ya no es válido',
        detail: 'El archivo es el original, pero la institución reemplazó o revocó su código. Pide el código vigente.',
      };
  }
}

function FileVerdict({ result, expectedCode }: { result: FileVerificationResult; expectedCode?: string }) {
  const view = verdictFor(result, expectedCode);
  return (
    <div className={cn('flex items-start gap-3 rounded-xl border p-4', view.tone)}>
      <span className="shrink-0">{view.icon}</span>
      <div className="min-w-0">
        <p className="font-semibold">{view.title}</p>
        {result.title && <p className="mt-0.5 text-sm font-medium opacity-90">{result.title}</p>}
        <p className="mt-0.5 text-sm opacity-80">{view.detail}</p>
        {result.code && result.code !== expectedCode && (
          <VerifyLink code={result.code} className="mt-2 inline-block text-sm font-medium underline">
            Ver los datos del contrato
          </VerifyLink>
        )}
      </div>
    </div>
  );
}

const STATUS_VIEW: Record<VerificationStatus, { title: string; detail: string; tone: string; icon: ReactNode }> = {
  registered: {
    title: 'Código válido: contrato firmado y vigente',
    detail:
      'Existe un contrato firmado con este código y sus registros están íntegros. Esto no prueba que TU documento sea auténtico: sube el PDF abajo para comprobarlo.',
    tone: 'border-sky-200 bg-sky-50 text-sky-950',
    icon: <ShieldCheck className="size-7 text-sky-600" />,
  },
  amended: {
    title: 'Contrato sustituido por una enmienda',
    detail: 'El contrato se firmó y sigue siendo auténtico, pero ya no está vigente: lo sustituyó una enmienda firmada después.',
    tone: 'border-violet-200 bg-violet-50 text-violet-950',
    icon: <ShieldAlert className="size-7 text-violet-600" />,
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
  if (result.isPending) return <Skeleton className="h-64 rounded-xl" />;
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
  const hasData = result.status !== 'not_found' && result.status !== 'revoked';

  return (
    <section aria-live="polite" className="flex animate-rise-in flex-col gap-4">
      <div className={cn('flex items-start gap-4 rounded-xl border p-5', view.tone)}>
        <span className="shrink-0">{view.icon}</span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{view.title}</h2>
          <p className="mt-0.5 text-sm opacity-80">{view.detail}</p>
          <p className="mt-2 font-mono text-xs break-all opacity-70">{code}</p>
          {result.amendedBy && (
            <p className="mt-2 text-sm">
              Sustituido por la enmienda {result.amendedBy.amendmentNumber ? `E${result.amendedBy.amendmentNumber} ` : ''}(
              <span className="font-mono">{result.amendedBy.code}</span>).{' '}
              <VerifyLink code={result.amendedBy.verificationCode} className="font-medium underline">
                Verificar la enmienda
              </VerifyLink>
            </p>
          )}
        </div>
      </div>

      {hasData && <PdfCheck expectedCode={code} />}

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

/** Clean copy for people with access to the contract (checked by the API); never on the public page. */
function OfficialCopy({ code, result }: { code: string; result: VerificationResult }) {
  const { runAction } = useAction();
  const { status } = useAuth();
  if (status !== 'authenticated') return null;

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
