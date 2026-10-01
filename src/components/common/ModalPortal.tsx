import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

export const ModalPortal = ({ children }: { children: ReactNode }) => {
  if (typeof document === 'undefined') return null;

  return createPortal(children, document.body);
};
