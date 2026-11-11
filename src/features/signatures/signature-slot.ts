import { isRichDoc, type DocumentContent, type SignatureSlotNode } from '../../lib/rich-doc/types';

const WITNESS_SLOT: SignatureSlotNode = { type: 'signatureSlot', attrs: { label: 'TESTIGO' } };

/**
 * The signature box this signatory fills, as the PDF does: by the box assigned in the contract (T19);
 * a witness/extra person gets the added «TESTIGO» box; older contracts without assignments use box n =
 * signing order n. Null when the document has no boxes at all.
 */
export function signatureSlotFor(
  content: DocumentContent,
  signatory: { signingOrder: number; slotIndex?: number | null; role?: string },
): SignatureSlotNode | null {
  if (!isRichDoc(content)) return null;
  const slots = content.content.flatMap((block) => (block.type === 'signatures' ? block.content : []));
  if (slots.length === 0) return null;
  if (typeof signatory.slotIndex === 'number') return slots[signatory.slotIndex] ?? null;
  if (signatory.slotIndex === null || signatory.role === 'witness') return WITNESS_SLOT;
  return slots[signatory.signingOrder - 1] ?? WITNESS_SLOT;
}
