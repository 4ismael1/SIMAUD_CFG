import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ban, Bell, BellOff, CalendarClock, CircleCheck, FilePen, PenLine, RefreshCcw, ShieldCheck, Trash2 } from 'lucide-react';
import { EmptyState, IconButton, Skeleton, cn, useAction } from '../../ui';
import {
  useDeleteNotification,
  useNotifications,
  useReadAllNotifications,
  useReadNotification,
  useServerEvents,
  useUnreadCount,
} from '../../lib/api/hooks/notifications';
import type { Notification } from '../../lib/api/lifecycle-types';
import { formatRelative } from '../../lib/format';

const PANEL_SIZE = 15;

/** Icon and colour of each kind of notice, so the list can be scanned at a glance. */
const TYPE_LOOK: Record<string, { icon: ReactNode; className: string }> = {
  signature_required: { icon: <PenLine />, className: 'bg-blue-50 text-blue-700' },
  approval_needed: { icon: <ShieldCheck />, className: 'bg-amber-50 text-amber-700' },
  approval_result: { icon: <CircleCheck />, className: 'bg-green-50 text-green-700' },
  contract_signed: { icon: <CircleCheck />, className: 'bg-green-50 text-green-700' },
  contract_expiring: { icon: <CalendarClock />, className: 'bg-amber-50 text-amber-700' },
  contract_cancelled: { icon: <Ban />, className: 'bg-slate-100 text-slate-600' },
  renewal_request: { icon: <RefreshCcw />, className: 'bg-violet-50 text-violet-700' },
  renewal_approved: { icon: <RefreshCcw />, className: 'bg-violet-50 text-violet-700' },
  renewal_rejected: { icon: <RefreshCcw />, className: 'bg-red-50 text-red-700' },
};
const DEFAULT_LOOK = { icon: <FilePen />, className: 'bg-slate-100 text-slate-600' };

/** «1», «2»… and «9+» beyond nine, like most apps. */
function badgeText(count: number) {
  return count > 9 ? '9+' : String(count);
}

/** The API stores front-end links without the /app prefix (e.g. /contratos/123). */
function appPathFor(link: string | null): string | null {
  if (!link || !link.startsWith('/') || link.startsWith('//')) return null;
  return link.startsWith('/app') ? link : `/app${link}`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const unread = useUnreadCount();
  const unreadCount = unread.data?.count ?? 0;

  useServerEvents();

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Element;
      // A confirmation dialog opened from the panel lives outside it; clicking there must not close the panel.
      if (target.closest?.('dialog')) return;
      if (!containerRef.current?.contains(target)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const label = unreadCount > 0 ? `Notificaciones, ${unreadCount} sin leer` : 'Notificaciones';

  return (
    <div ref={containerRef} className="relative">
      <IconButton label={label} className="relative" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((value) => !value)}>
        <Bell />
        {unreadCount > 0 && (
          <span
            key={unreadCount}
            className="absolute -top-0.5 -right-0.5 grid h-[18px] min-w-[18px] animate-pop-in place-items-center rounded-full border-2 border-white bg-vino-600 px-1 text-[10px] leading-none font-bold text-white tabular"
            aria-hidden="true"
          >
            {badgeText(unreadCount)}
          </span>
        )}
      </IconButton>
      {open && <NotificationPanel unreadCount={unreadCount} onClose={() => setOpen(false)} />}
    </div>
  );
}

function NotificationPanel({ unreadCount, onClose }: { unreadCount: number; onClose: () => void }) {
  const navigate = useNavigate();
  const notifications = useNotifications({ pageSize: PANEL_SIZE });
  const markRead = useReadNotification();
  const markAllRead = useReadAllNotifications();
  const removeOne = useDeleteNotification();
  const { runAction } = useAction();
  const items = notifications.data?.data;
  // The server count also covers notices beyond the first page.
  const hasUnread = unreadCount > 0 || (items?.some((item) => !item.readAt) ?? false);

  function openNotification(notification: Notification) {
    if (!notification.readAt) markRead.mutate(notification.id);
    const path = appPathFor(notification.link);
    if (path) {
      onClose();
      navigate(path);
    }
  }

  function removeNotification(notification: Notification) {
    void runAction({
      confirm: {
        title: '¿Borrar esta notificación?',
        description: `«${notification.title}» desaparecerá de tu lista. No se puede recuperar.`,
        confirmLabel: 'Borrar',
        tone: 'danger',
      },
      run: () => removeOne.mutateAsync(notification.id),
      success: 'Notificación borrada.',
    });
  }

  return (
    <div
      role="dialog"
      aria-label="Notificaciones"
      className="absolute top-full right-0 z-30 mt-2 flex max-h-[min(560px,80dvh)] w-[min(380px,calc(100vw-2rem))] animate-pop-in flex-col rounded-xl border border-slate-200 bg-white shadow-pop"
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <h2 className="font-semibold">Notificaciones</h2>
          <p className="text-xs text-slate-500">{unreadCount > 0 ? `${unreadCount} sin leer` : 'Todo al día'}</p>
        </div>
        {hasUnread && (
          <button type="button" className="text-[13px] font-medium text-vino-600 hover:text-vino-700" onClick={() =>
              void runAction({
                run: () => markAllRead.mutateAsync(undefined),
                success: 'Todas las notificaciones quedaron como leídas.',
              })
            }
          >
            Marcar todas como leídas
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {notifications.isPending && (
          <div className="flex flex-col gap-3 p-4">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        )}
        {items?.length === 0 && <EmptyState icon={<BellOff />} title="Sin notificaciones" description="Aquí verás avisos de firmas, aprobaciones y vencimientos." />}
        <ul>
          {items?.map((notification) => (
            <li key={notification.id} className={cn('group relative border-b border-slate-100', !notification.readAt && 'bg-vino-50/40')}>
              <button
                type="button"
                onClick={() => openNotification(notification)}
                className="flex w-full gap-3 px-4 py-3 pr-12 text-left hover:bg-slate-50"
              >
                <span className={cn('grid size-8 shrink-0 place-items-center rounded-full [&_svg]:size-4', (TYPE_LOOK[notification.type] ?? DEFAULT_LOOK).className)} aria-hidden="true">
                  {(TYPE_LOOK[notification.type] ?? DEFAULT_LOOK).icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                    {!notification.readAt && <span className="size-1.5 shrink-0 rounded-full bg-vino-600" aria-hidden="true" />}
                    <span className="truncate">{notification.title}</span>
                  </span>
                  <span className="block text-[13px] text-slate-600">{notification.message}</span>
                  <span className="mt-1 block text-xs text-slate-400">{formatRelative(notification.createdAt)}</span>
                  {!notification.readAt && <span className="sr-only">(sin leer)</span>}
                </span>
              </button>
              <IconButton
                size="sm"
                label="Borrar notificación"
                className="absolute top-2 right-2 opacity-100 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                onClick={() => removeNotification(notification)}
              >
                <Trash2 />
              </IconButton>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
