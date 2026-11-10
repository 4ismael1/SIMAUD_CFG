import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { FileQuestion, TriangleAlert } from 'lucide-react';
import { Button, ButtonLink, EmptyState, Logo } from '../ui';

/** Catches render errors so a single broken page never blanks the whole app. */
export function RouteError() {
  const error = useRouteError();
  const isNotFound = isRouteErrorResponse(error) && error.status === 404;

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
