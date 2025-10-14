import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  X, 
  AlertTriangle, 
  Save, 
  FileText,
  User,
  Calendar,
  CheckCircle
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { useAuth } from '../../contexts/AuthContext';
import type { Contract } from '../../types/contracts';

interface ContractCancellationModalProps {
  isOpen: boolean;
  onClose: () => void;
  contract: Contract;
  onSuccess: () => void;
}

interface CancellationData {
  reason: 'breach' | 'mutual_agreement' | 'client_request' | 'payment_default' | 'other';
  description: string;
}

export const ContractCancellationModal: React.FC<ContractCancellationModalProps> = ({
  isOpen,
  onClose,
  contract,
  onSuccess
}) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  
  const [formData, setFormData] = useState<CancellationData>({
    reason: 'mutual_agreement',
    description: ''
  });

  const reasonOptions = [
    { value: 'breach', label: 'Incumplimiento de contrato' },
    { value: 'mutual_agreement', label: 'Mutuo acuerdo' },
    { value: 'client_request', label: 'Solicitud del cliente' },
    { value: 'payment_default', label: 'Falta de pago' },
    { value: 'other', label: 'Otra razón' }
  ];

  const validateForm = () => {
    if (!formData.description.trim()) {
      return 'La descripción de la cancelación es requerida';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);

    try {
      if (!user) throw new Error('Usuario no autenticado');

      console.log('🗑️ Cancelling contract:', contract.id);

      // Crear registro de cancelación
      const { data: cancellationData, error: cancellationError } = await supabase
        .from('contract_cancellations')
        .insert({
          contract_id: contract.id,
          cancelled_by: user.id,
          reason: formData.reason,
          description: formData.description,
          status: 'approved',
          approved_by: user.id,
          approved_at: new Date().toISOString()
        })
        .select()
        .single();

      if (cancellationError) throw cancellationError;
      console.log('✅ Cancellation record created:', cancellationData);

      // Actualizar estado del contrato
      const { data: updatedContract, error: contractError } = await supabase
        .from('contracts')
        .update({
          approval_status: 'cancelled',
          status: 'cancelled',
          actual_status: 'cancelled',
          rejection_reason: `CANCELADO: ${formData.description}`, // Store cancellation reason for signatories
          updated_at: new Date().toISOString()
        })
        .eq('id', contract.id)
        .select()
        .single();

      if (contractError) throw contractError;
      console.log('✅ Contract status updated to cancelled:', updatedContract);

      // Mostrar mensaje de éxito
      setSuccessMessage('Contrato cancelado exitosamente');
      
      // Llamar onSuccess inmediatamente para refrescar la UI padre
      onSuccess();
      
      // Force reload de la página para asegurar que la UI se actualice
      setTimeout(() => {
        window.location.reload();
      }, 1000);
      
      // Esperar 2 segundos antes de cerrar
      setTimeout(() => {
        onClose();
      }, 2000);
      
    } catch (error: any) {
      console.error('Error cancelling contract:', error);
      setError(error.message || 'Error al cancelar el contrato');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof CancellationData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (error) setError('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-red-100">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Cancelar Contrato</h3>
              <p className="text-sm text-gray-600">
                Esta acción marcará el contrato como cancelado
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-2 rounded-lg hover:bg-gray-100 transition-colors duration-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contract Info */}
        <div className="p-6 border-b border-gray-200 bg-gray-50">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Información del Contrato</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="flex items-center space-x-2 mb-1">
                <FileText className="w-4 h-4 text-gray-600" />
                <span className="text-sm font-medium">Título:</span>
              </div>
              <p className="text-sm text-gray-700">{contract.title}</p>
            </div>
            <div>
              <div className="flex items-center space-x-2 mb-1">
                <User className="w-4 h-4 text-gray-600" />
                <span className="text-sm font-medium">Cliente:</span>
              </div>
              <p className="text-sm text-gray-700">{contract.client_name}</p>
            </div>
            <div>
              <div className="flex items-center space-x-2 mb-1">
                <Calendar className="w-4 h-4 text-gray-600" />
                <span className="text-sm font-medium">Estado:</span>
              </div>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(contract.approval_status)}`}>
                {contract.approval_status.replace('_', ' ')}
              </span>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Razón de la Cancelación *
            </label>
            <select
              value={formData.reason}
              onChange={(e) => handleInputChange('reason', e.target.value as any)}
              className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              disabled={loading}
              required
            >
              {reasonOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Descripción Detallada *
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              rows={4}
              className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              placeholder="Explica detalladamente las razones de la cancelación..."
              disabled={loading}
              required
            />
          </div>

          {/* Warning */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-red-800">Advertencia</h4>
                <p className="text-sm text-red-700 mt-1">
                  Esta acción marcará el contrato como cancelado y se registrará en el historial. 
                  No se puede deshacer una vez procesada.
                </p>
              </div>
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
          {successMessage && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start space-x-3"
            >
              <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-green-800">Éxito</h4>
                <p className="text-sm text-green-700 mt-1">{successMessage}</p>
                <p className="text-xs text-green-600 mt-1">El modal se cerrará automáticamente...</p>
              </div>
            </motion.div>
          )}

          {/* Actions */}
          <div className="flex space-x-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors duration-200"
              disabled={loading || !!successMessage}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !!successMessage}
              className="flex-1 px-4 py-2.5 rounded-lg font-medium text-white transition-all duration-200 bg-red-600 hover:bg-red-700 disabled:bg-red-400"
            >
              {loading ? (
                <div className="flex items-center justify-center space-x-2">
                  <LoadingSpinner size="small" />
                  <span>Cancelando contrato...</span>
                </div>
              ) : successMessage ? (
                <div className="flex items-center justify-center space-x-2">
                  <CheckCircle className="w-4 h-4" />
                  <span>Contrato Cancelado</span>
                </div>
              ) : (
                <div className="flex items-center justify-center space-x-2">
                  <Save className="w-4 h-4" />
                  <span>Cancelar Contrato</span>
                </div>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

function getStatusColor(status: string) {
  switch (status) {
    case 'draft': return 'text-gray-600 bg-gray-100';
    case 'pending_approval': return 'text-orange-600 bg-orange-100';
    case 'approved': return 'text-green-600 bg-green-100';
    case 'rejected': return 'text-red-600 bg-red-100';
    case 'signed': return 'text-blue-600 bg-blue-100';
    case 'completed': return 'text-purple-600 bg-purple-100';
    case 'active': return 'text-green-600 bg-green-100';
    case 'expiring_soon': return 'text-yellow-600 bg-yellow-100';
    case 'expired': return 'text-red-600 bg-red-100';
    case 'cancelled': return 'text-gray-600 bg-gray-100';
    case 'renewed': return 'text-blue-600 bg-blue-100';
    default: return 'text-gray-600 bg-gray-100';
  }
}