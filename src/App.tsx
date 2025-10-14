import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AuthPage } from './components/auth/AuthPage';
import { DashboardController } from './components/common/DashboardController';
import { LoadingSpinner } from './components/common/LoadingSpinner';

const AppRoutes: React.FC = () => {
  const { isAuthenticated, user, isLoading, pendingEmailConfirmation } = useAuth();
  const location = useLocation();

  const params = new URLSearchParams(location.search);
  const isPasswordResetFlow =
    params.get('reset') === 'true' || params.get('force_logout') === 'true';

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size="large" />
          <p className="text-gray-600 mt-4">Verificando sesión...</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/auth"
        element={
          isAuthenticated && !pendingEmailConfirmation && !isPasswordResetFlow ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <AuthPage />
          )
        }
      />
      
      <Route
        path="/dashboard"
        element={
          <DashboardController />
        }
      />
      
      <Route
        path="/"
        element={
          isAuthenticated && !pendingEmailConfirmation ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <Navigate to="/auth" replace />
          )
        }
      />
      
      {/* Catch all route */}
      <Route
        path="*"
        element={<Navigate to="/" replace />}
      />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="App">
          <AppRoutes />
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
