import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { FileQuestion, TriangleAlert } from 'lucide-react';
import { Button, ButtonLink, EmptyState, Logo } from '../ui';

const RELOAD_KEY = 'simaud:stale-chunk-reload';

/**
 * After a new version is deployed, an open tab still points to the previous build's page files, which
 * no longer exist: opening a page then fails to load its code. That is not a real error, so reload
 * once to pick up the new version (guarded, so a genuinely broken file cannot cause a reload loop).
 */
function isStaleBuild(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /dynamically imported module|Importing a module script failed|error loading dynamically|Failed to fetch dynamically/i.test(message);
}

function reloadOnce(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < 30_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // Storage blocked: still reload; the next failure shows the error page.
  }
  window.location.reload();
  return true;
}

/** Catches render errors so a single broken page never blanks the whole app. */
export function RouteError() {
  const error = useRouteError();
  const isNotFound = isRouteErrorResponse(error) && error.status === 404;
  const reloading = !isNotFound && isStaleBuild(error) && reloadOnce();
  if (reloading) return null;

  if (import.meta.env.DEV) {
    console.error(error);
  }

  return (
    <div className="grid min-h-[60dvh] place-items-center px-4">
      <EmptyState
        icon={isNotFound ? <FileQuestion /> : <TriangleAlert />}
        title={isNotFound ? 'Página no encontrada' : 'Algo salió mal al mostrar esta página'}
        description={isNotFound ? 'Revisa la dirección o vuelve al inicio.' : 'Recarga la página. Si vuelve a pasar, avisa a soporte indicando qué estabas haciendo.'}
        action={
          <div className="flex gap-2">
            <Button onClick={() => window.location.reload()}>Recargar</Button>
            <ButtonLink to="/app" variant="primary">Ir al inicio</ButtonLink>
          </div>
        }
      />
    </div>
  );
}

export function NotFoundPage({ standalone = false }: { standalone?: boolean }) {
  const content = (
    <EmptyState
      icon={<FileQuestion />}
      title="Página no encontrada"
      description="La dirección no existe o fue movida."
      action={<ButtonLink to={standalone ? '/' : '/app'} variant="primary">Ir al inicio</ButtonLink>}
    />
  );
  if (!standalone) return content;
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4">
      <Logo className="h-10" />
      {content}
    </div>
  );
}
