import { Alert } from '../../ui';
import { useAuth } from '../../lib/auth';
import { roleStatus } from '../../lib/api/status';

/**
 * Account links (reset password, activate account, invitation) act on the account of the LINK, never on
 * the session open in this browser. When someone is signed in, say so before anything happens: finishing
 * the link signs that session out, so nobody ends up inside another person's account.
 */
export function OpenSessionNotice({ action }: { action: string }) {
  const { status, user } = useAuth();
  if (status !== 'authenticated' || !user) return null;
  return (
    <Alert tone="warning" title={`Tienes una sesión abierta como ${user.name}`}>
      {roleStatus[user.role].label} · {user.email}. Este enlace es de una cuenta concreta: al {action} se cerrará tu sesión actual en
      este navegador y entrarás de nuevo con la cuenta correcta.
    </Alert>
  );
}
