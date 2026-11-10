import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button, IconButton } from './Button';
import { Field, Textarea } from './Field';
import { cn } from './cn';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** "drawer" slides in from the right; "dialog" is centered. */
  variant?: 'dialog' | 'drawer';
  size?: 'sm' | 'md' | 'lg';
}

const DIALOG_WIDTHS = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-3xl' };

/**
 * Accessible modal built on the native <dialog> element:
 * focus is trapped by the browser, Escape closes, the page behind becomes inert.
 */
export function Dialog({ open, onClose, title, description, children, footer, variant = 'dialog', size = 'md' }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function handleCancel(event: React.SyntheticEvent) {
    event.preventDefault();
    onClose();
  }

  function handleBackdropClick(event: React.MouseEvent<HTMLDialogElement>) {
    if (event.target === dialogRef.current) onClose();
  }

  const isDrawer = variant === 'drawer';

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={handleCancel}
      onClick={handleBackdropClick}
      className={cn(
        'm-0 max-h-none max-w-none bg-transparent p-0 text-slate-900 backdrop:animate-fade-in',
        isDrawer ? 'ml-auto h-dvh w-full sm:w-[480px]' : 'm-auto w-[calc(100%-2rem)]',
        !isDrawer && DIALOG_WIDTHS[size],
      )}
    >
      {open && (
        <div
          className={cn(
            'flex flex-col bg-white shadow-pop',
            isDrawer ? 'h-full animate-slide-in-right' : 'max-h-[calc(100dvh-2rem)] animate-pop-in rounded-xl',
          )}
        >
          <div className="flex items-start gap-3 border-b border-slate-200 px-5 py-4">
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
              {description && <p id={descriptionId} className="mt-0.5 text-sm text-slate-500">{description}</p>}
            </div>
            <IconButton label="Cerrar" onClick={onClose}>
              <X />
            </IconButton>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && (
            <div className={cn('flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3', !isDrawer && 'rounded-b-xl')}>
              {footer}
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: string;
  tone?: 'danger' | 'primary';
  loading?: boolean;
  /** Ask for a free-text reason; confirmation is disabled until it has content. */
  reasonLabel?: string;
  /** Require typing this exact text (e.g. a contract code) before confirming. */
  confirmationText?: string;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  tone = 'primary',
  loading,
  reasonLabel,
  confirmationText,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (open) {
      setReason('');
      setTyped('');
    }
  }, [open]);

  const reasonMissing = Boolean(reasonLabel) && reason.trim().length === 0;
  const confirmationMissing = Boolean(confirmationText) && typed.trim() !== confirmationText;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            className={tone === 'danger' ? 'border-red-600 bg-red-600 text-white hover:bg-red-700 hover:text-white' : undefined}
            loading={loading}
            disabled={reasonMissing || confirmationMissing}
            onClick={() => onConfirm(reason.trim())}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {reasonLabel && (
          <Field label={reasonLabel} required>
            <Textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} />
          </Field>
        )}
        {confirmationText && (
          <Field label={<>Escribe <span className="font-mono font-semibold">{confirmationText}</span> para confirmar</>}>
            <input
              className="h-10 w-full rounded-lg border border-slate-300 px-3 font-mono text-sm"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
            />
          </Field>
        )}
      </div>
    </Dialog>
  );
}
