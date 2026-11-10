import type { HTMLAttributes, ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert } from 'lucide-react';
import { cn } from './cn';
import logoFull from '../assets/logo-simaud.png';
import logoMark from '../assets/logo-columna.png';

export type Tone = 'neutral' | 'warning' | 'danger' | 'info' | 'success' | 'violet' | 'brand';

const TONE_BADGE: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-600',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-700',
  info: 'bg-blue-50 text-blue-700',
  success: 'bg-green-50 text-green-700',
  violet: 'bg-violet-50 text-violet-700',
  brand: 'bg-vino-50 text-vino-700',
};

interface BadgeProps {
  tone?: Tone;
  children: ReactNode;
  dot?: boolean;
  outlined?: boolean;
  strike?: boolean;
  className?: string;
}

export function Badge({ tone = 'neutral', children, dot = true, outlined, strike, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium leading-none',
        TONE_BADGE[tone],
        outlined && 'ring-1 ring-current ring-inset',
        strike && 'line-through',
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('min-w-0 rounded-xl border border-slate-200 bg-white shadow-card', className)} {...rest} />;
}

interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function CardHeader({ title, description, action, className }: CardHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 px-5 pt-5', className)}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold text-slate-900">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const ALERT_STYLES: Record<'info' | 'success' | 'warning' | 'danger', { box: string; Icon: typeof Info }> = {
  info: { box: 'border-blue-200 bg-blue-50 text-blue-900', Icon: Info },
  success: { box: 'border-green-200 bg-green-50 text-green-900', Icon: CircleCheck },
  warning: { box: 'border-amber-200 bg-amber-50 text-amber-900', Icon: TriangleAlert },
  danger: { box: 'border-red-200 bg-red-50 text-red-900', Icon: CircleAlert },
};

interface AlertProps {
  tone?: keyof typeof ALERT_STYLES;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function Alert({ tone = 'info', title, children, action, className }: AlertProps) {
  const { box, Icon } = ALERT_STYLES[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-lg border px-3.5 py-3 text-sm', box, className)}>
      <Icon className="mt-0.5 size-[18px] shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-0.5' : undefined}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

export function Spinner({ className, label = 'Cargando' }: { className?: string; label?: string }) {
  return (
    <span role="status" className={cn('inline-flex items-center gap-2 text-slate-500', className)}>
      <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-md bg-slate-200/70', className)} />;
}

interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-6 py-12 text-center', className)}>
      {icon && <span className="grid size-12 place-items-center rounded-xl bg-slate-100 text-slate-500 [&_svg]:size-6">{icon}</span>}
      <div>
        <p className="font-semibold text-slate-900">{title}</p>
        {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase() || '?';
}

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'dark' | 'brand' | 'muted';
  className?: string;
}

const AVATAR_SIZES = { sm: 'size-7 text-[11px]', md: 'size-8 text-xs', lg: 'size-16 text-xl' };
const AVATAR_TONES = { dark: 'bg-slate-900 text-white', brand: 'bg-vino-600 text-white', muted: 'bg-slate-200 text-slate-600' };

export function Avatar({ name, src, size = 'md', tone = 'dark', className }: AvatarProps) {
  const sizeClass = AVATAR_SIZES[size];
  if (src) {
    return <img src={src} alt="" className={cn('shrink-0 rounded-full object-cover', sizeClass, className)} />;
  }
  return (
    <span aria-hidden="true" className={cn('grid shrink-0 place-items-center rounded-full font-semibold', sizeClass, AVATAR_TONES[tone], className)}>
      {initialsOf(name)}
    </span>
  );
}

export function Logo({ variant = 'full', className }: { variant?: 'full' | 'mark'; className?: string }) {
  if (variant === 'mark') {
    return <img src={logoMark} alt="SIMAUD" className={cn('h-8 w-auto', className)} />;
  }
  return <img src={logoFull} alt="SIMAUD" className={cn('h-9 w-auto', className)} />;
}

interface KpiProps {
  label: ReactNode;
  value: ReactNode;
  icon?: ReactNode;
  footer?: ReactNode;
  emphasis?: 'warning' | 'danger';
  className?: string;
}

export function Kpi({ label, value, icon, footer, emphasis, className }: KpiProps) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-1.5 rounded-xl border bg-white p-4 shadow-card',
        emphasis === 'danger' ? 'border-red-200' : emphasis === 'warning' ? 'border-amber-200' : 'border-slate-200',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 text-[13px] font-medium text-slate-500">
        <span>{label}</span>
        {icon && <span className="text-slate-400 [&_svg]:size-4">{icon}</span>}
      </div>
      <div className={cn('tabular text-[28px] font-semibold leading-tight tracking-tight', emphasis === 'danger' ? 'text-red-600' : 'text-slate-900')}>
        {value}
      </div>
      {footer && <div className="flex items-center justify-between gap-2 text-[12.5px] text-slate-500">{footer}</div>}
    </div>
  );
}

export function Delta({ tone, children }: { tone: 'up' | 'down' | 'flat'; children: ReactNode }) {
  const toneClass = tone === 'up' ? 'bg-green-50 text-green-700' : tone === 'down' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600';
  return <span className={cn('rounded-md px-1.5 py-0.5 text-xs font-semibold', toneClass)}>{children}</span>;
}
