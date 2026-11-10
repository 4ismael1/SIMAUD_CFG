import { forwardRef, useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { IconButton, Input, cn } from '../../ui';

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { invalid?: boolean };

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(props, ref) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input ref={ref} type={visible ? 'text' : 'password'} {...props} className={cn('pr-11', props.className)} />
      <IconButton
        label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        className="absolute top-0.5 right-0.5"
        onClick={() => setVisible((value) => !value)}
      >
        {visible ? <EyeOff /> : <Eye />}
      </IconButton>
    </div>
  );
});

export interface PasswordCheck {
  label: string;
  passed: boolean;
}

/** Mirrors the API rule: at least 8 characters with letters and numbers. */
export function passwordChecks(password: string): PasswordCheck[] {
  return [
    { label: '8 caracteres o más', passed: password.length >= 8 },
    { label: 'Una letra', passed: /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(password) },
    { label: 'Un número', passed: /\d/.test(password) },
  ];
}

export function isStrongEnough(password: string): boolean {
  return passwordChecks(password).every((check) => check.passed);
}

export function PasswordStrength({ password }: { password: string }) {
  const checks = passwordChecks(password);
  const bonus = /[^A-Za-z0-9]/.test(password) && password.length >= 12 ? 1 : 0;
  const score = checks.filter((check) => check.passed).length + bonus;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((level) => (
          <span key={level} className={cn('h-1 flex-1 rounded-full', score >= level ? 'bg-green-600' : 'bg-slate-200')} />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs">
        {checks.map((check) => (
          <li key={check.label} className={check.passed ? 'text-green-700' : 'text-slate-500'}>
            {check.passed ? '✓' : '○'} {check.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
