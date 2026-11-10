import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { TriangleAlert, X } from 'lucide-react';
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
 * The element stays open until the exit animation finishes, so closing is as smooth as opening.
 */
export function Dialog({ open, onClose, title, description, children, footer, variant = 'dialog', size = 'md' }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && mounted && !dialog.open) dialog.showModal();
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mounted]);

  function handleExitComplete() {
    dialogRef.current?.close();
    setMounted(false);
  }

  function handleCancel(event: React.SyntheticEvent) {
    event.preventDefault();
    onClose();
  }

  const isDrawer = variant === 'drawer';
  if (!mounted) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={handleCancel}
      className="m-0 h-dvh max-h-none w-full max-w-none overflow-hidden bg-transparent p-0 text-slate-900 backdrop:bg-transparent"
    >
      <AnimatePresence onExitComplete={handleExitComplete}>
        {open && (
          <m.div
            key="backdrop"
            className="fixed inset-0 bg-slate-900/45 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden="true"
          />
        )}
        {open && (
          <m.div
            key="panel"
            className={cn(
              'fixed flex flex-col bg-white shadow-pop',
              isDrawer
                ? 'inset-y-0 right-0 w-full sm:w-[480px]'
                : cn('inset-x-4 top-1/2 mx-auto max-h-[calc(100dvh-2rem)] rounded-xl', DIALOG_WIDTHS[size]),
            )}
            initial={isDrawer ? { x: '100%' } : { opacity: 0, scale: 0.96, y: '-46%' }}
            animate={isDrawer ? { x: 0 } : { opacity: 1, scale: 1, y: '-50%' }}
            exit={isDrawer ? { x: '100%' } : { opacity: 0, scale: 0.97, y: '-48%' }}
            transition={isDrawer ? { type: 'spring', duration: 0.4, bounce: 0 } : { type: 'spring', duration: 0.32, bounce: 0.1 }}
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
          </m.div>
        )}
      </AnimatePresence>
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
  /** Extra content between the description and the inputs (e.g. what will be affected). */
  children?: ReactNode;
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
  children,
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
        {tone === 'danger' && (
          <div className="flex items-center gap-3 rounded-lg border border-red-100 bg-red-50/60 px-3 py-2.5 text-sm text-red-800">
            {/* A short shake draws attention to an irreversible action. */}
            <m.span
              className="grid size-8 shrink-0 place-items-center rounded-full bg-red-100 text-red-600"
              initial={{ rotate: 0 }}
              animate={{ rotate: [0, -12, 10, -8, 6, 0] }}
              transition={{ duration: 0.5, delay: 0.15 }}
              aria-hidden="true"
            >
              <TriangleAlert className="size-4" />
            </m.span>
            Esta acción no se puede deshacer.
          </div>
        )}
        {children}
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
