import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  X, 
  User, 
  Mail, 
  Phone, 
  CreditCard, 
  Lock, 
  Eye, 
  EyeOff,
  UserCheck,
  Save,
  AlertTriangle,
  CheckCircle
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { LoadingSpinner } from '../../common/LoadingSpinner';

interface UserProfile {
  id: string;
  email: string;
  name: string;
  phone: string;
  cedula: string;
  role: 'admin' | 'supervisor' | 'gestor' | 'user';
  created_at: string;
  updated_at: string;
}

interface UserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile | null;
  mode: 'create' | 'edit';
  onSuccess: () => void;
}

interface FormData {
  name: string;
  email: string;
  phone: string;
  cedula: string;
  role: 'admin' | 'supervisor' | 'gestor' | 'user';
  password: string;
  confirmPassword: string;
}

export const UserModal: React.FC<UserModalProps> = ({
  isOpen,
  onClose,
  user,
  mode,
  onSuccess
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    phone: '',
    cedula: '',
    role: 'user',
    password: '',
    confirmPassword: ''
  });

  useEffect(() => {
    if (user && mode === 'edit') {
      setFormData({
        name: user.name,
        email: user.email,
        phone: user.phone,
        cedula: user.cedula,
        role: user.role,
        password: '',
        confirmPassword: ''
      });
    } else {
      setFormData({
        name: '',
        email: '',
        phone: '',
        cedula: '',
        role: 'user',
        password: '',
        confirmPassword: ''
      });
    }
    setError('');
    setSuccess('');
  }, [user, mode, isOpen]);

  const validateForm = () => {
    if (!formData.name.trim()) return 'El nombre es requerido';
    if (!formData.email.trim()) return 'El email es requerido';
    if (!formData.phone.trim()) return 'El teléfono es requerido';
    if (!formData.cedula.trim()) return 'La cédula es requerida';
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) return 'Email inválido';
    
    const phoneRegex = /^[\+]?[0-9\s\-\(\)]{8,}$/;
    if (!phoneRegex.test(formData.phone)) return 'Teléfono inválido';
    
    // Validaciones de contraseña solo para crear o cuando se proporciona
    if (mode === 'create' || formData.password) {
      if (!formData.password) return 'La contraseña es requerida';
      if (formData.password.length < 6) return 'La contraseña debe tener al menos 6 caracteres';
      if (formData.password !== formData.confirmPassword) return 'Las contraseñas no coinciden';
    }
    
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);

    try {
      if (mode === 'create') {
        await handleCreateUser();
      } else {
        await handleUpdateUser();
      }
      onSuccess();
    } catch (error: any) {
      console.error('Error in form submission:', error);
      setError(error.message || 'Error al procesar la solicitud');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async () => {
    // La creación de usuarios requiere permisos de administrador del servidor
    // Esta funcionalidad debe implementarse usando Supabase Edge Functions
    throw new Error('La creación de usuarios debe implementarse en el servidor por seguridad');
  };

  const handleUpdateUser = async () => {
    if (!user) {
      throw new Error('No se encontró el usuario a editar');
    }

    try {
      // Verificar si la cédula cambió y ya existe
      if (formData.cedula !== user.cedula) {
        const { data: existingProfile } = await supabase
          .from('user_profiles')
          .select('cedula')
          .eq('cedula', formData.cedula)
          .neq('id', user.id)
          .maybeSingle();

        if (existingProfile) {
          throw new Error('Ya existe un usuario con esta cédula');
        }
      }

      // Verificar si el email cambió y ya existe
      if (formData.email !== user.email) {
        const { data: existingEmail } = await supabase
          .from('user_profiles')
          .select('email')
          .eq('email', formData.email)
          .neq('id', user.id)
          .maybeSingle();

        if (existingEmail) {
          throw new Error('Ya existe un usuario con este email');
        }
      }
      // Actualizar perfil en la base de datos
      const { error: profileError } = await supabase
        .from('user_profiles')
        .update({
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          cedula: formData.cedula,
          role: formData.role,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (profileError) throw profileError;

      console.log('✅ Perfil de usuario actualizado exitosamente');
      
      // Actualizar email en Supabase Auth si cambió
      if (formData.email !== user.email) {
        try {
          const { error: emailError } = await supabase.auth.admin.updateUserById(
            user.id,
            { email: formData.email }
          );
          
          if (emailError) {
            console.warn('Error updating email in auth:', emailError);
            // No lanzar error aquí, solo advertir
          } else {
            console.log('✅ Email actualizado en auth');
          }
        } catch (emailError) {
          console.warn('Error updating email in auth (admin privileges required):', emailError);
        }
      }
      
      // Actualizar contraseña en Supabase Auth si se proporcionó
      if (formData.password) {
        try {
          const { error: passwordError } = await supabase.auth.admin.updateUserById(
            user.id,
            { password: formData.password }
          );
          
          if (passwordError) {
            console.warn('Error updating password in auth:', passwordError);
            // No lanzar error aquí, solo advertir
          } else {
            console.log('✅ Contraseña actualizada en auth');
          }
        } catch (passwordError) {
          console.warn('Error updating password in auth (admin privileges required):', passwordError);
        }
      }

      setSuccess('Usuario actualizado exitosamente');
      
      // Cerrar modal después de 2 segundos
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 2000);
      
    } catch (error) {
      throw error;
    }
  };

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (error) setError('');
    if (success) setSuccess('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-lg ${
              mode === 'create' ? 'bg-green-100' : 'bg-blue-100'
            }`}>
              {mode === 'create' ? (
                <UserCheck className="w-6 h-6 text-green-600" />
              ) : (
                <User className="w-6 h-6 text-blue-600" />
              )}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {mode === 'create' ? 'Crear Nuevo Usuario' : 'Editar Usuario'}
              </h3>
              <p className="text-sm text-gray-600">
                {mode === 'create' 
                  ? 'Completa la información para crear un usuario'
                  : 'Modifica la información del usuario'
                }
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-2 rounded-lg hover:bg-gray-100 transition-colors duration-200"
          >
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nombre completo *
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Juan Pérez"
                disabled={loading}
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Correo electrónico *
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="juan@email.com"
                disabled={loading}
              />
            </div>
          </div>

          {/* Phone and Cedula */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Teléfono *
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="+1234567890"
                  disabled={loading}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Cédula *
              </label>
              <div className="relative">
                <CreditCard className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  value={formData.cedula}
                  onChange={(e) => handleInputChange('cedula', e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="12345678"
                  disabled={loading}
                />
              </div>
            </div>
          </div>

          {/* Role */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Rol *
            </label>
            <select
              value={formData.role}
              onChange={(e) => handleInputChange('role', e.target.value as 'admin' | 'supervisor' | 'gestor' | 'user')}
              className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={loading}
            >
              <option value="user">Usuario</option>
              <option value="gestor">Gestor de Contratos</option>
              <option value="supervisor">Supervisor</option>
              <option value="admin">Administrador</option>
            </select>
          </div>

          {/* Password Section */}
          <div className="border-t border-gray-200 pt-4">
            <h4 className="text-sm font-medium text-gray-900 mb-3">
              {mode === 'create' ? 'Contraseña *' : 'Cambiar Contraseña (Opcional)'}
            </h4>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {mode === 'create' ? 'Contraseña *' : 'Nueva Contraseña'}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => handleInputChange('password', e.target.value)}
                    className="block w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder={mode === 'create' ? 'Contraseña' : 'Dejar vacío para no cambiar'}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    disabled={loading}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {(mode === 'create' || formData.password) && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Confirmar Contraseña *
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={formData.confirmPassword}
                      onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                      className="block w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Confirmar contraseña"
                      disabled={loading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      disabled={loading}
                    >
                      {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3"
            >
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-red-800">Error</h4>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            </motion.div>
          )}

          {/* Success Message */}
          {success && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start space-x-3"
            >
              <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-green-800">Éxito</h4>
                <p className="text-sm text-green-700 mt-1">{success}</p>
              </div>
            </motion.div>
          )}
          {/* Actions */}
          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors duration-200"
              disabled={loading || !!success}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !!success}
              className={`flex-1 px-4 py-2.5 rounded-lg font-medium text-white transition-all duration-200 ${
                mode === 'create'
                  ? 'bg-green-600 hover:bg-green-700 disabled:bg-green-400'
                  : 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400'
              }`}
            >
              {success ? (
                <div className="flex items-center justify-center space-x-2">
                  <CheckCircle className="w-4 h-4" />
                  <span>Usuario Actualizado</span>
                </div>
              ) : loading ? (
                <div className="flex items-center justify-center space-x-2">
                  <LoadingSpinner size="small" />
                  <span>{mode === 'create' ? 'Creando...' : 'Actualizando...'}</span>
                </div>
              ) : (
                <div className="flex items-center justify-center space-x-2">
                  <Save className="w-4 h-4" />
                  <span>{mode === 'create' ? 'Crear Usuario' : 'Actualizar Usuario'}</span>
                </div>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};