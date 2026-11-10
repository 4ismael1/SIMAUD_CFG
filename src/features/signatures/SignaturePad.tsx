import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

export interface SignaturePadHandle {
  clear: () => void;
  isEmpty: () => boolean;
  toBlob: () => Promise<Blob | null>;
}

interface SignaturePadProps {
  onChange: (hasInk: boolean) => void;
  label: string;
}

const STROKE_COLOR = '#0f172a';
const STROKE_WIDTH = 2.4;
/** Ignore accidental taps: a signature needs at least this many points. */
const MIN_POINTS = 12;

/** Canvas signature pad using pointer events (mouse, touch and pen), sharp on high-DPI screens. */
export const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(function SignaturePad({ onChange, label }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const pointCount = useRef(0);
  const [hasInk, setHasInk] = useState(false);

  const context = useCallback(() => canvasRef.current?.getContext('2d') ?? null, []);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = STROKE_COLOR;
    ctx.lineWidth = STROKE_WIDTH;
  }, []);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = context();
    if (!canvas || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    pointCount.current = 0;
    setHasInk(false);
    onChange(false);
  }, [context, onChange]);

  useEffect(() => {
    resize();
    // Resizing wipes the canvas, so it also clears the signature (the user is told to sign again).
    const observer = new ResizeObserver(() => {
      resize();
      pointCount.current = 0;
      setHasInk(false);
      onChange(false);
    });
    if (canvasRef.current) observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [resize, onChange]);

  useImperativeHandle(ref, () => ({
    clear,
    isEmpty: () => !hasInk,
    toBlob: () => new Promise((resolve) => canvasRef.current?.toBlob((blob) => resolve(blob), 'image/png') ?? resolve(null)),
  }));

  function pointFrom(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    lastPoint.current = pointFrom(event);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = context();
    if (!drawing.current || !ctx || !lastPoint.current) return;
    const point = pointFrom(event);
    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPoint.current = point;
    pointCount.current += 1;
    if (!hasInk && pointCount.current >= MIN_POINTS) {
      setHasInk(true);
      onChange(true);
    }
  }

  function handlePointerUp() {
    drawing.current = false;
    lastPoint.current = null;
  }

  return (
    <div className="relative h-48 rounded-xl border-[1.5px] border-dashed border-slate-300 bg-white sm:h-52">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={label}
        className="absolute inset-0 h-full w-full cursor-crosshair touch-none rounded-xl"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
      <span className="pointer-events-none absolute right-6 bottom-9 left-6 border-t border-slate-300" aria-hidden="true" />
      {!hasInk && (
        <span className="pointer-events-none absolute bottom-3 left-6 text-xs text-slate-400">
          Firma dentro del recuadro con el ratón, el panel táctil o el dedo
        </span>
      )}
    </div>
  );
});
