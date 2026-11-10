import { Suspense, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Menu as MenuIcon, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { IconButton, Logo, Spinner, cn } from '../../ui';
import { useAuth } from '../../lib/auth';
import { avatarUrlFor } from '../avatar';
import { NotificationBell } from './NotificationBell';
import { GlobalSearch } from './CommandPalette';
import { Sidebar } from './Sidebar';
import { useNavCounts } from './useNavCounts';
import { useSidebarCollapsed } from './useSidebarCollapsed';

/** Authenticated application frame: sidebar on desktop, drawer on phones, top bar everywhere. */
export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const counts = useNavCounts();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();

  if (!user) return null;

  const avatarUrl = avatarUrlFor(user);

  async function handleLogout() {
    await logout();
    navigate('/auth/login', { replace: true });
  }

  const sidebarProps = { user, avatarUrl, counts, onLogout: handleLogout };

  return (
    <div className="min-h-dvh lg:flex">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:shadow-pop">
        Saltar al contenido
      </a>

      {/* The rail lets tooltips and the account menu overflow, so it sits above the top bar. */}
      <aside
        className={cn(
          'sticky top-0 z-30 hidden h-dvh shrink-0 border-r border-slate-200 transition-[width] duration-200 ease-out lg:block',
          collapsed ? 'w-[68px]' : 'w-[256px]',
        )}
      >
        <Sidebar {...sidebarProps} collapsed={collapsed} />
      </aside>

      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <Sidebar {...sidebarProps} onNavigate={() => setDrawerOpen(false)} />
      </MobileDrawer>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-slate-200 bg-white/95 h-[57px] px-4 backdrop-blur sm:px-6 lg:px-7">
          <IconButton label="Abrir menú" className="lg:hidden" onClick={() => setDrawerOpen(true)}>
            <MenuIcon />
          </IconButton>
          <Logo variant="mark" className="h-7 lg:hidden" />
          <IconButton
            label={collapsed ? 'Expandir el menú lateral' : 'Contraer el menú lateral'}
            className="hidden lg:inline-flex"
            aria-keyshortcuts="Control+B Meta+B"
            aria-pressed={collapsed}
            onClick={toggleCollapsed}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </IconButton>
          <GlobalSearch />
          <NotificationBell />
        </header>

        <main id="contenido" className="mx-auto flex w-full max-w-[1360px] min-w-0 flex-col gap-5 px-4 py-6 sm:px-6 lg:px-7">
          <Suspense fallback={<PageFallback />}>
            {/* Keyed by path so every navigation replays the entrance animation. */}
            <div key={location.pathname} className="flex min-w-0 animate-page-in flex-col gap-5">
              <Outlet />
            </div>
          </Suspense>
        </main>
      </div>
    </div>
  );
}

function PageFallback() {
  return (
    <div className="grid min-h-[40vh] place-items-center">
      <Spinner label="Cargando página" />
    </div>
  );
}

function MobileDrawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const location = useLocation();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    onClose();
    // Close the drawer whenever the route changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  return (
    <dialog
      ref={dialogRef}
      aria-label="Menú principal"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
      className="m-0 h-dvh max-h-none w-[280px] max-w-[85vw] bg-transparent p-0 lg:hidden"
    >
      {open && (
        <div className="relative h-full animate-fade-in overflow-y-auto bg-white shadow-pop">
          <IconButton label="Cerrar menú" className="absolute top-3 right-3" onClick={onClose}>
            <X />
          </IconButton>
          {children}
        </div>
      )}
    </dialog>
  );
}
