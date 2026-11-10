import { Link, NavLink } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Logo, cn } from '../../ui';
import type { User } from '../../lib/api/types';
import { navigationFor, type NavItem } from '../navigation';
import { AccountMenu } from './AccountMenu';

export type NavCounts = Partial<Record<NonNullable<NavItem['badge']>, number>>;

interface SidebarProps {
  user: User;
  avatarUrl: string | null;
  counts: NavCounts;
  /** Icon-only rail. Labels move to tooltips. */
  collapsed?: boolean;
  onNavigate?: () => void;
  onLogout: () => void;
}

export function Sidebar({ user, avatarUrl, counts, collapsed = false, onNavigate, onLogout }: SidebarProps) {
  const groups = navigationFor(user.role);
  const canCreateContract = user.role === 'admin' || user.role === 'gestor';

  return (
    <nav aria-label="Principal" className="flex h-full flex-col bg-white">
      <div className={cn('flex h-[57px] shrink-0 items-center border-b border-slate-100', collapsed ? 'justify-center' : 'px-5')}>
        <Logo variant={collapsed ? 'mark' : 'full'} className="h-8" />
      </div>

      <div className={cn('flex min-h-0 flex-1 flex-col gap-1 py-4', collapsed ? 'px-3' : 'overflow-y-auto px-3')}>
        {canCreateContract && <NewContractLink collapsed={collapsed} onNavigate={onNavigate} />}

        {groups.map((group, groupIndex) => (
          <div key={group.label ?? groupIndex} className="flex flex-col gap-0.5">
            {group.label && !collapsed && (
              <span className="px-3 pt-5 pb-1.5 text-[11px] font-semibold tracking-[0.08em] text-slate-400 uppercase">{group.label}</span>
            )}
            {group.label && collapsed && <span className="mx-2 my-2.5 border-t border-slate-200" aria-hidden="true" />}
            {group.items.map((item) => (
              <SidebarLink
                key={item.to}
                item={item}
                count={item.badge ? counts[item.badge] : undefined}
                collapsed={collapsed}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="shrink-0 border-t border-slate-200 p-3">
        <AccountMenu user={user} avatarUrl={avatarUrl} collapsed={collapsed} onLogout={onLogout} />
      </div>
    </nav>
  );
}

/** Label that appears beside a rail icon on hover or keyboard focus. */
function RailTooltip({ children }: { children: React.ReactNode }) {
  return (
    <span
      role="presentation"
      className={cn(
        'pointer-events-none absolute top-1/2 left-full z-40 ml-3 -translate-x-1 -translate-y-1/2 rounded-md bg-slate-900 px-2 py-1',
        'text-xs font-medium whitespace-nowrap text-white opacity-0 shadow-pop transition-[opacity,translate] duration-150',
        'group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100',
      )}
    >
      {children}
    </span>
  );
}

function NewContractLink({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  return (
    <Link
      to="/app/contratos/nuevo"
      onClick={onNavigate}
      aria-label={collapsed ? 'Nuevo contrato' : undefined}
      className={cn(
        'group relative mb-2 flex h-9 items-center justify-center gap-2 rounded-lg bg-vino-600 text-sm font-medium text-white',
        'shadow-[0_1px_2px_rgb(139_32_41/0.35),inset_0_1px_0_rgb(255_255_255/0.12)] transition-[background-color,transform] duration-150',
        'hover:bg-vino-700 active:scale-[0.98]',
      )}
    >
      <Plus className="size-4 shrink-0" aria-hidden="true" />
      {!collapsed && <span>Nuevo contrato</span>}
      {collapsed && <RailTooltip>Nuevo contrato</RailTooltip>}
    </Link>
  );
}

interface SidebarLinkProps {
  item: NavItem;
  count?: number;
  collapsed: boolean;
  onNavigate?: () => void;
}

function SidebarLink({ item, count, collapsed, onNavigate }: SidebarLinkProps) {
  const Icon = item.icon;
  const hasCount = count !== undefined && count > 0;

  return (
    <NavLink
      to={item.to}
      end={item.to === '/app'}
      onClick={onNavigate}
      aria-label={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          'group relative flex h-9 items-center gap-3 rounded-lg text-sm transition-colors duration-150',
          collapsed ? 'justify-center' : 'px-3',
          isActive ? 'bg-slate-100 font-semibold text-slate-900' : 'font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            aria-hidden="true"
            className={cn(
              'absolute top-1/2 -left-3 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-vino-600 transition-[opacity,scale] duration-200',
              isActive ? 'scale-y-100 opacity-100' : 'scale-y-0 opacity-0',
            )}
          />
          <span className="relative shrink-0">
            <Icon
              className={cn('size-[18px] transition-colors', isActive ? 'text-vino-600' : 'text-slate-400 group-hover:text-slate-600')}
              strokeWidth={isActive ? 2.2 : 2}
              aria-hidden="true"
            />
            {collapsed && hasCount && (
              <span className="absolute -top-1.5 -right-1.5 size-2.5 rounded-full border-2 border-white bg-vino-600" aria-hidden="true" />
            )}
          </span>
          {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
          {!collapsed && hasCount && (
            <span className="tabular grid h-5 min-w-5 place-items-center rounded-full bg-vino-600 px-1.5 text-[11px] font-semibold text-white">
              {count}
              <span className="sr-only"> pendientes</span>
            </span>
          )}
          {collapsed && (
            <RailTooltip>
              {item.label}
              {hasCount && <span className="ml-1.5 text-vino-200">{count}</span>}
            </RailTooltip>
          )}
        </>
      )}
    </NavLink>
  );
}
