import { Suspense, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { LazyMotion, MotionConfig, domMax } from 'motion/react';
import { AuthProvider } from '../lib/auth';
import { createQueryClient } from '../lib/query';
import { ConfirmProvider, Spinner, ToastProvider } from '../ui';
import { router } from './router';

export function App() {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      {/* `strict` forbids the heavy `motion.*` components: use `m.*` so only the loaded features ship. */}
      <LazyMotion features={domMax} strict>
        {/* Honour the OS "reduce motion" setting for every animation. */}
        <MotionConfig reducedMotion="user">
          <AuthProvider>
            <ToastProvider>
              <ConfirmProvider>
                <Suspense
                  fallback={
                    <div className="grid min-h-dvh place-items-center">
                      <Spinner />
                    </div>
                  }
                >
                  <RouterProvider router={router} />
                </Suspense>
              </ConfirmProvider>
            </ToastProvider>
          </AuthProvider>
        </MotionConfig>
      </LazyMotion>
    </QueryClientProvider>
  );
}
