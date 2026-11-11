import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Check, CircleCheck, Download, Maximize2, PenLine, ShieldCheck, Type, Undo2, Upload, X } from 'lucide-react';
import { Alert, Button, ButtonLink, Checkbox, EmptyState, Logo, Segmented, Skeleton, useAction, useToast } from '../../ui';
import { useContract } from '../../lib/api/hooks/contracts';
import { useSignContract } from '../../lib/api/hooks/signatures';
import { useAuth } from '../../lib/auth';
import { SwitchAccountButton } from '../../app/SwitchAccountButton';
import { errorMessage } from '../../lib/errors';
import { downloadFromApi } from '../../lib/download';
import { formatCedula, formatDate } from '../../lib/format';
import { DocumentView } from '../contracts/components/DocumentView';
import { signatoryRoleLabel } from '../contracts/components/SignatoriesPanel';
import { SignaturePad, type SignaturePadHandle } from './SignaturePad';
import { SignatureFullscreen } from './SignatureFullscreen';
import { SignaturePreviewDialog } from './SignaturePreviewDialog';
import { signatureSlotFor } from './signature-slot';
import { AUTO_PLACEMENT, signatureBoxAspect } from './signature-placement';
import type { SignaturePlacement } from '../../lib/api/types';
import { TypedSignature, type TypedSignatureValue } from './TypedSignature';
import { DEFAULT_SIGNATURE_STYLE, renderTypedSignature, styleById } from './signature-styles';
import { useDeleteSignatureStyle, useSaveSignatureStyle, useSignatureStyle } from '../../lib/api/hooks/signature-style';

const MAX_UPLOAD_BYTES = 500 * 1024;

type Mode = 'type' | 'draw' | 'upload';

