import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, BellOff } from 'lucide-react';
import { EmptyState, IconButton, Skeleton, cn } from '../../ui';
import {
  useNotifications,
  useReadAllNotifications,
  useReadNotification,
  useServerEvents,
  useUnreadCount,
} from '../../lib/api/hooks/notifications';
import type { Notification } from '../../lib/api/lifecycle-types';
import { formatRelative } from '../../lib/format';

const PANEL_SIZE = 15;

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
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
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
        {unreadCount > 0 && <span className="absolute top-1.5 right-1.5 size-2 rounded-full border-2 border-white bg-vino-600" aria-hidden="true" />}
      </IconButton>
      {open && <NotificationPanel onClose={() => setOpen(false)} />}
    </div>
  );
}

function NotificationPanel({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const notifications = useNotifications({ pageSize: PANEL_SIZE });
  const markRead = useReadNotification();
  const markAllRead = useReadAllNotifications();
  const items = notifications.data?.data;
  const hasUnread = items?.some((item) => !item.readAt) ?? false;

  function openNotification(notification: Notification) {
    if (!notification.readAt) markRead.mutate(notification.id);
    const path = appPathFor(notification.link);
    if (path) {
      onClose();
      navigate(path);
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Notificaciones"
      className="absolute top-full right-0 z-30 mt-2 flex max-h-[min(560px,80dvh)] w-[min(380px,calc(100vw-2rem))] animate-pop-in flex-col rounded-xl border border-slate-200 bg-white shadow-pop"
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <h2 className="font-semibold">Notificaciones</h2>
        {hasUnread && (
          <button type="button" className="text-[13px] font-medium text-vino-600 hover:text-vino-700" onClick={() => markAllRead.mutate(undefined)}>
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
            <li key={notification.id}>
              <button
                type="button"
                onClick={() => openNotification(notification)}
                className={cn('flex w-full gap-3 border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50', !notification.readAt && 'bg-vino-50/40')}
              >
                <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', notification.readAt ? 'bg-transparent' : 'bg-vino-600')} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-900">{notification.title}</span>
                  <span className="block text-[13px] text-slate-600">{notification.message}</span>
                  <span className="mt-1 block text-xs text-slate-400">{formatRelative(notification.createdAt)}</span>
                  {!notification.readAt && <span className="sr-only">(sin leer)</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
