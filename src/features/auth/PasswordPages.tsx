import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, KeyRound, Mail, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Alert, Button, ButtonLink, Field, Input } from '../../ui';
import { useForgotPassword, useResetPassword } from '../../lib/api/hooks/auth';
import { errorMessage } from '../../lib/errors';
import { changePassword } from '../../lib/api/hooks/me';
import { useAuth } from '../../lib/auth';
import { homePathFor } from '../../app/navigation';
import { AuthCardLayout } from './AuthLayout';
import { PasswordInput, PasswordStrength, isStrongEnough } from './PasswordInput';
import { useCooldown } from './useCooldown';

function IconBadge({ children, tone = 'brand' }: { children: React.ReactNode; tone?: 'brand' | 'success' | 'warning' }) {
  const toneClass = { brand: 'bg-vino-50 text-vino-600', success: 'bg-green-50 text-green-700', warning: 'bg-amber-50 text-amber-700' }[tone];
  return <span className={`grid size-11 place-items-center rounded-xl ${toneClass} [&_svg]:size-[22px]`}>{children}</span>;
}

export function ForgotPasswordPage() {
  const forgot = useForgotPassword();
  const cooldown = useCooldown(60);
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    try {
      await forgot.mutateAsync(normalized);
      setSentTo(normalized);
      cooldown.start();
    } catch {
      // The error is rendered from forgot.error.
    }
  }

  if (sentTo) {
    return (
      <AuthCardLayout>
        <div className="flex flex-col items-center gap-4 text-center">
          <IconBadge tone="success">
            <Mail aria-hidden="true" />
          </IconBadge>
          <h1 className="text-2xl font-semibold">Revisa tu correo</h1>
          <p className="text-slate-500">
            Si existe una cuenta con <b className="font-semibold text-slate-900">{sentTo}</b>, recibirás un enlace para crear una
            contraseña nueva. Vence en 1 hora.
          </p>
          <Button block onClick={() => forgot.mutate(sentTo, { onSuccess: cooldown.start })} disabled={cooldown.active} loading={forgot.isPending}>
            {cooldown.active ? `Reenviar en ${cooldown.label}` : 'Reenviar enlace'}
          </Button>
          <Link to="/auth/login" className="text-sm font-medium text-vino-600">
            Volver a iniciar sesión
          </Link>
        </div>
      </AuthCardLayout>
    );
  }

  return (
    <AuthCardLayout>
      <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
        <IconBadge>
          <KeyRound aria-hidden="true" />
        </IconBadge>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold">¿Olvidaste tu contraseña?</h1>
          <p className="text-slate-500">Te enviaremos un enlace para crear una nueva.</p>
        </div>
        {forgot.isError && <Alert tone="danger">{errorMessage(forgot.error)}</Alert>}
        <Field label="Correo electrónico">
          <Input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoFocus />
        </Field>
        <Button type="submit" variant="primary" size="lg" block loading={forgot.isPending} disabled={!email.trim()}>
          Enviar enlace
        </Button>
        <Link to="/auth/login" className="flex items-center justify-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Volver a iniciar sesión
        </Link>
      </form>
    </AuthCardLayout>
  );
}