export function SignContractPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { runAction } = useAction();
  const { user } = useAuth();
  const contract = useContract(id);
  const sign = useSignContract(id);
  const padRef = useRef<SignaturePadHandle>(null);
  const endOfDocumentRef = useRef<HTMLDivElement>(null);
  const [readToEnd, setReadToEnd] = useState(false);
  const [viewedAt] = useState(() => new Date().toISOString());
  const [accepted, setAccepted] = useState(false);
  const [mode, setMode] = useState<Mode>('type');
  const savedStyle = useSignatureStyle();
  const saveStyle = useSaveSignatureStyle();
  const deleteStyle = useDeleteSignatureStyle();
  const [typed, setTyped] = useState<TypedSignatureValue | null>(null);
  const [rememberTyped, setRememberTyped] = useState(true);
  const [hasDrawing, setHasDrawing] = useState(false);
  const [uploaded, setUploaded] = useState<{ blob: Blob; url: string } | null>(null);
  /** Signature drawn in the full-screen pad; replaces the inline pad until discarded. */
  const [captured, setCaptured] = useState<{ blob: Blob; url: string } | null>(null);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  /** The exact image that will be sent, shown in its box before confirming. */
  const [review, setReview] = useState<{ blob: Blob; url: string } | null>(null);
  const [placement, setPlacement] = useState<SignaturePlacement>(AUTO_PLACEMENT);

  const handlePadChange = useCallback((hasInk: boolean) => setHasDrawing(hasInk), []);

  useEffect(() => {
    const marker = endOfDocumentRef.current;
    if (!marker) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setReadToEnd(true);
    });
    observer.observe(marker);
    return () => observer.disconnect();
  }, [contract.data]);

  useEffect(() => () => {
    if (uploaded) URL.revokeObjectURL(uploaded.url);
  }, [uploaded]);

  useEffect(() => () => {
    if (captured) URL.revokeObjectURL(captured.url);
  }, [captured]);

  useEffect(() => () => {
    if (review) URL.revokeObjectURL(review.url);
  }, [review]);

  if (contract.isPending) return <Skeleton className="m-6 h-[70dvh] animate-fade-in rounded-xl" />;
  if (contract.isError) {
    // Usually a link meant for another account (the API hides contracts you do not take part in).
    return (
      <EmptyState
        className="min-h-dvh"
        title="Este enlace no es para la cuenta con la que entraste"
        description={`${errorMessage(contract.error)} Si te llegó por correo, entra con la cuenta a la que se envió.`}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <SwitchAccountButton />
            <ButtonLink to="/app/firmas">Volver</ButtonLink>
          </div>
        }
      />
    );
  }

  const data = contract.data;
  const mySignatory = data.signatories.find((signatory) => signatory.userId === user?.id && signatory.status === 'pending');

  if (done) return <SignedScreen code={data.code} contractId={data.id} title={data.title} />;

  if (!data.can.sign || !mySignatory) {
    const isSignatory = data.signatories.some((signatory) => signatory.userId === user?.id);
    return (
      <EmptyState
        className="min-h-dvh"
        icon={<PenLine />}
        title={isSignatory ? 'Este contrato no espera tu firma ahora' : `No firmas este contrato como ${user?.name ?? 'esta cuenta'}`}
        description={
          isSignatory
            ? 'Puede que ya hayas firmado, que todavía no sea tu turno o que el contrato haya cambiado de estado.'
            : 'Si el enlace te llegó por correo, es para otra cuenta: cambia de cuenta y volverás aquí para firmar.'
        }
        action={
          <div className="flex flex-wrap justify-center gap-2">
            {!isSignatory && <SwitchAccountButton />}
            <ButtonLink to={`/app/contratos/${data.id}`}>Ver contrato</ButtonLink>
          </div>
        }
      />
    );
  }

  function handleFile(file: File | undefined) {
    setUploadError(null);
    if (!file) return;
    if (file.type !== 'image/png') {
      setUploadError('Sube la firma en formato PNG.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError('La imagen supera 500 KB.');
      return;
    }
    if (uploaded) URL.revokeObjectURL(uploaded.url);
    setUploaded({ blob: file, url: URL.createObjectURL(file) });
  }

  function handleFullscreenAccept(blob: Blob) {
    setCaptured({ blob, url: URL.createObjectURL(blob) });
    setFullscreenOpen(false);
  }

  // The typed signature starts from the saved style, or from the signer's name in the default style.
  const typedValue: TypedSignatureValue = typed ?? {
    text: savedStyle.data?.text ?? mySignatory.name,
    styleId: styleById(savedStyle.data?.fontId).id,
  };
  const usingSavedStyle =
    Boolean(savedStyle.data) && typedValue.text === savedStyle.data?.text && typedValue.styleId === savedStyle.data?.fontId;

  const hasSignature =
    mode === 'type' ? typedValue.text.trim().length > 0 : mode === 'draw' ? Boolean(captured) || hasDrawing : Boolean(uploaded);
  const canSubmit = readToEnd && accepted && hasSignature && !sign.isPending;

  async function handleReview() {
    let signature: Blob | null | undefined;
    if (mode === 'type') signature = await renderTypedSignature(typedValue.text, styleById(typedValue.styleId));
    else if (mode === 'draw') signature = captured?.blob ?? (await padRef.current?.toBlob());
    else signature = uploaded?.blob;
    if (!signature) return;
    setPlacement(AUTO_PLACEMENT);
    setReview({ blob: signature, url: URL.createObjectURL(signature) });
  }

  async function handleSign() {
    const signature = review?.blob;
    if (!signature) return;
    try {
      await sign.mutateAsync({
        signature,
        acceptedDeclaration: true,
        viewedAt,
        method: mode === 'type' ? 'typed' : mode === 'draw' ? 'drawn' : 'uploaded',
        fontId: mode === 'type' ? styleById(typedValue.styleId).id : undefined,
        placement,
      });
      // Only typed signatures are remembered; a failure here must not undo a valid signature.
      if (mode === 'type' && rememberTyped && !usingSavedStyle) {
        saveStyle.mutate({ text: typedValue.text.trim(), fontId: typedValue.styleId });
      }
      setReview(null);
      setDone(true);
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo registrar la firma.'));
    }
  }

  return (
    <div className="flex min-h-dvh animate-page-in flex-col bg-slate-50">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-7">
        <Logo variant="mark" className="h-7 sm:hidden" />
        <Logo className="hidden h-8 sm:block" />
        <span className="hidden h-6 w-px bg-slate-200 sm:block" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{data.title}</span>
          <span className="block font-mono text-xs text-slate-500">{data.code} · versión {data.currentVersion}</span>
        </span>
        <Button variant="ghost" icon={<X />} onClick={() => navigate(-1)}>Salir</Button>
      </header>

      <div className="mx-auto flex w-full max-w-[1360px] flex-wrap items-start gap-6 px-4 py-6 sm:px-7">
        <section className="flex min-w-0 flex-[999_1_560px] flex-col gap-3">
          <p className={readToEnd ? 'flex items-center gap-1.5 text-xs font-semibold text-green-700' : 'text-xs text-slate-500'}>
            {readToEnd ? <><Check className="size-4" aria-hidden="true" />Leíste el documento completo</> : 'Desplázate hasta el final del documento para poder firmar.'}
          </p>
          <DocumentView content={data.generatedContent} heading={data.title} subheading={`${data.code} · versión ${data.currentVersion}`}>
            <div ref={endOfDocumentRef} className="h-px" aria-hidden="true" />
          </DocumentView>
        </section>

        <aside className="flex w-full flex-[1_1_360px] flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-pop lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:max-w-[440px] lg:overflow-y-auto">
          <div>
            <p className="text-xs font-semibold tracking-wider text-vino-600 uppercase">Tu firma</p>
            <h1 className="text-xl font-semibold">Firmar como {signatoryRoleLabel(mySignatory).toLowerCase()}</h1>
          </div>
          <Checkbox
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
            className="rounded-xl border border-slate-200 bg-slate-50 p-3"
            label={
              <>
                Leí el contrato completo y lo firmo electrónicamente como <b>{mySignatory.name}</b>
                {mySignatory.cedula ? <>, cédula <span className="font-mono">{formatCedula(mySignatory.cedula)}</span></> : null}. Esta firma tiene la misma
                validez que la manuscrita (Ley 126-02).
              </>
            }
          />
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Segmented
                label="Forma de firmar"
                value={mode}
                onChange={setMode}
                items={[
                  { value: 'type', label: <><Type aria-hidden="true" />Escribir</> },
                  { value: 'draw', label: <><PenLine aria-hidden="true" />Dibujar</> },
                  { value: 'upload', label: <><Upload aria-hidden="true" />Subir</> },
                ]}
              />
              {mode === 'draw' && (
                <div className="flex items-center gap-1">
                  {(hasDrawing || captured) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Undo2 />}
                      onClick={() => (captured ? setCaptured(null) : padRef.current?.clear())}
                    >
                      Borrar
                    </Button>
                  )}
                  <Button size="sm" icon={<Maximize2 />} onClick={() => setFullscreenOpen(true)}>
                    Ampliar
                  </Button>
                </div>
              )}
            </div>
            {mode === 'type' && (
              <TypedSignature
                value={typedValue}
                onChange={setTyped}
                remember={rememberTyped}
                onRememberChange={setRememberTyped}
                usingSaved={usingSavedStyle}
                onForgetSaved={() => {
                  const previous = savedStyle.data;
                  void runAction({
                    run: () => deleteStyle.mutateAsync(),
                    success: 'Olvidamos tu firma guardada.',
                    undo: previous ? { run: () => saveStyle.mutateAsync(previous), success: 'Firma guardada de nuevo.' } : undefined,
                  });
                  setTyped({ text: mySignatory.name, styleId: DEFAULT_SIGNATURE_STYLE.id });
                }}
              />
            )}
            {mode === 'draw' && captured && (
              <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-xl border-[1.5px] border-slate-200 bg-white sm:h-52">
                <img src={captured.url} alt={`Firma de ${mySignatory.name}`} className="max-h-32 max-w-[85%] object-contain" />
                <button type="button" onClick={() => setFullscreenOpen(true)} className="text-xs font-medium text-vino-600 hover:text-vino-700">
                  Volver a firmar
                </button>
              </div>
            )}
            {mode === 'draw' && !captured && (
              <SignaturePad ref={padRef} onChange={handlePadChange} label={`Área de firma de ${mySignatory.name}`} />
            )}
            {mode === 'draw' && !captured && (
              <p className="text-xs text-slate-500">
                ¿Poco espacio? Pulsa <b className="font-medium text-slate-700">Ampliar</b> para firmar a pantalla completa.
              </p>
            )}
            {mode === 'upload' && (
              <div className="flex flex-col gap-2">
                <label className="flex h-48 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-slate-300 bg-white text-sm text-slate-500 hover:bg-slate-50">
                  {uploaded ? <img src={uploaded.url} alt="Vista previa de la firma" className="max-h-36 max-w-[90%] object-contain" /> : <><Upload className="size-6" aria-hidden="true" />Elegir imagen PNG (máx. 500 KB)</>}
                  <input type="file" accept="image/png" className="sr-only" onChange={(event) => handleFile(event.target.files?.[0])} />
                </label>
                {uploadError && <p className="text-xs text-red-600" role="alert">{uploadError}</p>}
              </div>
            )}
            <SignatureFullscreen
              open={fullscreenOpen}
              signerName={mySignatory.name}
              onClose={() => setFullscreenOpen(false)}
              onAccept={handleFullscreenAccept}
            />
          </div>
          <p className="flex items-start gap-1.5 text-xs text-slate-500">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Se registrarán la fecha, la hora, tu IP y tu dispositivo junto con la versión exacta del documento.
          </p>
          {/* Always reachable: pinned to the bottom of the panel (and of the screen on phones). */}
          <div className="sticky bottom-0 z-10 -mx-5 -mb-5 mt-auto flex flex-col gap-3 rounded-b-2xl border-t border-slate-100 bg-white px-5 pt-3 pb-5">
            {!readToEnd && <Alert tone="info">Lee el documento hasta el final para habilitar la firma.</Alert>}
            <Button variant="primary" size="lg" block icon={<PenLine />} disabled={!canSubmit} onClick={() => void handleReview()}>
              Revisar y firmar
            </Button>
          </div>
          <SignaturePreviewDialog
            open={review !== null}
            imageUrl={review?.url ?? null}
            name={mySignatory.name}
            cedula={mySignatory.cedula}
            slot={signatureSlotFor(data.generatedContent, mySignatory)}
            boxAspect={signatureBoxAspect(data.generatedContent, data.signatureSlot)}
            placement={placement}
            onPlacementChange={setPlacement}
            signing={sign.isPending}
            onChange={() => setReview(null)}
            onConfirm={() => void handleSign()}
          />
        </aside>
      </div>
    </div>
  );
}

function SignedScreen({ code, contractId, title }: { code: string; contractId: string; title: string }) {
  const { runAction } = useAction();

  async function download() {
    await runAction({
      run: () => downloadFromApi(`/contracts/${contractId}/pdf`, `${code}.pdf`),
      pending: 'Preparando el PDF…',
      success: 'PDF descargado.',
      error: 'No se pudo descargar el PDF.',
    });
  }

  return (
    <div className="flex min-h-dvh animate-rise-in flex-col items-center justify-center gap-5 bg-slate-50 px-5 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-green-50 text-green-700">
        <CircleCheck className="size-8" aria-hidden="true" />
      </span>
      <h1 className="text-2xl font-semibold">Firma registrada</h1>
      <p className="max-w-md text-slate-500">
        Firmaste <b className="text-slate-900">{title}</b> el {formatDate(new Date())}. Te avisaremos cuando todas las partes hayan firmado.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button icon={<Download />} onClick={() => void download()}>Descargar PDF</Button>
        <ButtonLink to="/app/firmas" viewTransition variant="primary">Volver a mis firmas</ButtonLink>
      </div>
      <Link to={`/app/contratos/${contractId}`} viewTransition className="text-sm text-vino-600">Ver el contrato</Link>
    </div>
  );
}
