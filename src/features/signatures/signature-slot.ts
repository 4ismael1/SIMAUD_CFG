import { isRichDoc, type DocumentContent, type SignatureSlotNode } from '../../lib/rich-doc/types';

/** Label of the signature box the signer with this signing order fills (box n = signer n), if the document has boxes. */
export function signatureSlotFor(content: DocumentContent, signingOrder: number): SignatureSlotNode | null {
  if (!isRichDoc(content)) return null;
  const slots = content.content.flatMap((block) => (block.type === 'signatures' ? block.content : []));
  return slots[signingOrder - 1] ?? null;
}