/** Landing page of the reset link: /auth/restablecer?token=… */
export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? '';
  const reset = useResetPassword();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const mismatch = confirmation.length > 0 && confirmation !== password;
  const canSubmit = isStrongEnough(password) && password === confirmation;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (!canSubmit) return;
    try {
      await reset.mutateAsync({ token, password });
      navigate('/auth/login?clave=actualizada', { replace: true });
    } catch {
      // Rendered below.
    }
  }

  if (!token || reset.isError) {
    return (
      <AuthCardLayout>
        <div className="flex flex-col items-center gap-4 text-center">
          <IconBadge tone="warning">
            <TriangleAlert aria-hidden="true" />
          </IconBadge>
          <h1 className="text-2xl font-semibold">Este enlace ya no es válido</h1>
          <p className="text-slate-500">
            {reset.isError ? errorMessage(reset.error) : 'El enlace está incompleto.'} Los enlaces de recuperación duran 1 hora y solo
            se pueden usar una vez.
          </p>
          <ButtonLink to="/auth/recuperar" variant="primary" block size="lg">
            Pedir un enlace nuevo
          </ButtonLink>
        </div>
      </AuthCardLayout>
    );
  }

  return (
    <AuthCardLayout>
      <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
        <IconBadge>
          <KeyRound aria-hidden="true" />
        </IconBadge>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold">Crea una contraseña nueva</h1>
          <p className="text-slate-500">Se cerrarán tus sesiones en otros equipos.</p>
        </div>
        <Field label="Contraseña nueva" error={submitted && !isStrongEnough(password) ? 'La contraseña no cumple los requisitos.' : null}>
          <PasswordInput autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus />
        </Field>
        {password && <PasswordStrength password={password} />}
        <Field label="Confirmar contraseña" error={mismatch ? 'Las contraseñas no coinciden.' : null}>
          <PasswordInput autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
        </Field>
        <Button type="submit" variant="primary" size="lg" block loading={reset.isPending} disabled={!canSubmit}>
          Guardar contraseña
        </Button>
      </form>
    </AuthCardLayout>
  );
}

/**
 * /auth/cambiar-clave — accounts created with a temporary password (the first administrator)
 * must replace it before the API allows anything else.
 */
export function ForcePasswordChangePage() {
  const navigate = useNavigate();
  const { status, user, logout, completePasswordChange } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (status === 'loading') return null;
  if (status === 'anonymous' || !user) return <Navigate to="/auth/login" replace />;
  if (!user.mustChangePassword) return <Navigate to={homePathFor(user.role)} replace />;

  const mismatch = confirmation.length > 0 && confirmation !== password;
  const reused = password.length > 0 && password === currentPassword;
  const canSubmit = currentPassword.length > 0 && isStrongEnough(password) && password === confirmation && !reused;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (!canSubmit || !user) return;
    setSaving(true);
    setError(null);
    try {
      await changePassword({ currentPassword, newPassword: password });
      completePasswordChange();
      navigate(homePathFor(user.role), { replace: true });
    } catch (changeError) {
      setError(changeError);
      setSaving(false);
    }
  }

  async function handleLogout() {
    await logout();
    navigate('/auth/login', { replace: true });
  }

  return (
    <AuthCardLayout>
      <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
        <IconBadge>
          <ShieldCheck aria-hidden="true" />
        </IconBadge>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold">Cambia tu contraseña temporal</h1>
          <p className="text-slate-500">
            Hola, {user.name.split(' ')[0]}. Por seguridad, elige una contraseña propia antes de entrar. Solo tú la conocerás.
          </p>
        </div>
        {error !== null && <Alert tone="danger">{errorMessage(error)}</Alert>}
        <Field label="Contraseña temporal" error={submitted && !currentPassword ? 'Escribe la contraseña que te dieron.' : null}>
          <PasswordInput autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoFocus />
        </Field>
        <Field
          label="Contraseña nueva"
          error={reused ? 'Debe ser distinta de la temporal.' : submitted && !isStrongEnough(password) ? 'La contraseña no cumple los requisitos.' : null}
        >
          <PasswordInput autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </Field>
        {password && <PasswordStrength password={password} />}
        <Field label="Confirmar contraseña" error={mismatch ? 'Las contraseñas no coinciden.' : null}>
          <PasswordInput autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
        </Field>
        <Button type="submit" variant="primary" size="lg" block loading={saving} disabled={!canSubmit}>
          Guardar y entrar
        </Button>
        <button type="button" onClick={() => void handleLogout()} className="text-sm font-medium text-slate-500 hover:text-slate-900">
          Cerrar sesión
        </button>
      </form>
    </AuthCardLayout>
  );
}
