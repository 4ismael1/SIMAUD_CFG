import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, RotateCcw, Smartphone, Undo2, X } from 'lucide-react';
import { Button, IconButton } from '../../ui';
import { SignaturePad, type SignaturePadHandle } from './SignaturePad';

interface SignatureFullscreenProps {
  open: boolean;
  signerName: string;
  onClose: () => void;
  /** Receives the cropped PNG when the user accepts the drawing. */
  onAccept: (signature: Blob) => void;
}

/**
 * Full-screen drawing surface for signing comfortably on phones and tablets.
 * Built on the native <dialog> so focus is trapped and Escape closes it.
 */
export function SignatureFullscreen({ open, signerName, onClose, onAccept }: SignatureFullscreenProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const padRef = useRef<SignaturePadHandle>(null);
  const [hasInk, setHasInk] = useState(false);
  const [saving, setSaving] = useState(false);
  const handleInkChange = useCallback((value: boolean) => setHasInk(value), []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  async function handleAccept() {
    setSaving(true);
    const blob = await padRef.current?.toBlob();
    setSaving(false);
    if (!blob) return;
    onAccept(blob);
  }

  return (
    <dialog
      ref={dialogRef}
      aria-label={`Firmar a pantalla completa como ${signerName}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="m-0 h-dvh max-h-none w-full max-w-none bg-slate-100 p-0 text-slate-900 backdrop:bg-slate-900/60"
    >
      {open && (
        <div className="flex h-full animate-fade-in flex-col">
          <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold tracking-wider text-vino-600 uppercase">Firma ampliada</p>
              <p className="truncate font-semibold">{signerName}</p>
            </div>
            <IconButton label="Cerrar sin guardar" onClick={onClose}>
              <X />
            </IconButton>
          </header>

          {/* Phones held upright get a hint: a signature is wide, landscape gives far more room. */}
          <p className="flex items-center justify-center gap-2 bg-vino-50 px-4 py-2 text-xs text-vino-700 landscape:hidden sm:hidden">
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Gira el teléfono en horizontal para tener más espacio
            <Smartphone className="size-3.5 rotate-90" aria-hidden="true" />
          </p>

          <div className="min-h-0 flex-1 p-3 sm:p-6">
            <SignaturePad
              ref={padRef}
              size="large"
              onChange={handleInkChange}
              label={`Área de firma ampliada de ${signerName}`}
              className="h-full border-slate-300 shadow-card sm:h-full"
              hint="Firma con el dedo, el lápiz o el ratón. Puedes borrar y repetir las veces que necesites."
            />
          </div>

          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
            <Button variant="ghost" icon={<Undo2 />} disabled={!hasInk} onClick={() => padRef.current?.clear()} className="mr-auto">
              Borrar
            </Button>
            <Button onClick={onClose}>Cancelar</Button>
            <Button variant="primary" icon={<Check />} disabled={!hasInk} loading={saving} onClick={() => void handleAccept()}>
              Usar esta firma
            </Button>
          </footer>
        </div>
      )}
    </dialog>
  );
}
