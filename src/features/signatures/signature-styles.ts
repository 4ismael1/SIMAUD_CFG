/*
 * Handwriting fonts for typed signatures. Self-hosted (latin subset only) so they work under the strict CSP
 * and on a server without internet access. Licences: OFL-1.1, except Homemade Apple (Apache-2.0).
 * Importing this module pulls the font files into the signing page's chunk only.
 */
import '@fontsource/great-vibes/latin-400.css';
import '@fontsource/allura/latin-400.css';
import '@fontsource/alex-brush/latin-400.css';
import '@fontsource/mr-dafoe/latin-400.css';
import '@fontsource/herr-von-muellerhoff/latin-400.css';
import '@fontsource/homemade-apple/latin-400.css';
import '@fontsource/la-belle-aurore/latin-400.css';
import '@fontsource/sacramento/latin-400.css';

export interface SignatureStyle {
  /** Stable id stored in the user's preferences; never rename an existing one. */
  id: string;
  label: string;
  family: string;
  /** Each font draws at a different optical size; this normalizes them visually. */
  scale: number;
}

export const SIGNATURE_STYLES: SignatureStyle[] = [
  { id: 'herr-von-muellerhoff', label: 'Firma rápida', family: 'Herr Von Muellerhoff', scale: 1.25 },
  { id: 'great-vibes', label: 'Elegante', family: 'Great Vibes', scale: 1 },
  { id: 'mr-dafoe', label: 'Trazo firme', family: 'Mr Dafoe', scale: 1.05 },
  { id: 'alex-brush', label: 'Pincel', family: 'Alex Brush', scale: 1 },
  { id: 'allura', label: 'Clásica', family: 'Allura', scale: 1.05 },
  { id: 'la-belle-aurore', label: 'Natural', family: 'La Belle Aurore', scale: 0.85 },
  { id: 'sacramento', label: 'Fina', family: 'Sacramento', scale: 1.1 },
  { id: 'homemade-apple', label: 'Manuscrita', family: 'Homemade Apple', scale: 0.72 },
];

export const DEFAULT_SIGNATURE_STYLE = SIGNATURE_STYLES[0];
export const MAX_SIGNATURE_TEXT = 60;

export function styleById(id: string | null | undefined): SignatureStyle {
  return SIGNATURE_STYLES.find((style) => style.id === id) ?? DEFAULT_SIGNATURE_STYLE;
}

const RENDER_FONT_PX = 120;
const INK_COLOR = '#0f172a';
/** Same box the drawn signatures are scaled into (the API rejects larger images). */
const MAX_WIDTH = 1600;
const MAX_HEIGHT = 700;

/**
 * Renders the typed name in the chosen font to a transparent PNG, cropped to the text.
 * Waits for the font so the image never falls back to a system font.
 */
export async function renderTypedSignature(text: string, style: SignatureStyle): Promise<Blob | null> {
  const value = text.trim();
  if (!value) return null;

  const fontSize = Math.round(RENDER_FONT_PX * style.scale);
  const font = `${fontSize}px "${style.family}"`;
  await document.fonts.load(font, value);

  const measureCanvas = document.createElement('canvas');
  const measure = measureCanvas.getContext('2d');
  if (!measure) return null;
  measure.font = font;
  const metrics = measure.measureText(value);

  // Script fonts overhang their advance width; use the real ink box plus a margin.
  const left = Math.ceil(metrics.actualBoundingBoxLeft);
  const right = Math.ceil(metrics.actualBoundingBoxRight);
  const ascent = Math.ceil(metrics.actualBoundingBoxAscent);
  const descent = Math.ceil(metrics.actualBoundingBoxDescent);
  const margin = Math.round(fontSize * 0.15);
  const width = left + right + margin * 2;
  const height = ascent + descent + margin * 2;

  const scale = Math.min(1, MAX_WIDTH / width, MAX_HEIGHT / height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) return null;

  context.scale(scale, scale);
  context.font = font;
  context.fillStyle = INK_COLOR;
  context.textBaseline = 'alphabetic';
  context.fillText(value, margin + left, margin + ascent);

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}
