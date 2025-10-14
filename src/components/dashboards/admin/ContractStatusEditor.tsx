import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  X, 
  Save, 
  Settings, 
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
  FileText,
  RefreshCw
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { LoadingSpinner } from '../../common/LoadingSpinner';
import type { Contract } from '../../../types/contracts';

interface ContractStatusEditorProps {
  isOpen: boolean;
  onClose: () => void;
  contract: Contract;
  onSuccess: () => void;
}

interface StatusData {
  status: 'draft' | 'active' | 'completed' | 'cancelled';
  approval_status: 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'signed' | 'completed';
  actual_status: 'draft' | 'active' | 'expiring_soon' | 'expired' | 'completed' | 'cancelled' | 'renewed';
  rejection_reason: string;
  notes: string;
}

export const ContractStatusEditor: React.FC<ContractStatusEditorProps> = ({
  isOpen,
  onClose,
  contract,
  onSuccess
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [statusData, setStatusData] = useState<StatusData>({
    status: contract.status,
    approval_status: contract.approval_status,
    actual_status: contract.actual_status,
    rejection_reason: contract.rejection_reason || '',
    notes: contract.notes || ''
  });

  const statusOptions = {
    status: [
      { value: 'draft', label: 'Borrador' },
      { value: 'active', label: 'Activo' },
      { value: 'completed', label: 'Completado' },
      { value: 'cancelled', label: 'Cancelado' }
    ],
    approval_status: [
      { value: 'draft', label: 'Borrador' },
      { value: 'pending_approval', label: 'Pendiente Aprobación' },
      { value: 'approved', label: 'Aprobado' },
      { value: 'rejected', label: 'Rechazado' },
      { value: 'signed', label: 'Firmado' },
      { value: 'completed', label: 'Completado' }
    ],
    actual_status: [
      { value: 'draft', label: 'Borrador' },
      { value: 'active', label: 'Activo' },
      { value: 'expiring_soon', label: 'Próximo a Vencer' },
      { value: 'expired', label: 'Vencido' },
      { value: 'completed', label: 'Completado' },
      { value: 'cancelled', label: 'Cancelado' },
      { value: 'renewed', label: 'Renovado' }
    ]
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      console.log('Updating contract statuses:', statusData);

      const { error: updateError } = await supabase
        .from('contracts')
        .update({
          status: statusData.status,
          approval_status: statusData.approval_status,
          actual_status: statusData.actual_status,
          rejection_reason: statusData.rejection_reason || null,
          notes: statusData.notes || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', contract.id);

      if (updateError) throw updateError;

      console.log('Contract statuses updated successfully');
      onSuccess();
    } catch (error: any) {
      console.error('Error updating contract statuses:', error);
      setError(error.message || 'Error al actualizar los estados del contrato');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof StatusData, value: string) => {
    setStatusData(prev => ({ ...prev, [field]: value }));
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
            <div className="p-2 rounded-lg bg-blue-100">
              <Settings className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Editor de Estados</h3>
              <p className="text-sm text-gray-600">
                Modifica todos los estados del contrato
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
          <h4 className="text-sm font-semibold text-gray-900 mb-2">Contrato:</h4>
          <p className="text-lg font-medium text-gray-900">{contract.title}</p>
          <p className="text-sm text-gray-600">Cliente: {contract.client_name}</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Status Fields */}
          <div className="grid grid-cols-1 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Estado General
              </label>
              <select
                value={statusData.status}
                onChange={(e) => handleInputChange('status', e.target.value)}
                className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={loading}
              >
                {statusOptions.status.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Estado de Aprobación
              </label>
              <select
                value={statusData.approval_status}
                onChange={(e) => handleInputChange('approval_status', e.target.value)}
                className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={loading}
              >
                {statusOptions.approval_status.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Estado Actual (Ciclo de Vida)
              </label>
              <select
                value={statusData.actual_status}
                onChange={(e) => handleInputChange('actual_status', e.target.value)}
                className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={loading}
              >
                {statusOptions.actual_status.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Rejection Reason */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Razón de Rechazo/Cancelación
            </label>
            <textarea
              value={statusData.rejection_reason}
              onChange={(e) => handleInputChange('rejection_reason', e.target.value)}
              rows={3}
              className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Razón del rechazo o cancelación (opcional)"
              disabled={loading}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notas Administrativas
            </label>
            <textarea
              value={statusData.notes}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              rows={3}
              className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Notas adicionales sobre el contrato"
              disabled={loading}
            />
          </div>

          {/* Warning */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-yellow-800">Advertencia</h4>
                <p className="text-sm text-yellow-700 mt-1">
                  Cambiar los estados puede afectar el flujo del contrato y las notificaciones. 
                  Úsalo solo cuando sea necesario corregir estados inconsistentes.
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

          {/* Actions */}
          <div className="flex space-x-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors duration-200"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-lg font-medium text-white transition-all duration-200 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400"
            >
              {loading ? (
                <div className="flex items-center justify-center space-x-2">
                  <LoadingSpinner size="small" />
                  <span>Actualizando...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center space-x-2">
                  <Save className="w-4 h-4" />
                  <span>Actualizar Estados</span>
                </div>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};