import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, m, type PanInfo } from 'motion/react';
import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert, X } from 'lucide-react';
import { cn } from './cn';

/*
 * Toasts: every user action must end in visible feedback (see docs/CODE_STANDARDS.md, «Acciones»).
 * - success / error / info / warning for finished actions,
 * - promise() for work in progress: a "loading" toast that morphs into success or error,
 * - optional action button (e.g. «Deshacer») and description.
 */

type ToastTone = 'success' | 'error' | 'info' | 'warning' | 'loading';

export interface ToastOptions {
  description?: string;
  /** A single follow-up action, typically «Deshacer». Clicking it also closes the toast. */
  action?: { label: string; onClick: () => void };
  /** Milliseconds on screen; errors stay longer by default. */
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
  tone: ToastTone;
  message: string;
}

interface PromiseMessages<T> {
  loading: string;
  success: string | ((value: T) => string);
  error?: string | ((error: unknown) => string);
  successOptions?: ToastOptions;
}

export interface ToastApi {
  success: (message: string, options?: ToastOptions) => number;
  error: (message: string, options?: ToastOptions) => number;
  info: (message: string, options?: ToastOptions) => number;
  warning: (message: string, options?: ToastOptions) => number;
  /** Shows a loading toast while `work` runs, then turns it into success or error. Re-throws on failure. */
  promise: <T>(work: Promise<T> | (() => Promise<T>), messages: PromiseMessages<T>) => Promise<T>;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DEFAULT_DURATION: Record<ToastTone, number> = {
  success: 4500,
  info: 5000,
  warning: 7000,
  error: 8000,
  loading: 0,
};
const MAX_VISIBLE = 4;
/** Horizontal drag (px) that dismisses a toast. */
const SWIPE_DISMISS = 80;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [paused, setPaused] = useState(false);
  const nextId = useRef(1);
  const regionRef = useRef<HTMLElement>(null);

  /*
   * Modals use the native <dialog>, which sits in the browser's top layer: no z-index can beat it, so a
   * toast raised from inside a modal (e.g. a refused action) ended up blurred behind it. The region is a
   * manual popover, re-opened whenever a toast arrives so it becomes the newest top-layer element,
   * above any open dialog.
   */
  const newestId = toasts.at(-1)?.id;
  useEffect(() => {
    const region = regionRef.current;
    if (!region || newestId === undefined || typeof region.showPopover !== 'function') return;
    if (region.matches(':popover-open')) region.hidePopover();
    region.showPopover();
  }, [newestId]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback((tone: ToastTone, message: string, options: ToastOptions = {}) => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, tone, message, ...options }].slice(-MAX_VISIBLE));
    return id;
  }, []);

  const update = useCallback((id: number, changes: Partial<ToastItem>) => {
    setToasts((current) => current.map((toast) => (toast.id === id ? { ...toast, ...changes } : toast)));
  }, []);

  const api = useMemo<ToastApi>(() => {
    const promise = async <T,>(work: Promise<T> | (() => Promise<T>), messages: PromiseMessages<T>) => {
      const id = show('loading', messages.loading);
      try {
        const value = await (typeof work === 'function' ? work() : work);
        const text = typeof messages.success === 'function' ? messages.success(value) : messages.success;
        update(id, { tone: 'success', message: text, ...messages.successOptions });
        return value;
      } catch (error) {
        const fallback = error instanceof Error ? error.message : 'No se pudo completar la acción.';
        const text = typeof messages.error === 'function' ? messages.error(error) : (messages.error ?? fallback);
        update(id, { tone: 'error', message: text });
        throw error;
      }
    };
    return {
      success: (message, options) => show('success', message, options),
      error: (message, options) => show('error', message, options),
      info: (message, options) => show('info', message, options),
      warning: (message, options) => show('warning', message, options),
      promise,
      dismiss,
    };
  }, [show, update, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <section
        ref={regionRef}
        popover="manual"
        aria-label="Notificaciones"
        onPointerEnter={() => setPaused(true)}
        onPointerLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
        // Top centre, under the header: results of an action are seen where the eye is, not in a corner.
        className="pointer-events-none fixed inset-x-0 top-0 z-[60] m-0 flex h-auto max-h-none w-auto max-w-none flex-col items-center gap-2 overflow-visible border-0 bg-transparent p-3 text-inherit sm:pt-[68px]"
      >
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <ToastCard key={toast.id} toast={toast} paused={paused} onDismiss={() => dismiss(toast.id)} />
          ))}
        </AnimatePresence>
      </section>
    </ToastContext.Provider>
  );
}

