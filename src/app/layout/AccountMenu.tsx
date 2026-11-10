import { ChevronsUpDown, LogOut, Settings, User as UserIcon } from 'lucide-react';
import { Avatar, Badge, Menu, cn, type MenuItem } from '../../ui';
import { roleStatus } from '../../lib/api/status';
import type { User } from '../../lib/api/types';

interface AccountMenuProps {
  user: User;
  avatarUrl: string | null;
  collapsed: boolean;
  onLogout: () => void;
}

/** Who is signed in, at the foot of the sidebar, with the account actions one click away. */
export function AccountMenu({ user, avatarUrl, collapsed, onLogout }: AccountMenuProps) {
  const role = roleStatus[user.role];

  const items: MenuItem[] = [
    { label: 'Mi perfil', icon: <UserIcon />, to: '/app/perfil' },
    ...(user.role === 'admin' ? [{ label: 'Configuración', icon: <Settings />, to: '/app/configuracion' }] : []),
    { label: 'Cerrar sesión', icon: <LogOut />, onSelect: onLogout, danger: true, separatorBefore: true },
  ];

  const header = (
    <div className="flex items-center gap-3">
      <Avatar name={user.name} src={avatarUrl} tone="brand" className="size-10 text-sm" />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
        <p className="truncate text-xs text-slate-500">{user.email}</p>
        <Badge tone={role.tone} className="mt-1.5 px-2 py-0.5 text-[11px]">
          {role.label}
        </Badge>
      </div>
    </div>
  );

  return (
    <Menu
      block
      align="start"
      placement={collapsed ? 'right' : 'top'}
      header={header}
      items={items}
      trigger={(triggerProps) => (
        <button
          type="button"
          {...triggerProps}
          aria-label={collapsed ? `Cuenta de ${user.name}` : undefined}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-lg text-left transition-colors hover:bg-slate-100 aria-expanded:bg-slate-100',
            collapsed ? 'justify-center p-1.5' : 'p-2',
          )}
        >
          <span className="relative shrink-0">
            <Avatar name={user.name} src={avatarUrl} tone="brand" />
            <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-white bg-green-500" aria-hidden="true" />
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] leading-tight font-semibold text-slate-900">{user.name}</span>
                <span className="block truncate text-xs text-slate-500">{user.email}</span>
              </span>
              <ChevronsUpDown className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
            </>
          )}
        </button>
      )}
    />
  );
}
