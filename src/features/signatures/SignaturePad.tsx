import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type PointerEvent } from 'react';
import { cn } from '../../ui';
import { STROKE_COLOR, exportStrokes, type InkBounds, type Point } from './signature-export';

export interface SignaturePadHandle {
  clear: () => void;
  isEmpty: () => boolean;
  /** PNG cropped to the drawn strokes (plus a small margin), or null when empty. */
  toBlob: () => Promise<Blob | null>;
}

interface SignaturePadProps {
  onChange: (hasInk: boolean) => void;
  label: string;
  /** Classes for the outer box; controls the size (defaults to the inline height). */
  className?: string;
  /** Thicker stroke for the large full-screen pad. */
  size?: 'normal' | 'large';
  hint?: string;
}

const STROKE_WIDTH = { normal: 2.4, large: 3.2 };
/** Ignore accidental taps: a signature needs at least this many points. */
const MIN_POINTS = 12;

/**
 * Canvas signature pad using pointer events (mouse, touch and pen), sharp on high-DPI screens.
 * Strokes are smoothed with quadratic curves through the midpoints of consecutive samples.
 */
export const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(function SignaturePad(
  { onChange, label, className, size = 'normal', hint = 'Firma dentro del recuadro con el ratón, el lápiz o el dedo' },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const previousPoint = useRef<Point | null>(null);
  const previousMidpoint = useRef<Point | null>(null);
  const pointCount = useRef(0);
  const bounds = useRef<InkBounds | null>(null);
  /** Every stroke as the list of points sampled, kept to redraw the signature at export. */
  const strokes = useRef<Point[][]>([]);
  const [hasInk, setHasInk] = useState(false);
  const strokeWidth = STROKE_WIDTH[size];

  const getContext = useCallback(() => canvasRef.current?.getContext('2d') ?? null, []);

  const resetInk = useCallback(() => {
    pointCount.current = 0;
    bounds.current = null;
    strokes.current = [];
    setHasInk(false);
    onChange(false);
  }, [onChange]);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.scale(ratio, ratio);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = STROKE_COLOR;
    context.fillStyle = STROKE_COLOR;
    context.lineWidth = strokeWidth;
  }, [strokeWidth]);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    const context = getContext();
    if (!canvas || !context) return;
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.restore();
    resetInk();
  }, [getContext, resetInk]);

  useEffect(() => {
    resize();
    // Resizing wipes the canvas, so it also clears the signature (the user simply signs again).
    const observer = new ResizeObserver(() => {
      resize();
      resetInk();
    });
    if (canvasRef.current) observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [resize, resetInk]);

  useImperativeHandle(ref, () => ({
    clear,
    isEmpty: () => !hasInk,
    toBlob: () => exportStrokes(strokes.current, bounds.current),
  }));

  function pointFrom(event: PointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function extendBounds(point: Point) {
    const current = bounds.current;
    bounds.current = current
      ? {
          minX: Math.min(current.minX, point.x),
          minY: Math.min(current.minY, point.y),
          maxX: Math.max(current.maxX, point.x),
          maxY: Math.max(current.maxY, point.y),
        }
      : { minX: point.x, minY: point.y, maxX: point.x, maxY: point.y };
  }

  function registerPoint(point: Point) {
    extendBounds(point);
    pointCount.current += 1;
    if (!hasInk && pointCount.current >= MIN_POINTS) {
      setHasInk(true);
      onChange(true);
    }
  }

  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFrom(event);
    drawing.current = true;
    previousPoint.current = point;
    previousMidpoint.current = point;
    strokes.current.push([point]);

    // A dot, so a tap still leaves a visible mark (i, accents).
    const context = getContext();
    if (context) {
      context.beginPath();
      context.arc(point.x, point.y, strokeWidth / 2, 0, Math.PI * 2);
      context.fill();
    }
    registerPoint(point);
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const context = getContext();
    if (!drawing.current || !context || !previousPoint.current || !previousMidpoint.current) return;

    // Coalesced events give pens and fast strokes their full resolution.
    const samples = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent];
    const rect = event.currentTarget.getBoundingClientRect();

    for (const sample of samples) {
      const point = { x: sample.clientX - rect.left, y: sample.clientY - rect.top };
      const midpoint = { x: (previousPoint.current.x + point.x) / 2, y: (previousPoint.current.y + point.y) / 2 };
      context.beginPath();
      context.moveTo(previousMidpoint.current.x, previousMidpoint.current.y);
      context.quadraticCurveTo(previousPoint.current.x, previousPoint.current.y, midpoint.x, midpoint.y);
      context.stroke();
      previousPoint.current = point;
      previousMidpoint.current = midpoint;
      strokes.current.at(-1)?.push(point);
      registerPoint(point);
    }
  }

  function handlePointerUp() {
    drawing.current = false;
    previousPoint.current = null;
    previousMidpoint.current = null;
  }

  return (
    <div className={cn('relative h-48 rounded-xl border-[1.5px] border-dashed border-slate-300 bg-white sm:h-52', className)}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={label}
        className="absolute inset-0 h-full w-full cursor-crosshair touch-none rounded-xl select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
      <span className="pointer-events-none absolute right-[6%] bottom-[22%] left-[6%] border-t border-slate-300" aria-hidden="true" />
      <span className="pointer-events-none absolute bottom-[22%] left-[6%] -translate-y-full pb-1 font-serif text-xl text-slate-300" aria-hidden="true">
        ×
      </span>
      {!hasInk && (
        <span className="pointer-events-none absolute right-[6%] bottom-[8%] left-[6%] text-center text-xs text-slate-400">{hint}</span>
      )}
    </div>
  );
});
