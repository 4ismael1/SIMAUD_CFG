import { PenLine, Undo2 } from 'lucide-react';
import { Button, Dialog } from '../../ui';
import { formatCedula, formatDateTime } from '../../lib/format';
import type { SignatureSlotNode } from '../../lib/rich-doc/types';

interface SignaturePreviewDialogProps {
  open: boolean;
  imageUrl: string | null;
  name: string;
  cedula: string | null;
  slot: SignatureSlotNode | null;
  signing: boolean;
  onChange: () => void;
  onConfirm: () => void;
}

/**
 * Last step before signing: the signature inside its box, drawn with the proportions of the PDF
 * (signature area above the line, then name, ID, date and the box label), so the signer sees exactly
 * what will be stamped and can go back to change it.
 */
export function SignaturePreviewDialog({ open, imageUrl, name, cedula, slot, signing, onChange, onConfirm }: SignaturePreviewDialogProps) {
  const showName = slot?.attrs.showName !== false;
  const showId = slot?.attrs.showId !== false;

  return (
    <Dialog
      open={open}
      onClose={onChange}
      title="Así quedará tu firma en el contrato"
      description="Revísala antes de firmar. Después de confirmar queda registrada con la fecha y la hora."
      footer={
        <>
          <Button icon={<Undo2 />} onClick={onChange} disabled={signing}>
            Cambiar firma
          </Button>
          <Button variant="primary" icon={<PenLine />} loading={signing} onClick={onConfirm}>
            Confirmar y firmar
          </Button>
        </>
      }
    >
      <div className="rounded-xl border border-slate-200 bg-[#fffdf8] px-6 py-8 shadow-inner">
        <div className="mx-auto flex w-full max-w-[300px] flex-col items-center text-center font-serif text-[13px] leading-snug text-slate-900">
          {/* Same box as the PDF: the image fits 80 % of the width and a fixed height above the line. */}
          <div className="flex h-[56px] w-[80%] items-end justify-center">
            {imageUrl && <img src={imageUrl} alt={`Firma de ${name}`} className="max-h-full max-w-full animate-pop-in object-contain" />}
          </div>
          <span className="mt-0.5 block h-px w-[80%] bg-slate-800" aria-hidden="true" />
          {showName && <span className="mt-1.5">{name}</span>}
          {showId && <span>C.I. {cedula ? formatCedula(cedula) : '[cédula]'}</span>}
          <span className="text-[11px] text-slate-600">{formatDateTime(new Date())}</span>
          {slot?.attrs.label && <span className="font-bold">{slot.attrs.label}</span>}
        </div>
      </div>
      {!slot && (
        <p className="mt-3 text-xs text-slate-500">
          Este documento no tiene casillas de firma: tu firma se añadirá al final, con este mismo formato.
        </p>
      )}
    </Dialog>
  );
}
