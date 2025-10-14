import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { LandingPage } from '../landing/LandingPage';
import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';
import { EmailConfirmationPending } from './EmailConfirmationPending';
import { ResetPasswordForm } from './ResetPasswordForm';
import { useAuth } from '../../contexts/AuthContext';

export const AuthPage: React.FC = () => {
  const [currentView, setCurrentView] = useState<'landing' | 'login' | 'register' | 'confirmation' | 'reset'>('landing');
  const { pendingEmailConfirmation, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // Check if this is a password reset flow
  React.useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('reset') === 'true') {
      setCurrentView('reset' as any);
    }
  }, []);

  // If the reset flow is active and the URL doesn't include the force logout flag,
  // append it without forcing a full navigation so Supabase tokens stay intact.
  React.useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const isResetFlow = urlParams.get('reset') === 'true';
    const hasForceLogoutFlag = urlParams.get('force_logout') === 'true';

    if (!isResetFlow || hasForceLogoutFlag) {
      return;
    }

    urlParams.set('force_logout', 'true');

    const newQuery = urlParams.toString();
    const newUrl = `${window.location.pathname}${newQuery ? `?${newQuery}` : ''}${window.location.hash}`;

    window.history.replaceState({}, '', newUrl);
  }, [isAuthenticated]);

  // Si hay confirmación pendiente, mostrar la pantalla de confirmación
  if (pendingEmailConfirmation || currentView === 'confirmation') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/5 via-transparent to-green-600/5" />
        
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-0 left-0 w-72 h-72 bg-blue-300 rounded-full mix-blend-multiply filter blur-xl animate-blob" />
          <div className="absolute top-0 right-0 w-72 h-72 bg-green-300 rounded-full mix-blend-multiply filter blur-xl animate-blob animation-delay-2000" />
          <div className="absolute -bottom-8 left-20 w-72 h-72 bg-purple-300 rounded-full mix-blend-multiply filter blur-xl animate-blob animation-delay-4000" />
        </div>

        <div className="relative w-full max-w-md z-10">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-2xl p-8 border border-white/20"
          >
            <EmailConfirmationPending onBack={() => setCurrentView('login')} />
          </motion.div>
        </div>
      </div>
    );
  }

  // Show password reset form if coming from email link
  if (currentView === 'reset') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/5 via-transparent to-green-600/5" />
        
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-0 left-0 w-72 h-72 bg-blue-300 rounded-full mix-blend-multiply filter blur-xl animate-blob" />
          <div className="absolute top-0 right-0 w-72 h-72 bg-green-300 rounded-full mix-blend-multiply filter blur-xl animate-blob animation-delay-2000" />
          <div className="absolute -bottom-8 left-20 w-72 h-72 bg-purple-300 rounded-full mix-blend-multiply filter blur-xl animate-blob animation-delay-4000" />
        </div>

        <div className="relative w-full max-w-md z-10">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-2xl p-8 border border-white/20"
          >
            {/* Logo Section */}
            <div className="text-center mb-8">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.3, type: 'spring', stiffness: 100 }}
                className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-blue-500 to-green-500 rounded-xl mb-4 shadow-lg"
              >
                <span className="text-xl font-bold text-white">S</span>
              </motion.div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-green-600 bg-clip-text text-transparent mb-2">
                SIMAUD
              </h1>
              <p className="text-gray-600 text-sm">
                Sistema de Gestión de Contratos
              </p>
            </div>

            <ResetPasswordForm
              onSuccess={() => {
                // Clear the reset flags from the URL before redirecting to the dashboard
                const params = new URLSearchParams(window.location.search);
                params.delete('reset');
                params.delete('force_logout');
                const newQuery = params.toString();
                const newUrl = `${window.location.pathname}${newQuery ? `?${newQuery}` : ''}${window.location.hash}`;
                window.history.replaceState({}, '', newUrl);

                navigate('/dashboard', { replace: true });
              }}
            />
          </motion.div>
        </div>
      </div>
    );
  }

  // Show landing page by default
  if (currentView === 'landing') {
    return (
      <LandingPage 
        onLogin={() => setCurrentView('login')}
        onRegister={() => setCurrentView('register')}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-600/5 via-transparent to-green-600/5" />
      
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-0 left-0 w-72 h-72 bg-blue-300 rounded-full mix-blend-multiply filter blur-xl animate-blob" />
        <div className="absolute top-0 right-0 w-72 h-72 bg-green-300 rounded-full mix-blend-multiply filter blur-xl animate-blob animation-delay-2000" />
        <div className="absolute -bottom-8 left-20 w-72 h-72 bg-purple-300 rounded-full mix-blend-multiply filter blur-xl animate-blob animation-delay-4000" />
      </div>

      <div className="relative w-full max-w-md z-10">
        <motion.div
          key={currentView}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="bg-white/80 backdrop-blur-lg rounded-2xl shadow-2xl p-8 border border-white/20"
        >
          {/* Logo Section */}
          <div className="text-center mb-8">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.3, type: 'spring', stiffness: 100 }}
              className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-blue-500 to-green-500 rounded-xl mb-4 shadow-lg"
            >
              <span className="text-xl font-bold text-white">S</span>
            </motion.div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-green-600 bg-clip-text text-transparent mb-2">
              SIMAUD
            </h1>
            <p className="text-gray-600 text-sm">
              Sistema de Gestión de Contratos
            </p>
          </div>

          {/* Content */}
          <motion.div
            key={currentView}
            initial={{ opacity: 0, x: currentView === 'login' ? -20 : 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
          >
            {currentView === 'login' ? (
              <LoginForm 
                onSwitchToRegister={() => setCurrentView('register')}
                onBackToLanding={() => setCurrentView('landing')}
              />
            ) : (
              <RegisterForm 
                onSwitchToLogin={() => setCurrentView('login')}
                onBackToLanding={() => setCurrentView('landing')}
                onRegistrationSuccess={() => {
                  console.log('🎉 Cambiando a vista de confirmación...');
                  setCurrentView('confirmation');
                }}
              />
            )}
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
};