const TONE_STYLES: Record<ToastTone, { icon: ReactNode; iconClass: string; bar: string }> = {
  success: { icon: <CircleCheck />, iconClass: 'bg-green-50 text-green-700', bar: 'bg-green-600' },
  error: { icon: <CircleAlert />, iconClass: 'bg-red-50 text-red-600', bar: 'bg-red-600' },
  info: { icon: <Info />, iconClass: 'bg-blue-50 text-blue-700', bar: 'bg-blue-600' },
  warning: { icon: <TriangleAlert />, iconClass: 'bg-amber-50 text-amber-700', bar: 'bg-amber-500' },
  loading: { icon: <LoaderCircle className="animate-spin" />, iconClass: 'bg-slate-100 text-slate-600', bar: 'bg-slate-400' },
};

function ToastCard({ toast, paused, onDismiss }: { toast: ToastItem; paused: boolean; onDismiss: () => void }) {
  const style = TONE_STYLES[toast.tone];
  const duration = toast.duration ?? DEFAULT_DURATION[toast.tone];
  const barRef = useRef<HTMLSpanElement>(null);
  const countdown = useRef<Animation | null>(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  // Countdown with the Web Animations API (not CSS): the global reduced-motion rule would make a CSS
  // animation end instantly and close the toast before anyone could read it.
  useEffect(() => {
    const bar = barRef.current;
    if (!bar || duration <= 0 || toast.tone === 'loading') return;
    const animation = bar.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration, fill: 'forwards' });
    animation.onfinish = () => dismissRef.current();
    countdown.current = animation;
    return () => animation.cancel();
  }, [duration, toast.tone, toast.message]);

  useEffect(() => {
    if (paused) countdown.current?.pause();
    else countdown.current?.play();
  }, [paused]);

  function handleDragEnd(_event: unknown, info: PanInfo) {
    if (Math.abs(info.offset.x) > SWIPE_DISMISS || Math.abs(info.velocity.x) > 600) onDismiss();
  }

  return (
    <m.div
      layout
      role={toast.tone === 'error' ? 'alert' : 'status'}
      aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
      initial={{ opacity: 0, y: -24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -16, scale: 0.96, transition: { duration: 0.18, ease: 'easeIn' } }}
      transition={{ type: 'spring', duration: 0.42, bounce: 0.12 }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.5}
      onDragEnd={handleDragEnd}
      className="toast-card pointer-events-auto relative flex w-full max-w-[380px] cursor-grab touch-pan-y items-start gap-3 overflow-hidden rounded-xl border border-slate-200 bg-white py-3 pr-3 pl-3.5 text-sm text-slate-900 shadow-pop active:cursor-grabbing"
    >
      <span className={cn('relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-full [&_svg]:size-[18px]', style.iconClass)}>
        {/* The icon morphs (scale + blur) when a loading toast resolves. */}
        <AnimatePresence mode="popLayout" initial={false}>
          <m.span
            key={toast.tone}
            className="grid place-items-center"
            initial={{ opacity: 0, scale: 0.3, filter: 'blur(4px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.3, filter: 'blur(4px)' }}
            transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
            aria-hidden="true"
          >
            {style.icon}
          </m.span>
        </AnimatePresence>
      </span>

      <div className="min-w-0 flex-1 pt-1">
        <p className="leading-snug font-medium">{toast.message}</p>
        {toast.description && <p className="mt-0.5 text-[13px] leading-snug text-slate-500">{toast.description}</p>}
        {toast.action && toast.tone !== 'loading' && (
          <button
            type="button"
            onClick={() => {
              toast.action?.onClick();
              onDismiss();
            }}
            className="mt-1.5 text-[13px] font-semibold text-vino-600 hover:text-vino-700"
          >
            {toast.action.label}
          </button>
        )}
      </div>

      {toast.tone !== 'loading' && (
        <button type="button" aria-label="Cerrar aviso" onClick={onDismiss} className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
          <X className="size-4" />
        </button>
      )}

      {/* The countdown bar drives auto-dismiss; hovering or focusing the toasts pauses it. */}
      {duration > 0 && toast.tone !== 'loading' && (
        <span ref={barRef} aria-hidden="true" className={cn('absolute inset-x-0 bottom-0 h-[3px] origin-left opacity-60', style.bar)} />
      )}
    </m.div>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast debe usarse dentro de <ToastProvider>.');
  return api;
}
