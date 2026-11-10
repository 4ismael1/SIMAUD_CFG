import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Minus, Move, PenLine, Plus, RotateCcw, Undo2 } from 'lucide-react';
import { Button, Dialog } from '../../ui';
import { formatCedula, formatDateTime } from '../../lib/format';
import type { SignaturePlacement } from '../../lib/api/types';
import type { SignatureSlotNode } from '../../lib/rich-doc/types';
import { AUTO_PLACEMENT, SCALE_RANGE, clampPlacement, placedRect } from './signature-placement';

/** On-screen width of the box; its height follows the real proportions of the PDF box. */
const BOX_WIDTH = 300;
const NUDGE = 0.02;

interface SignaturePreviewDialogProps {
  open: boolean;
  imageUrl: string | null;
  name: string;
  cedula: string | null;
  slot: SignatureSlotNode | null;
  /** Width ÷ height of the signature area in the PDF. */
  boxAspect: number;
  placement: SignaturePlacement;
  onPlacementChange: (placement: SignaturePlacement) => void;
  signing: boolean;
  onChange: () => void;
  onConfirm: () => void;
}

/**
 * Last step before signing: the signature inside its box with the proportions of the PDF. The signer
 * can drag it and change its size (never outside the box); the server applies the same rules.
 */
export function SignaturePreviewDialog({
  open,
  imageUrl,
  name,
  cedula,
  slot,
  boxAspect,
  placement,
  onPlacementChange,
  signing,
  onChange,
  onConfirm,
}: SignaturePreviewDialogProps) {
  const showName = slot?.attrs.showName !== false;
  const showId = slot?.attrs.showId !== false;
  const box = { width: BOX_WIDTH, height: BOX_WIDTH / boxAspect };
  const [image, setImage] = useState<{ width: number; height: number } | null>(null);
  const drag = useRef<{ pointerX: number; pointerY: number; start: SignaturePlacement } | null>(null);

  useEffect(() => {
    if (!imageUrl) return;
    const element = new Image();
    element.onload = () => setImage({ width: element.naturalWidth, height: element.naturalHeight });
    element.src = imageUrl;
  }, [imageUrl]);

  const update = (next: SignaturePlacement) => onPlacementChange(image ? clampPlacement(next, image, box) : next);
  const rect = image ? placedRect(placement, image, box) : null;

  function handlePointerDown(event: PointerEvent<HTMLImageElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerX: event.clientX, pointerY: event.clientY, start: placement };
  }

  function handlePointerMove(event: PointerEvent<HTMLImageElement>) {
    const start = drag.current;
    if (!start) return;
    update({
      ...start.start,
      x: start.start.x + (event.clientX - start.pointerX) / box.width,
      y: start.start.y + (event.clientY - start.pointerY) / box.height,
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLImageElement>) {
    const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    update({ ...placement, x: placement.x + move[0] * NUDGE, y: placement.y + move[1] * NUDGE });
  }

  const setScale = (scale: number) => update({ ...placement, scale: Math.min(SCALE_RANGE.max, Math.max(SCALE_RANGE.min, scale)) });
  const isAuto = placement.x === AUTO_PLACEMENT.x && placement.y === AUTO_PLACEMENT.y && placement.scale === AUTO_PLACEMENT.scale;

  return (
    <Dialog
      open={open}
      onClose={onChange}
      title="Así quedará tu firma en el contrato"
      description="Arrástrala para colocarla y ajusta su tamaño. Después de confirmar queda registrada con la fecha y la hora."
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
      <div className="rounded-xl border border-slate-200 bg-[#fffdf8] px-4 py-7 shadow-inner">
        <div className="mx-auto flex flex-col items-center text-center font-serif text-[13px] leading-snug text-slate-900" style={{ width: box.width }}>
          <div
            className="relative rounded-sm outline-1 outline-offset-2 outline-slate-300 outline-dashed"
            style={{ width: box.width, height: box.height }}
          >
            {imageUrl && rect && (
              <img
                src={imageUrl}
                alt={`Firma de ${name}. Usa las flechas para moverla.`}
                tabIndex={0}
                draggable={false}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={() => (drag.current = null)}
                onPointerCancel={() => (drag.current = null)}
                onKeyDown={handleKeyDown}
                className="absolute animate-pop-in cursor-grab touch-none rounded-sm select-none hover:bg-vino-50/40 focus-visible:outline-2 focus-visible:outline-vino-500 active:cursor-grabbing"
                style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
              />
            )}
          </div>
          <span className="block h-px w-full bg-slate-800" aria-hidden="true" />
          {showName && <span className="mt-1.5">{name}</span>}
          {showId && <span>C.I. {cedula ? formatCedula(cedula) : '[cédula]'}</span>}
          <span className="text-[11px] text-slate-600">{formatDateTime(new Date())}</span>
          {slot?.attrs.label && <span className="font-bold">{slot.attrs.label}</span>}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <Move className="size-3.5" aria-hidden="true" />
          Arrastra la firma o usa las flechas
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="ghost" icon={<Minus />} aria-label="Firma más pequeña" onClick={() => setScale(placement.scale - 0.05)} />
          <input
            type="range"
            min={SCALE_RANGE.min}
            max={SCALE_RANGE.max}
            step={0.01}
            value={placement.scale}
            onChange={(event) => setScale(Number(event.target.value))}
            aria-label="Tamaño de la firma"
            className="w-28 accent-vino-600"
          />
          <Button size="sm" variant="ghost" icon={<Plus />} aria-label="Firma más grande" onClick={() => setScale(placement.scale + 0.05)} />
          <Button size="sm" variant="ghost" icon={<RotateCcw />} disabled={isAuto} onClick={() => onPlacementChange(AUTO_PLACEMENT)}>
            Restablecer
          </Button>
        </div>
      </div>
      {!slot && (
        <p className="mt-3 text-xs text-slate-500">Este documento no tiene casillas de firma: tu firma se añadirá al final, con este mismo formato.</p>
      )}
    </Dialog>
  );
}
