import { useLocation, useNavigate } from 'react-router-dom';
import { UserRoundCog } from 'lucide-react';
import { Button } from '../ui';
import { useAuth } from '../lib/auth';

/**
 * For links that belong to another account (e.g. «Firmar ahora» from an email opened in a browser where
 * someone else is signed in): signs out and comes back to this same page after signing in again.
 */
export function SwitchAccountButton({ variant = 'primary' }: { variant?: 'primary' | 'secondary' }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  async function switchAccount() {
    const from = location.pathname + location.search;
    await logout();
    navigate('/auth/login', { replace: true, state: { from } });
  }

  return (
    <Button variant={variant} icon={<UserRoundCog />} onClick={() => void switchAccount()}>
      Cambiar de cuenta
    </Button>
  );
}
