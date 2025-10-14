import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, RefreshCw, ArrowLeft, CheckCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { LoadingSpinner } from '../common/LoadingSpinner';

interface EmailConfirmationPendingProps {
  onBack: () => void;
  onBackToLanding?: () => void;
}

export const EmailConfirmationPending: React.FC<EmailConfirmationPendingProps> = ({ onBack, onBackToLanding }) => {
  const { pendingEmail, resendConfirmation, clearPendingConfirmation } = useAuth();
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState('');
  const [resendSuccess, setResendSuccess] = useState(false);

  const handleBackToLogin = () => {
    clearPendingConfirmation();
    onBack();
  };

  const handleResendConfirmation = async () => {
    setIsResending(true);
    setResendMessage('');
    setResendSuccess(false);

    const result = await resendConfirmation();
    
    if (result.success) {
      setResendSuccess(true);
      setResendMessage('Email de confirmación reenviado exitosamente');
    } else {
      setResendMessage(result.error || 'Error al reenviar el email');
    }
    
    setIsResending(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-md"
    >
      <div className="text-center mb-8">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 100 }}
          className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full mb-6"
        >
          <Mail className="w-10 h-10 text-white" />
        </motion.div>
        
        <h2 className="text-3xl font-bold text-gray-900 mb-4">
          ¡Confirma tu Email!
        </h2>
        
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-start space-x-3">
            <CheckCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-left">
              <p className="text-blue-900 font-medium text-sm mb-2">
                ¡Registro exitoso!
              </p>
              <p className="text-blue-800 text-sm">
                Hemos enviado un email de confirmación a:
              </p>
              <p className="text-blue-900 font-semibold text-sm mt-1">
                {pendingEmail}
              </p>
            </div>
          </div>
        </div>

        <div className="text-gray-600 text-sm space-y-2 mb-6">
          <p>
            Por favor, revisa tu bandeja de entrada (y la carpeta de spam) 
            y haz clic en el enlace de confirmación.
          </p>
          <p>
            Una vez confirmado tu email, podrás iniciar sesión en SIMAUD.
          </p>
        </div>

        {resendMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`px-4 py-3 rounded-lg text-sm mb-4 ${
              resendSuccess 
                ? 'bg-green-50 border border-green-200 text-green-600'
                : 'bg-red-50 border border-red-200 text-red-600'
            }`}
          >
            {resendMessage}
          </motion.div>
        )}

        <div className="space-y-3">
          <motion.button
            onClick={handleResendConfirmation}
            disabled={isResending}
            className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white py-3 px-4 rounded-lg font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            whileHover={{ scale: isResending ? 1 : 1.02 }}
            whileTap={{ scale: isResending ? 1 : 0.98 }}
          >
            {isResending ? (
              <div className="flex items-center justify-center space-x-2">
                <LoadingSpinner size="small" />
                <span>Reenviando...</span>
              </div>
            ) : (
              <div className="flex items-center justify-center space-x-2">
                <RefreshCw className="w-4 h-4" />
                <span>Reenviar Email de Confirmación</span>
              </div>
            )}
          </motion.button>

          <motion.button
            onClick={handleBackToLogin}
            className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 px-4 rounded-lg font-medium transition-colors duration-200"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="flex items-center justify-center space-x-2">
              <ArrowLeft className="w-4 h-4" />
              <span>Volver al Login</span>
            </div>
          </motion.button>
          
          {onBackToLanding && (
            <motion.button
              onClick={() => {
                clearPendingConfirmation();
                onBackToLanding();
              }}
              className="w-full bg-white border border-gray-300 text-gray-600 py-3 px-4 rounded-lg font-medium transition-colors duration-200 hover:bg-gray-50"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="flex items-center justify-center space-x-2">
                <ArrowLeft className="w-4 h-4" />
                <span>Volver al Inicio</span>
              </div>
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  );
};