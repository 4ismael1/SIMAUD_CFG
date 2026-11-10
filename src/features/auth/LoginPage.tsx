import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, Field, Input } from '../../ui';
import { useAuth } from '../../lib/auth';
import { errorMessage, isApiError } from '../../lib/errors';
import { AuthLayout } from './AuthLayout';
import { PasswordInput } from './PasswordInput';

interface LocationState {
  from?: string;
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const justConfirmed = searchParams.get('confirmado') === '1';
  const passwordChanged = searchParams.get('clave') === 'actualizada';
  const sessionExpired = searchParams.get('sesion') === 'expirada';
  const redirectTo = (location.state as LocationState | null)?.from;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login({ email: email.trim(), password });
      // /app redirects each role to its own home page.
      navigate(redirectTo ?? '/app', { replace: true });
    } catch (loginError) {
      setError(loginError);
      setSubmitting(false);
    }
  }

  const emailNotConfirmed = isApiError(error, 'EMAIL_NOT_CONFIRMED');

  return (
    <AuthLayout
      title="Iniciar sesión"
      description="Accede al Módulo de Gestión Legal Digital."
      footer={
        <>
          ¿No tienes cuenta?{' '}
          <Link to="/auth/registro" className="font-semibold text-vino-600 hover:text-vino-700">
            Crear cuenta
          </Link>
        </>
      }
    >
      {justConfirmed && <Alert tone="success">Tu correo quedó confirmado. Ya puedes entrar.</Alert>}
      {passwordChanged && <Alert tone="success">Contraseña actualizada. Entra con la nueva.</Alert>}
      {sessionExpired && <Alert tone="info">Tu sesión expiró. Vuelve a entrar para continuar.</Alert>}
      {emailNotConfirmed ? (
        <Alert tone="warning" title="Confirma tu correo antes de entrar">
          Revisa tu bandeja de entrada.{' '}
          <Link to={`/auth/verifica?email=${encodeURIComponent(email.trim())}`} className="font-semibold underline">
            Reenviar el enlace
          </Link>
        </Alert>
      ) : (
        error !== null && <Alert tone="danger">{errorMessage(error)}</Alert>
      )}

      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        <Field label="Correo electrónico">
          <Input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoFocus />
        </Field>
        <Field
          label="Contraseña"
          action={
            <Link to="/auth/recuperar" className="text-[13px] font-medium text-vino-600 hover:text-vino-700">
              ¿Olvidaste tu contraseña?
            </Link>
          }
        >
          <PasswordInput autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </Field>
        <Button type="submit" variant="primary" size="lg" block loading={submitting} disabled={!email || !password}>
          {submitting ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
    </AuthLayout>
  );
}
