import { NavLink } from 'react-router-dom';
import { ChevronsUpDown, LogOut, User as UserIcon } from 'lucide-react';
import { Avatar, Logo, Menu, cn } from '../../ui';
import { roleStatus } from '../../lib/api/status';
import type { User } from '../../lib/api/types';
import { navigationFor, type NavItem } from '../navigation';

export type NavCounts = Partial<Record<NonNullable<NavItem['badge']>, number>>;

interface SidebarProps {
  user: User;
  avatarUrl: string | null;
  counts: NavCounts;
  onNavigate?: () => void;
  onLogout: () => void;
}

export function Sidebar({ user, avatarUrl, counts, onNavigate, onLogout }: SidebarProps) {
  const groups = navigationFor(user.role);

  return (
    <nav aria-label="Principal" className="flex h-full flex-col gap-0.5 bg-white px-3 py-4">
      <div className="px-2.5 pb-5">
        <Logo />
      </div>

      {groups.map((group, groupIndex) => (
        <div key={group.label ?? groupIndex} className="flex flex-col gap-0.5">
          {group.label && (
            <span className="px-2.5 pt-4 pb-1.5 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
              {group.label}
            </span>
          )}
          {group.items.map((item) => (
            <SidebarLink key={item.to} item={item} count={item.badge ? counts[item.badge] : undefined} onNavigate={onNavigate} />
          ))}
        </div>
      ))}

      <div className="mt-auto pt-4">
        <Menu
          align="start"
          items={[
            { label: 'Mi perfil', icon: <UserIcon />, to: '/app/perfil' },
            { label: 'Cerrar sesión', icon: <LogOut />, onSelect: onLogout, separatorBefore: true },
          ]}
          trigger={(triggerProps) => (
            <button
              type="button"
              {...triggerProps}
              className="flex w-full items-center gap-2.5 rounded-xl border border-slate-200 p-2.5 text-left hover:bg-slate-50"
            >
              <Avatar name={user.name} src={avatarUrl} tone="brand" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold">{user.name}</span>
                <span className="block truncate text-xs text-slate-500">{roleStatus[user.role].label}</span>
              </span>
              <ChevronsUpDown className="size-4 text-slate-400" aria-hidden="true" />
            </button>
          )}
        />
      </div>
    </nav>
  );
}

function SidebarLink({ item, count, onNavigate }: { item: NavItem; count?: number; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === '/app'}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
          isActive ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={cn('size-[18px] shrink-0', isActive ? 'text-vino-600' : 'text-slate-400 group-hover:text-slate-500')} aria-hidden="true" />
          <span className="flex-1">{item.label}</span>
          {count !== undefined && count > 0 && (
            <span className="tabular rounded-full bg-vino-600 px-1.5 py-px text-[11px] font-bold text-white">
              {count}
              <span className="sr-only"> pendientes</span>
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}
