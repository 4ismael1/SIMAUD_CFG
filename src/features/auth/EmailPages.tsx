import { useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, TriangleAlert } from 'lucide-react';
import { Alert, Button, ButtonLink, Spinner } from '../../ui';
import { useConfirmEmail, useResendConfirmation } from '../../lib/api/hooks/auth';
import { errorMessage } from '../../lib/errors';
import { AuthCardLayout } from './AuthLayout';
import { useCooldown } from './useCooldown';

const RESEND_COOLDOWN_SECONDS = 60;

/** Shown after registering, or when someone tries to log in without confirming. */
export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const email = searchParams.get('email') ?? '';
  const resend = useResendConfirmation();
  const cooldown = useCooldown(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    cooldown.start();
  }, [cooldown.start]);

  async function handleResend() {
    if (!email) return;
    await resend.mutateAsync(email).catch(() => undefined);
    cooldown.start();
  }

  return (
    <AuthCardLayout>
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-vino-50 text-vino-600">
          <Mail className="size-7" aria-hidden="true" />
        </span>
        <h1 className="text-2xl font-semibold">Confirma tu correo</h1>
        <p className="text-slate-500">
          Enviamos un enlace de activación{email ? <> a <b className="font-semibold text-slate-900">{email}</b></> : null}. Vence en 24
          horas. Si no lo ves, revisa la carpeta de spam.
        </p>
        {resend.isSuccess && !cooldown.active && <Alert tone="success">Te enviamos un enlace nuevo.</Alert>}
        <div className="flex w-full flex-col gap-2">
          <Button block size="lg" onClick={handleResend} disabled={!email || cooldown.active} loading={resend.isPending}>
            {cooldown.active ? `Reenviar correo en ${cooldown.label}` : 'Reenviar correo'}
          </Button>
          <ButtonLink to="/auth/registro" variant="ghost" block>
            Usar otro correo
          </ButtonLink>
        </div>
      </div>
    </AuthCardLayout>
  );
}

/** Landing page of the confirmation link: /auth/confirmar?token=… */
export function ConfirmEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? '';
  const confirm = useConfirmEmail();
  const requested = useRef(false);

  useEffect(() => {
    // StrictMode mounts twice in development; the token is single-use, so send it only once.
    if (!token || requested.current) return;
    requested.current = true;
    confirm
      .mutateAsync(token)
      .then(() => navigate('/auth/login?confirmado=1', { replace: true }))
      .catch(() => undefined);
  }, [token, confirm, navigate]);

  if (!token || confirm.isError) {
    return (
      <AuthCardLayout>
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-amber-50 text-amber-700">
            <TriangleAlert className="size-7" aria-hidden="true" />
          </span>
          <h1 className="text-2xl font-semibold">No pudimos confirmar tu correo</h1>
          <p className="text-slate-500">
            {confirm.isError ? errorMessage(confirm.error) : 'El enlace está incompleto.'} Pide un enlace nuevo desde la pantalla
            de acceso.
          </p>
          <ButtonLink to="/auth/login" variant="primary" block size="lg">
            Ir a iniciar sesión
          </ButtonLink>
        </div>
      </AuthCardLayout>
    );
  }

  return (
    <AuthCardLayout>
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <Spinner label="Confirmando tu correo" />
        <p className="text-slate-500">Confirmando tu correo…</p>
        <Link to="/auth/login" className="text-sm text-vino-600">
          Ir a iniciar sesión
        </Link>
      </div>
    </AuthCardLayout>
  );
}
