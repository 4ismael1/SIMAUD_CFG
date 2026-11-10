import { Suspense, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from '../lib/auth';
import { createQueryClient } from '../lib/query';
import { Spinner, ToastProvider } from '../ui';
import { router } from './router';

export function App() {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <Suspense
            fallback={
              <div className="grid min-h-dvh place-items-center">
                <Spinner />
              </div>
            }
          >
            <RouterProvider router={router} />
          </Suspense>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
