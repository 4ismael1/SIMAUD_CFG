import { lazy, type ComponentType } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from './layout/AppLayout';
import { ProtectedRoute, PublicOnlyRoute, RoleRoute, StaffHome } from './guards';
import { RouteError, NotFoundPage } from './RouteError';

/*
 * Pages are code-split so each role downloads only what it opens. They use the router's own `lazy`
 * (not React.lazy): the router downloads the page BEFORE navigating, so the current page stays on
 * screen until the next one is ready — no spinner flash and no layout jump between pages.
 */
function page<Module>(load: () => Promise<Module>, pick: (module: Module) => ComponentType) {
  return async () => ({ Component: pick(await load()) });
}

// The dashboard is rendered inside StaffHome (role switch), so it keeps React.lazy.
const DashboardPage = lazy(() => import('../features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })));

const auth = {
  login: page(() => import('../features/auth/LoginPage'), (m) => m.LoginPage),
  register: page(() => import('../features/auth/RegisterPage'), (m) => m.RegisterPage),
  verify: page(() => import('../features/auth/EmailPages'), (m) => m.VerifyEmailPage),
  confirm: page(() => import('../features/auth/EmailPages'), (m) => m.ConfirmEmailPage),
  forgot: page(() => import('../features/auth/PasswordPages'), (m) => m.ForgotPasswordPage),
  reset: page(() => import('../features/auth/PasswordPages'), (m) => m.ResetPasswordPage),
  forceChange: page(() => import('../features/auth/PasswordPages'), (m) => m.ForcePasswordChangePage),
};

const app = {
  contracts: page(() => import('../features/contracts/ContractsListPage'), (m) => m.ContractsListPage),
  contract: page(() => import('../features/contracts/ContractDetailPage'), (m) => m.ContractDetailPage),
  wizard: page(() => import('../features/contracts/wizard/ContractWizardPage'), (m) => m.ContractWizardPage),
  sign: page(() => import('../features/signatures/SignContractPage'), (m) => m.SignContractPage),
  inbox: page(() => import('../features/signatures/SignaturesInboxPage'), (m) => m.SignaturesInboxPage),
  approvals: page(() => import('../features/approvals/ApprovalsPage'), (m) => m.ApprovalsPage),
  users: page(() => import('../features/users/UsersPage'), (m) => m.UsersPage),
  profile: page(() => import('../features/profile/ProfilePage'), (m) => m.ProfilePage),
  settings: page(() => import('../features/settings/SettingsPage'), (m) => m.SettingsPage),
  templates: page(() => import('../features/templates/TemplatesPage'), (m) => m.TemplatesPage),
  myContracts: page(() => import('../features/signer/MyContractsPage'), (m) => m.MyContractsPage),
  signerHome: page(() => import('../features/signer/SignerHomePage'), (m) => m.SignerHomePage),
  audit: page(() => import('../features/audit/AuditPage'), (m) => m.AuditPage),
  variables: page(() => import('../features/templates/VariablesPage'), (m) => m.VariablesPage),
  templateEditor: page(() => import('../features/templates/TemplateEditorPage'), (m) => m.TemplateEditorPage),
  renewals: page(() => import('../features/renewals/RenewalsPage'), (m) => m.RenewalsPage),
  reports: page(() => import('../features/reports/ReportsPage'), (m) => m.ReportsPage),
};

export const router = createBrowserRouter([
  { path: '/', lazy: page(() => import('../features/landing/LandingPage'), (m) => m.LandingPage), errorElement: <RouteError /> },
  // Public: anyone can check a signed contract (the QR on the certificate opens /verificar/<code>).
  { path: '/verificar/:code?', lazy: page(() => import('../features/verify/VerifyPage'), (m) => m.VerifyPage), errorElement: <RouteError /> },
  {
    path: '/auth',
    errorElement: <RouteError />,
    children: [
      // Links sent by email must keep working even when the user is signed in.
      { path: 'confirmar', lazy: auth.confirm },
      { path: 'restablecer', lazy: auth.reset },
      { path: 'cambiar-clave', lazy: auth.forceChange },
      {
        element: <PublicOnlyRoute />,
        children: [
          { index: true, element: <Navigate to="/auth/login" replace /> },
          { path: 'login', lazy: auth.login },
          { path: 'registro', lazy: auth.register },
          { path: 'verifica', lazy: auth.verify },
          { path: 'recuperar', lazy: auth.forgot },
        ],
      },
    ],
  },
  {
    path: '/app',
    element: <ProtectedRoute />,
    errorElement: <RouteError />,
    children: [
      // Full-screen signing flow (no sidebar); the API decides whether it is this user's turn.
      { path: 'contratos/:id/firmar', lazy: app.sign },
      {
        element: <AppLayout />,
        errorElement: <RouteError />,
        children: [
          { index: true, element: <StaffHome dashboard={<DashboardPage />} /> },
          // Signers reach contracts through their inbox; the detail page itself is checked by the API.
          { path: 'contratos/:id', lazy: app.contract },
          { path: 'firmas', lazy: app.inbox },
          { path: 'mis-contratos', lazy: app.myContracts },
          { path: 'perfil', lazy: app.profile },
          // Same check as the public /verificar, inside the panel so the sidebar stays.
          { path: 'verificar/:code?', lazy: page(() => import('../features/verify/VerifyPage'), (m) => m.VerifyInAppPage) },
          {
            element: <RoleRoute roles={['admin', 'supervisor']} />,
            children: [
              { path: 'aprobaciones', lazy: app.approvals },
              { path: 'plantillas/nueva', lazy: app.templateEditor },
              { path: 'plantillas/:id', lazy: app.templateEditor },
              { path: 'variables', lazy: app.variables },
            ],
          },
          {
            element: <RoleRoute roles={['admin']} />,
            children: [
              { path: 'usuarios', lazy: app.users },
              { path: 'configuracion', lazy: app.settings },
              { path: 'auditoria', lazy: app.audit },
            ],
          },
          {
            element: <RoleRoute roles={['admin', 'supervisor', 'gestor']} />,
            children: [
              { path: 'contratos', lazy: app.contracts },
              { path: 'contratos/nuevo', lazy: app.wizard },
              { path: 'contratos/:id/editar', lazy: app.wizard },
              { path: 'plantillas', lazy: app.templates },
              { path: 'renovaciones', lazy: app.renewals },
              { path: 'reportes', lazy: app.reports },
            ],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage standalone /> },
]);
