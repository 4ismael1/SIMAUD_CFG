import type { SignaturePlacement, SignatureSlotGeometry } from '../../lib/api/types';
import { PAPER_SIZES, resolvePage } from '../../lib/rich-doc/page';
import { isRichDoc, type DocumentContent } from '../../lib/rich-doc/types';

/** Same rules as the API (T18): centre relative to the box, size between half and the largest fit. */
export const AUTO_PLACEMENT: SignaturePlacement = { x: 0.5, y: 0.5, scale: 1 };
export const SCALE_RANGE = { min: 0.5, max: 1 } as const;

interface Size {
  width: number;
  height: number;
}

/** Size and top-left corner of the image inside the box, in the box's own units. */
export function placedRect(placement: SignaturePlacement, image: Size, box: Size) {
  const fit = Math.min(box.width / image.width, box.height / image.height) * placement.scale;
  const width = image.width * fit;
  const height = image.height * fit;
  const centre = clampPlacement(placement, image, box);
  return { left: centre.x * box.width - width / 2, top: centre.y * box.height - height / 2, width, height };
}

/** Keeps the whole image inside the box, exactly as the server does before stamping it. */
export function clampPlacement(placement: SignaturePlacement, image: Size, box: Size): SignaturePlacement {
  const scale = Math.min(SCALE_RANGE.max, Math.max(SCALE_RANGE.min, placement.scale));
  const fit = Math.min(box.width / image.width, box.height / image.height) * scale;
  const halfWidth = (image.width * fit) / (2 * box.width);
  const halfHeight = (image.height * fit) / (2 * box.height);
  const clamp = (value: number, half: number) => Math.min(1 - half, Math.max(half, value));
  return { x: clamp(placement.x, halfWidth), y: clamp(placement.y, halfHeight), scale };
}

/**
 * Width ÷ height of the signature area. Uses the geometry the API measured on the real PDF page; on an
 * older API falls back to the default two-column box of a Letter page (about 66 × 15 mm).
 */
export function signatureBoxAspect(content: DocumentContent, slot: SignatureSlotGeometry | null | undefined): number {
  if (!slot || slot.height <= 0) return 4.5;
  const page = resolvePage(isRichDoc(content) ? content.attrs?.page : undefined);
  const paper = PAPER_SIZES[page.size];
  return (slot.width * paper.widthMm) / (slot.height * paper.heightMm);
}
