import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { ConfirmDialog } from './Dialog';

/*
 * Imperative confirmation: `if (await confirm({...})) doIt()`.
 * Use it before any destructive or hard-to-reverse action (delete, cancel, reject, revoke…).
 */

export interface ConfirmOptions {
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  /** "danger" for irreversible actions: red button plus a warning banner. */
  tone?: 'danger' | 'primary';
  /** Ask for a mandatory reason; it is returned instead of `true`. */
  reasonLabel?: string;
  /** Require typing this exact text (e.g. a contract code). */
  confirmationText?: string;
  details?: ReactNode;
}

/** `false` when cancelled; the reason (or `true`) when confirmed. */
export type ConfirmResult = false | true | string;

type ConfirmFn = (options: ConfirmOptions) => Promise<ConfirmResult>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [open, setOpen] = useState(false);
  const resolver = useRef<((result: ConfirmResult) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((next) => {
    // A new request settles any previous one as cancelled.
    resolver.current?.(false);
    setOptions(next);
    setOpen(true);
    return new Promise<ConfirmResult>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  function settle(result: ConfirmResult) {
    resolver.current?.(result);
    resolver.current = null;
    setOpen(false);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && (
        <ConfirmDialog
          open={open}
          onClose={() => settle(false)}
          onConfirm={(reason) => settle(options.reasonLabel ? reason : true)}
          title={options.title}
          description={options.description}
          confirmLabel={options.confirmLabel ?? 'Confirmar'}
          tone={options.tone}
          reasonLabel={options.reasonLabel}
          confirmationText={options.confirmationText}
        >
          {options.details}
        </ConfirmDialog>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm debe usarse dentro de <ConfirmProvider>.');
  return confirm;
}
