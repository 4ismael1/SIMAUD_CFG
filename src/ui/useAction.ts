import { useCallback, useState } from 'react';
import { errorMessage } from '../lib/errors';
import { useConfirm, type ConfirmOptions } from './Confirm';
import { useToast } from './Toast';

/*
 * Standard way to run any user action (see docs/CODE_STANDARDS.md, «Acciones»):
 *   confirm (optional) → run → toast with the result (+ «Deshacer» when reversible).
 * A button never finishes silently: success and failure are always announced.
 */

export interface ActionOptions<T> {
  /** Ask before running (required for destructive or hard-to-reverse actions). */
  confirm?: ConfirmOptions;
  /** The work. Receives the reason when `confirm.reasonLabel` was set. */
  run: (reason?: string) => Promise<T>;
  /** Show a "working…" toast that turns into the result (use for slow actions: exports, sending). */
  pending?: string;
  success: string | ((value: T) => string);
  /** Fallback when the API gives no readable message. */
  error?: string;
  /** Offer «Deshacer» in the success toast. */
  undo?: { run: () => Promise<unknown>; success: string };
}

export type ActionResult<T> = { ok: true; value: T } | { ok: false; cancelled: boolean };

export function useAction() {
  const confirm = useConfirm();
  const toast = useToast();
  const [running, setRunning] = useState(false);

  const runAction = useCallback(
    async <T,>(options: ActionOptions<T>): Promise<ActionResult<T>> => {
      let reason: string | undefined;
      if (options.confirm) {
        const answer = await confirm(options.confirm);
        if (answer === false) return { ok: false, cancelled: true };
        if (typeof answer === 'string') reason = answer;
      }

      const undo = options.undo;
      const undoAction = undo
        ? {
            label: 'Deshacer',
            onClick: () => {
              void undo
                .run()
                .then(() => toast.success(undo.success))
                .catch((error: unknown) => toast.error(errorMessage(error, 'No se pudo deshacer.')));
            },
          }
        : undefined;

      setRunning(true);
      try {
        let value: T;
        if (options.pending) {
          value = await toast.promise(() => options.run(reason), {
            loading: options.pending,
            success: options.success,
            error: (error) => errorMessage(error, options.error),
            successOptions: undoAction ? { action: undoAction } : undefined,
          });
        } else {
          value = await options.run(reason);
          const text = typeof options.success === 'function' ? options.success(value) : options.success;
          toast.success(text, undoAction ? { action: undoAction } : undefined);
        }
        return { ok: true, value };
      } catch (error) {
        if (!options.pending) toast.error(errorMessage(error, options.error));
        return { ok: false, cancelled: false };
      } finally {
        setRunning(false);
      }
    },
    [confirm, toast],
  );

  return { runAction, running };
}
