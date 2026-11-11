export interface Point {
  x: number;
  y: number;
}

export interface InkBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const STROKE_COLOR = '#0f172a';

/**
 * The export redraws the strokes into this box with a fixed line width, so a signature drawn large and
 * one drawn small end up with the same visual weight in the PDF (and close to a typed signature).
 */
const EXPORT_BOX = { width: 900, height: 300 };
/** Line width of the exported strokes, in output pixels (~1 pt once fitted into a signature box). */
const EXPORT_STROKE = 8;

/** Redraws the strokes, cropped to the ink and fitted into EXPORT_BOX, and encodes them as PNG. */
export function exportStrokes(lines: Point[][], ink: InkBounds | null): Promise<Blob | null> {
  if (!ink || lines.length === 0) return Promise.resolve(null);

  const inkWidth = Math.max(1, ink.maxX - ink.minX);
  const inkHeight = Math.max(1, ink.maxY - ink.minY);
  const margin = EXPORT_STROKE * 2;
  const scale = Math.min((EXPORT_BOX.width - margin * 2) / inkWidth, (EXPORT_BOX.height - margin * 2) / inkHeight);
  const output = document.createElement('canvas');
  output.width = Math.round(inkWidth * scale + margin * 2);
  output.height = Math.round(inkHeight * scale + margin * 2);
  const context = output.getContext('2d');
  if (!context) return Promise.resolve(null);

  const place = (point: Point): Point => ({
    x: (point.x - ink.minX) * scale + margin,
    y: (point.y - ink.minY) * scale + margin,
  });
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = STROKE_COLOR;
  context.fillStyle = STROKE_COLOR;
  context.lineWidth = EXPORT_STROKE;

  for (const line of lines) {
    const points = line.map(place);
    const first = points[0]!;
    if (points.length === 1) {
      context.beginPath();
      context.arc(first.x, first.y, EXPORT_STROKE / 2, 0, Math.PI * 2);
      context.fill();
      continue;
    }
    // Same smoothing as on screen: quadratic curves through the midpoints of consecutive samples.
    context.beginPath();
    context.moveTo(first.x, first.y);
    for (let index = 1; index < points.length; index++) {
      const control = points[index - 1]!;
      const point = points[index]!;
      context.quadraticCurveTo(control.x, control.y, (control.x + point.x) / 2, (control.y + point.y) / 2);
    }
    context.lineTo(points.at(-1)!.x, points.at(-1)!.y);
    context.stroke();
  }
  return new Promise((resolve) => output.toBlob((blob) => resolve(blob), 'image/png'));
}
