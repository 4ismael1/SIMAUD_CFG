import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  X, 
  CheckCircle, 
  XCircle, 
  Send,
  Calendar,
  DollarSign,
  User,
  AlertTriangle,
  FileText
} from 'lucide-react';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { supabase } from '../../lib/supabase';

interface RenewalProcessModalProps {
  isOpen: boolean;
  onClose: () => void;
  renewal: any;
  onSuccess: () => void;
}

export const RenewalProcessModal: React.FC<RenewalProcessModalProps> = ({
  isOpen,
  onClose,
  renewal,
  onSuccess
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);
  const [gestorResponse, setGestorResponse] = useState('');

  const handleSubmit = async (selectedAction: 'approve' | 'reject') => {
    if (selectedAction === 'reject' && !gestorResponse.trim()) {
      setError('Debes proporcionar una razón para rechazar la renovación');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Get the user's session token
      const { data: session, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.session) {
        throw new Error('No se pudo obtener la sesión del usuario');
      }

      const requestResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/renewal-manager?action=process`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            renewal_id: renewal.id,
            status: selectedAction === 'approve' ? 'approved' : 'rejected',
            gestor_response: gestorResponse,
            processed_by: session.session.user.id
          })
        }
      );

      if (!requestResponse.ok) {
        throw new Error('Error al procesar renovación');
      }

      const result = await requestResponse.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Error al procesar renovación');
      }

      console.log('✅ Renewal processed successfully:', result);
      
      // Close modal and refresh parent
      onSuccess();
      onClose();
      
    } catch (error: any) {
      console.error('Error processing renewal:', error);
      setError(error.message || 'Error al procesar la renovación');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatCurrency = (value: number | null) => {
    if (!value) return 'N/A';
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'USD'
    }).format(value);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-blue-100">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Procesar Renovación</h3>
              <p className="text-sm text-gray-600">
                Revisa y procesa la solicitud de renovación
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

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Renewal Info */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">Información de la Solicitud</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center space-x-2 mb-1">
                  <FileText className="w-4 h-4 text-gray-600" />
                  <span className="text-sm font-medium">Contrato:</span>
                </div>
                <p className="text-sm text-gray-700">{renewal.original_contract?.title}</p>
              </div>
              <div>
                <div className="flex items-center space-x-2 mb-1">
                  <User className="w-4 h-4 text-gray-600" />
                  <span className="text-sm font-medium">Cliente:</span>
                </div>
                <p className="text-sm text-gray-700">{renewal.original_contract?.client_name}</p>
              </div>
              <div>
                <div className="flex items-center space-x-2 mb-1">
                  <Calendar className="w-4 h-4 text-gray-600" />
                  <span className="text-sm font-medium">Vencimiento Actual:</span>
                </div>
                <p className="text-sm text-gray-700">{formatDate(renewal.original_contract?.end_date)}</p>
              </div>
              <div>
                <div className="flex items-center space-x-2 mb-1">
                  <DollarSign className="w-4 h-4 text-gray-600" />
                  <span className="text-sm font-medium">Valor Actual:</span>
                </div>
                <p className="text-sm text-gray-700">{formatCurrency(renewal.original_contract?.contract_value)}</p>
              </div>
            </div>
          </div>

          {/* Proposed Changes */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-green-900 mb-3">Cambios Propuestos</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center space-x-2 mb-1">
                  <Calendar className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium">Nueva Vigencia:</span>
                </div>
                <p className="text-sm text-green-700">
                  {formatDate(renewal.proposed_start_date)} - {formatDate(renewal.proposed_end_date)}
                </p>
              </div>
              <div>
                <div className="flex items-center space-x-2 mb-1">
                  <DollarSign className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium">Nuevo Valor:</span>
                </div>
                <p className="text-sm text-green-700">{formatCurrency(renewal.proposed_value)}</p>
                {renewal.proposed_value !== renewal.original_contract?.contract_value && (
                  <p className="text-xs text-green-600">
                    Cambio: {renewal.proposed_value > renewal.original_contract?.contract_value ? '+' : ''}
                    ${(renewal.proposed_value - renewal.original_contract?.contract_value).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
            
            {renewal.proposed_changes?.renewal_reason && (
              <div className="mt-4">
                <div className="flex items-center space-x-2 mb-1">
                  <FileText className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium">Razón:</span>
                </div>
                <p className="text-sm text-green-700">{renewal.proposed_changes.renewal_reason}</p>
              </div>
            )}
          </div>

          {/* Response */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Respuesta del Gestor
            </label>
            <textarea
              value={gestorResponse}
              onChange={(e) => setGestorResponse(e.target.value)}
              rows={3}
              className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Proporciona comentarios sobre la decisión..."
              disabled={loading}
            />
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
              onClick={() => handleSubmit('reject')}
              disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-lg font-medium text-white transition-all duration-200 bg-red-600 hover:bg-red-700 disabled:bg-red-400"
            >
              {loading ? (
                <div className="flex items-center justify-center space-x-2">
                  <LoadingSpinner size="small" />
                  <span>Procesando...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center space-x-2">
                  <XCircle className="w-4 h-4" />
                  <span>Rechazar</span>
                </div>
              )}
            </button>
            <button
              onClick={() => handleSubmit('approve')}
              disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-lg font-medium text-white transition-all duration-200 bg-green-600 hover:bg-green-700 disabled:bg-green-400"
            >
              {loading ? (
                <div className="flex items-center justify-center space-x-2">
                  <LoadingSpinner size="small" />
                  <span>Procesando...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center space-x-2">
                  <CheckCircle className="w-4 h-4" />
                  <span>Aprobar Renovación</span>
                </div>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};