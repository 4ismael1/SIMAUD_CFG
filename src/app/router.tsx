import { lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from './layout/AppLayout';
import { ProtectedRoute, PublicOnlyRoute, RoleRoute, StaffHome } from './guards';
import { RouteError, NotFoundPage } from './RouteError';

/* Pages are code-split so each role downloads only what it opens. */
const LandingPage = lazy(() => import('../features/landing/LandingPage').then((m) => ({ default: m.LandingPage })));
const LoginPage = lazy(() => import('../features/auth/LoginPage').then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import('../features/auth/RegisterPage').then((m) => ({ default: m.RegisterPage })));
const VerifyEmailPage = lazy(() => import('../features/auth/EmailPages').then((m) => ({ default: m.VerifyEmailPage })));
const ConfirmEmailPage = lazy(() => import('../features/auth/EmailPages').then((m) => ({ default: m.ConfirmEmailPage })));
const ForgotPasswordPage = lazy(() => import('../features/auth/PasswordPages').then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import('../features/auth/PasswordPages').then((m) => ({ default: m.ResetPasswordPage })));
const DashboardPage = lazy(() => import('../features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const ContractsListPage = lazy(() => import('../features/contracts/ContractsListPage').then((m) => ({ default: m.ContractsListPage })));
const ContractDetailPage = lazy(() => import('../features/contracts/ContractDetailPage').then((m) => ({ default: m.ContractDetailPage })));

export const router = createBrowserRouter([
  { path: '/', element: <LandingPage />, errorElement: <RouteError /> },
  {
    path: '/auth',
    errorElement: <RouteError />,
    children: [
      // Links sent by email must keep working even when the user is signed in.
      { path: 'confirmar', element: <ConfirmEmailPage /> },
      { path: 'restablecer', element: <ResetPasswordPage /> },
      {
        element: <PublicOnlyRoute />,
        children: [
          { index: true, element: <Navigate to="/auth/login" replace /> },
          { path: 'login', element: <LoginPage /> },
          { path: 'registro', element: <RegisterPage /> },
          { path: 'verifica', element: <VerifyEmailPage /> },
          { path: 'recuperar', element: <ForgotPasswordPage /> },
        ],
      },
    ],
  },
  {
    path: '/app',
    element: <ProtectedRoute />,
    errorElement: <RouteError />,
    children: [
      {
        element: <AppLayout />,
        errorElement: <RouteError />,
        children: [
          { index: true, element: <StaffHome dashboard={<DashboardPage />} /> },
          // Signers reach contracts through their inbox; the detail page itself is checked by the API.
          { path: 'contratos/:id', element: <ContractDetailPage /> },
          {
            element: <RoleRoute roles={['admin', 'supervisor', 'gestor']} />,
            children: [{ path: 'contratos', element: <ContractsListPage /> }],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage standalone /> },
]);
