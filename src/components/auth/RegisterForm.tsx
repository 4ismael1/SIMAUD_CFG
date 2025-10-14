import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Eye, EyeOff, UserPlus, Mail, Lock, User, Phone, CreditCard } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { supabase } from '../../lib/supabase';

interface RegisterFormProps {
  onSwitchToLogin: () => void;
  onRegistrationSuccess: () => void;
  onBackToLanding?: () => void;
}

export const RegisterForm: React.FC<RegisterFormProps> = ({ onSwitchToLogin, onRegistrationSuccess, onBackToLanding }) => {
  const { register, isLoading } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    cedula: '',
    password: '',
    confirmPassword: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [cedulaError, setCedulaError] = useState('');
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const [isCheckingCedula, setIsCheckingCedula] = useState(false);

  const validateForm = () => {
    if (!formData.name.trim()) return 'El nombre es requerido';
    if (!formData.email.trim()) return 'El email es requerido';
    if (!formData.phone.trim()) return 'El teléfono es requerido';
    if (!formData.cedula.trim()) return 'La cédula es requerida';
    if (!formData.password) return 'La contraseña es requerida';
    if (formData.password.length < 6) return 'La contraseña debe tener al menos 6 caracteres';
    if (formData.password !== formData.confirmPassword) return 'Las contraseñas no coinciden';
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) return 'Email inválido';
    
    const phoneRegex = /^[\+]?[0-9\s\-\(\)]{8,}$/;
    if (!phoneRegex.test(formData.phone)) return 'Teléfono inválido';
    
    // Verificar si hay errores de duplicación
    if (emailError) return emailError;
    if (cedulaError) return cedulaError;
    
    return null;
  };

  const checkEmailExists = async (email: string) => {
    if (!email.trim()) {
      setEmailError('');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setEmailError('');
      return;
    }

    setIsCheckingEmail(true);
    setEmailError('');

    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('email')
        .eq('email', email.trim())
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error checking email:', error);
        return;
      }

      if (data) {
        setEmailError('Este correo ya está registrado');
      }
    } catch (error) {
      console.error('Error checking email:', error);
    } finally {
      setIsCheckingEmail(false);
    }
  };

  const checkCedulaExists = async (cedula: string) => {
    if (!cedula.trim()) {
      setCedulaError('');
      return;
    }

    setIsCheckingCedula(true);
    setCedulaError('');

    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('cedula')
        .eq('cedula', cedula.trim())
        .neq('cedula', '')
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error checking cedula:', error);
        return;
      }

      if (data) {
        setCedulaError('Esta cédula ya está registrada');
      }
    } catch (error) {
      console.error('Error checking cedula:', error);
    } finally {
      setIsCheckingCedula(false);
    }
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    // Verificar errores de duplicados antes de proceder
    if (emailError || cedulaError) {
      setError('Por favor corrige los errores antes de continuar');
      return;
    }

    // Hacer una verificación final antes del registro
    await checkEmailExists(formData.email);
    await checkCedulaExists(formData.cedula);
    
    // Esperar un momento para que las verificaciones se completen
    await new Promise(resolve => setTimeout(resolve, 100));
    
    if (emailError || cedulaError) {
      setError('Este email o cédula ya están registrados');
      return;
    }
    const result = await register(formData);
    
    if (!result.success) {
      setError(result.error || 'Error durante el registro');
    } else {
      onRegistrationSuccess();
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (error) setError('');
    // Limpiar errores específicos cuando el usuario edita
    if (field === 'email' && emailError) setEmailError('');
    if (field === 'cedula' && cedulaError) setCedulaError('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 bg-gradient-to-r from-green-500 to-green-600 rounded-full mb-3">
          <UserPlus className="w-6 h-6 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Crear Cuenta</h2>
        <p className="text-gray-600 text-sm">Únete a SIMAUD hoy mismo</p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
            Nombre completo
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <User className="h-4 w-4 text-gray-400" />
            </div>
            <input
              id="name"
              type="text"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-white"
              placeholder="Juan Pérez"
              disabled={isLoading}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
              Teléfono
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Phone className="h-4 w-4 text-gray-400" />
              </div>
              <input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                className={`block w-full pl-10 pr-10 py-2.5 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-white ${
                  emailError ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="+1234567890"
                disabled={isLoading}
              />
            </div>
          </div>

          <div>
            <label htmlFor="cedula" className="block text-sm font-medium text-gray-700 mb-2">
              Cédula
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <CreditCard className="h-4 w-4 text-gray-400" />
              </div>
              <input
                id="cedula"
                type="text"
                value={formData.cedula}
                onChange={(e) => handleInputChange('cedula', e.target.value)}
                  onBlur={(e) => checkCedulaExists(e.target.value)}
                  className={`block w-full pl-10 pr-10 py-2.5 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-white ${
                    cedulaError ? 'border-red-300' : 'border-gray-300'
                  }`}
                placeholder="12345678"
                disabled={isLoading}
              />
              {isCheckingCedula && (
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                  <LoadingSpinner size="small" />
                </div>
              )}
            </div>
            {cedulaError && (
              <p className="mt-1 text-sm text-red-600">{cedulaError}</p>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
            Correo electrónico
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Mail className="h-4 w-4 text-gray-400" />
            </div>
            <input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              onBlur={(e) => checkEmailExists(e.target.value)}
              className={`block w-full pl-10 pr-10 py-2.5 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-white ${
                emailError ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="juan@email.com"
              disabled={isLoading}
            />
            {isCheckingEmail && (
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                <LoadingSpinner size="small" />
              </div>
            )}
          </div>
          {emailError && (
            <p className="mt-1 text-sm text-red-600">{emailError}</p>
          )}
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
            Contraseña
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Lock className="h-4 w-4 text-gray-400" />
            </div>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={formData.password}
              onChange={(e) => handleInputChange('password', e.target.value)}
              className="block w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-white"
              placeholder="••••••••"
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
              disabled={isLoading}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4 text-gray-400 hover:text-gray-600" />
              ) : (
                <Eye className="h-4 w-4 text-gray-400 hover:text-gray-600" />
              )}
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
            Confirmar contraseña
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Lock className="h-4 w-4 text-gray-400" />
            </div>
            <input
              id="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              value={formData.confirmPassword}
              onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
              className="block w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-white"
              placeholder="••••••••"
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
              disabled={isLoading}
            >
              {showConfirmPassword ? (
                <EyeOff className="h-4 w-4 text-gray-400 hover:text-gray-600" />
              ) : (
                <Eye className="h-4 w-4 text-gray-400 hover:text-gray-600" />
              )}
            </button>
          </div>
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-red-50 border border-red-200 rounded-lg p-4"
          >
            <div className="flex items-start space-x-2">
              <div className="flex-shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-red-800">Error en el registro</p>
                <p className="mt-1 text-red-600">{error}</p>
              </div>
            </div>
          </motion.div>
        )}

        <motion.button
          type="submit"
          disabled={isLoading || isCheckingEmail || isCheckingCedula}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="w-full bg-gradient-to-r from-green-500 to-green-600 text-white py-3 px-4 rounded-lg font-semibold hover:from-green-600 hover:to-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
        >
          {isLoading ? (
            <>
              <LoadingSpinner size="small" />
              <span>Creando cuenta...</span>
            </>
          ) : (
            <>
              <UserPlus className="w-5 h-5" />
              <span>Crear cuenta</span>
            </>
          )}
        </motion.button>
      </form>

      {/* Switch to Login */}
      <div className="text-center">
        <p className="text-gray-600">
          ¿Ya tienes cuenta?{' '}
          <button
            onClick={onSwitchToLogin}
            className="text-blue-600 hover:text-blue-700 font-semibold transition-colors duration-200"
            disabled={isLoading}
          >
            Inicia sesión aquí
          </button>
        </p>
        {onBackToLanding && (
          <p className="text-gray-500 text-sm mt-2">
            <button
              onClick={onBackToLanding}
              className="text-gray-500 hover:text-gray-700 transition-colors duration-200 hover:underline"
              disabled={isLoading}
            >
              ← Volver al inicio
            </button>
          </p>
        )}
      </div>
    </div>
  );
};