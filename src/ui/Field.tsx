import {
  cloneElement,
  forwardRef,
  isValidElement,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from './cn';

const CONTROL_BASE =
  'w-full rounded-lg border bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 ' +
  'transition-colors focus:outline-2 focus:outline-offset-0 focus:outline-vino-600 ' +
  'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500';

function controlClasses(invalid: boolean | undefined, extra?: string): string {
  return cn(
    CONTROL_BASE,
    invalid ? 'border-red-500 bg-red-50/30' : 'border-slate-300 hover:border-slate-400',
    extra,
  );
}

interface ControlProps {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & ControlProps>(
  function Input({ invalid, className, ...rest }, ref) {
    return (
      <input ref={ref} aria-invalid={invalid || undefined} className={controlClasses(invalid, cn('h-10', className))} {...rest} />
    );
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & ControlProps
>(function Textarea({ invalid, className, rows = 3, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={controlClasses(invalid, cn('resize-y py-2 leading-relaxed', className))}
      {...rest}
    />
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & ControlProps>(
  function Select({ invalid, className, children, ...rest }, ref) {
    return (
      <select ref={ref} aria-invalid={invalid || undefined} className={controlClasses(invalid, cn('h-10 pr-8', className))} {...rest}>
        {children}
      </select>
    );
  },
);

interface FieldProps {
  label: ReactNode;
  /** The form control. It receives id, aria-describedby and invalid automatically. */
  children: ReactElement<Record<string, unknown>>;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  optional?: boolean;
  action?: ReactNode;
  className?: string;
}

/** Label + control + hint/error, wired for accessibility. */
export function Field({ label, children, hint, error, required, optional, action, className }: FieldProps) {
  const generatedId = useId();
  const controlId = (isValidElement(children) && (children.props.id as string | undefined)) || generatedId;
  const messageId = `${controlId}-message`;
  const hasMessage = Boolean(error || hint);

  const control = isValidElement(children)
    ? cloneElement(children, {
        id: controlId,
        invalid: Boolean(error),
        required,
        'aria-describedby': hasMessage ? messageId : undefined,
      })
    : children;

  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={controlId} className="text-[13px] font-medium text-slate-800">
          {label}
          {optional && <span className="ml-1 font-normal text-slate-400">(opcional)</span>}
        </label>
        {action}
      </div>
      {control}
      {hasMessage && (
        <p id={messageId} role={error ? 'alert' : undefined} className={cn('text-xs', error ? 'text-red-600' : 'text-slate-500')}>
          {error || hint}
        </p>
      )}
    </div>
  );
}

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, className, ...rest },
  ref,
) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-2.5 text-sm text-slate-700', className)}>
      <input ref={ref} type="checkbox" className="mt-0.5 size-4 shrink-0 accent-vino-600" {...rest} />
      <span>{label}</span>
    </label>
  );
});
