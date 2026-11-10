import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { LoaderCircle } from 'lucide-react';
import { cn } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'dark' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-vino-600 text-white border-vino-600 hover:bg-vino-700 hover:border-vino-700',
  secondary: 'bg-white text-slate-900 border-slate-300 hover:bg-slate-50',
  dark: 'bg-slate-900 text-white border-slate-900 hover:bg-slate-800',
  ghost: 'bg-transparent text-slate-600 border-transparent hover:bg-slate-100 hover:text-slate-900',
  danger: 'bg-white text-red-600 border-slate-300 hover:bg-red-50 hover:border-red-200',
  success: 'bg-green-700 text-white border-green-700 hover:bg-green-800',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 [&_svg]:size-4',
  md: 'h-9 px-3.5 text-sm gap-2 [&_svg]:size-4',
  lg: 'h-11 px-5 text-[15px] gap-2 [&_svg]:size-[18px]',
};

export function buttonClasses(
  variant: ButtonVariant = 'secondary',
  size: ButtonSize = 'md',
  extra?: string,
): string {
  return cn(
    'inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg border font-medium',
    'transition-colors disabled:pointer-events-none disabled:opacity-50',
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    extra,
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, loading = false, icon, block, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses(variant, size, cn(block && 'w-full', className))}
      {...rest}
    >
      {loading ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
});

interface ButtonLinkProps extends LinkProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  block?: boolean;
}

export function ButtonLink({ variant, size, icon, block, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonClasses(variant, size, cn(block && 'w-full', className))} {...rest}>
      {icon}
      {children}
    </Link>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: 'sm' | 'md';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = 'md', className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'relative inline-grid shrink-0 place-items-center rounded-lg text-slate-500 transition-colors',
        'hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50',
        size === 'sm' ? 'size-8 [&_svg]:size-4' : 'size-9 [&_svg]:size-[18px]',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
