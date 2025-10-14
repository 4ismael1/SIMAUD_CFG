import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  X, 
  RefreshCw, 
  Save, 
  Calendar,
  DollarSign,
  FileText,
  AlertTriangle,
  User,
  Mail
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { useAuth } from '../../contexts/AuthContext';

interface RenewalRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  preselectedContractId?: string;
}

interface Contract {
  id: string;
  title: string;
  client_name: string;
  client_email: string;
  end_date: string;
  contract_value: number;
  auto_renewal: boolean;
}

interface FormData {
  contract_id: string;
  proposed_start_date: string;
  proposed_end_date: string;
  proposed_value: number | null;
  reason: string;
  proposed_changes: Record<string, any>;
}

export const RenewalRequestModal: React.FC<RenewalRequestModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  preselectedContractId
}) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [availableContracts, setAvailableContracts] = useState<Contract[]>([]);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  
  const [formData, setFormData] = useState<FormData>({
    contract_id: '',
    proposed_start_date: '', 
    proposed_end_date: '',
    proposed_value: null,
    reason: '',
    proposed_changes: {}
  });

  useEffect(() => {
    if (isOpen) {
      loadAvailableContracts();
      
      // Si hay un contrato preseleccionado, configurarlo
      if (preselectedContractId) {
        setFormData(prev => ({
          ...prev,
          contract_id: preselectedContractId
        }));
      }
    }
  }, [isOpen, preselectedContractId]);

  useEffect(() => {
    if (formData.contract_id) {
      const contract = availableContracts.find(c => c.id === formData.contract_id);
      setSelectedContract(contract || null);
      
      if (contract) {
        // Auto-fill dates: start next day after expiry, end 1 year later
        const startDate = new Date(contract.end_date);
        startDate.setDate(startDate.getDate() + 1);
        
        const endDate = new Date(startDate);
        endDate.setFullYear(endDate.getFullYear() + 1);
        
        setFormData(prev => ({
          ...prev,
          proposed_start_date: startDate.toISOString().split('T')[0],
          proposed_end_date: endDate.toISOString().split('T')[0],
          proposed_value: contract.contract_value
        }));
      }
    }
  }, [formData.contract_id, availableContracts]);

  const loadAvailableContracts = async () => {
    try {
      console.log('🔍 Loading available contracts for renewal...');
      
      // For users, get contracts where they are signatories
      // For gestores, get contracts they created
      let contractsQuery;
      
      if (user?.role === 'user') {
        // Get contracts where user is a signatory
        const { data: signatories, error: signatoryError } = await supabase
          .from('contract_signatories')
          .select('contract_id')
          .eq('user_id', user.id);
          
        if (signatoryError) throw signatoryError;
        
        const contractIds = signatories?.map(s => s.contract_id) || [];
        
        if (contractIds.length === 0) {
          setAvailableContracts([]);
          return;
        }
        
        contractsQuery = supabase
          .from('contracts')
          .select('id, title, client_name, client_email, end_date, contract_value, auto_renewal, actual_status')
          .in('id', contractIds);
      } else {
        // For gestores and above, get contracts they created
        contractsQuery = supabase
          .from('contracts')
          .select('id, title, client_name, client_email, end_date, contract_value, auto_renewal, actual_status')
          .eq('created_by', user?.id);
      }
      
      const { data: contracts, error } = await contractsQuery
        .eq('approval_status', 'signed')
        .in('actual_status', ['expiring_soon', 'expired', 'completed'])
        .not('end_date', 'is', null);

      if (error) throw error;

      // Filter out contracts that already have pending renewals
      const contractsWithoutRenewals = [];
      for (const contract of contracts) {
        const { data: existingRenewal } = await supabase
          .from('contract_renewals')
          .select('id')
          .eq('original_contract_id', contract.id)
          .eq('status', 'pending')
          .maybeSingle();

        if (!existingRenewal) {
          contractsWithoutRenewals.push(contract);
        }
      }

      console.log('✅ Found available contracts for renewal:', contractsWithoutRenewals.length);
      setAvailableContracts(contractsWithoutRenewals);
    } catch (error) {
      console.error('Error loading available contracts:', error);
      setError('Error al cargar contratos disponibles para renovación');
    }
  };

  const validateForm = () => {
    if (!formData.contract_id) return 'Debe seleccionar un contrato';
    if (!formData.proposed_start_date) return 'La fecha de inicio es requerida';
    if (!formData.proposed_end_date) return 'La fecha de fin es requerida';
    if (!formData.reason.trim()) return 'La razón de la renovación es requerida';
    
    const startDate = new Date(formData.proposed_start_date);
    const endDate = new Date(formData.proposed_end_date);
    
    if (endDate <= startDate) {
      return 'La fecha de fin debe ser posterior a la fecha de inicio';
    }
    
    if (selectedContract && startDate <= new Date(selectedContract.end_date)) {
      return 'La nueva fecha de inicio debe ser posterior al vencimiento del contrato actual';
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
      // Get the user's session token
      const { data: session, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.session?.access_token) {
        throw new Error('No se pudo obtener la sesión del usuario');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/renewal-manager?action=create`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            original_contract_id: formData.contract_id,
            proposed_start_date: formData.proposed_start_date,
            proposed_end_date: formData.proposed_end_date,
            proposed_value: formData.proposed_value,
            proposed_changes: {
              ...formData.proposed_changes,
              renewal_reason: formData.reason
            }
          })
        }
      );

      if (!response.ok) {
        throw new Error('Error al crear solicitud de renovación');
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Error al crear solicitud');
      }

      onSuccess();
    } catch (error: any) {
      console.error('Error creating renewal request:', error);
      setError(error.message || 'Error al crear la solicitud de renovación');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof FormData, value: any) => {
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
            <div className="p-2 rounded-lg bg-green-100">
              <RefreshCw className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Solicitar Renovación</h3>
              <p className="text-sm text-gray-600">
                Crea una solicitud para renovar un contrato próximo a vencer
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Contract Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Contrato a Renovar *
            </label>
            <select
              value={formData.contract_id}
              onChange={(e) => handleInputChange('contract_id', e.target.value)}
              className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
              disabled={loading || !!preselectedContractId}
              required
            >
              <option value="">Seleccionar contrato...</option>
              {availableContracts.map(contract => (
                <option key={contract.id} value={contract.id}>
                  {contract.title} - {contract.client_name} (Vence: {new Date(contract.end_date).toLocaleDateString('es-ES')})
                </option>
              ))}
            </select>
            {availableContracts.length === 0 && (
              <p className="text-sm text-gray-500 mt-1">
                No hay contratos disponibles para renovación en este momento
              </p>
            )}
            {preselectedContractId && (
              <p className="text-sm text-blue-600 mt-1 flex items-center space-x-1">
                <span>📌 Contrato preseleccionado desde la vista de detalles</span>
              </p>
            )}
          </div>

          {/* Contract Info (if selected) */}
          {selectedContract && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-blue-900 mb-3">Información del Contrato Actual</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="flex items-center space-x-2 mb-2">
                    <User className="w-4 h-4 text-blue-600" />
                    <span className="font-medium">Cliente:</span>
                  </div>
                  <p className="text-blue-800">{selectedContract.client_name}</p>
                  <p className="text-blue-600 text-xs">{selectedContract.client_email}</p>
                </div>
                <div>
                  <div className="flex items-center space-x-2 mb-2">
                    <Calendar className="w-4 h-4 text-blue-600" />
                    <span className="font-medium">Vencimiento:</span>
                  </div>
                  <p className="text-blue-800">{new Date(selectedContract.end_date).toLocaleDateString('es-ES')}</p>
                </div>
                <div>
                  <div className="flex items-center space-x-2 mb-2">
                    <DollarSign className="w-4 h-4 text-blue-600" />
                    <span className="font-medium">Valor Actual:</span>
                  </div>
                  <p className="text-blue-800">${selectedContract.contract_value?.toLocaleString()}</p>
                </div>
                <div>
                  <div className="flex items-center space-x-2 mb-2">
                    <RefreshCw className="w-4 h-4 text-blue-600" />
                    <span className="font-medium">Auto-renovación:</span>
                  </div>
                  <p className="text-blue-800">{selectedContract.auto_renewal ? 'Activada' : 'Desactivada'}</p>
                </div>
              </div>
            </div>
          )}

          {/* New Contract Dates */}
          {user?.role !== 'user' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nueva Fecha de Inicio *
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="date"
                  value={formData.proposed_start_date}
                  onChange={(e) => handleInputChange('proposed_start_date', e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  disabled={loading}
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nueva Fecha de Fin *
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="date"
                  value={formData.proposed_end_date}
                  onChange={(e) => handleInputChange('proposed_end_date', e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  disabled={loading}
                  required
                />
              </div>
            </div>
            </div>
          )}

          {/* New Value */}
          {user?.role !== 'user' && (
            <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nuevo Valor del Contrato
            </label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="number"
                step="0.01"
                value={formData.proposed_value || ''}
                onChange={(e) => handleInputChange('proposed_value', e.target.value ? parseFloat(e.target.value) : null)}
                className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                placeholder="0.00"
                disabled={loading}
              />
            </div>
            </div>
          )}

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Razón de la Renovación *
            </label>
            <textarea
              value={formData.reason}
              onChange={(e) => handleInputChange('reason', e.target.value)}
              rows={3}
              className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
              placeholder="Explica por qué se necesita renovar este contrato..."
              disabled={loading}
              required
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
              type="submit"
              disabled={loading || availableContracts.length === 0}
              className="flex-1 px-4 py-2.5 rounded-lg font-medium text-white transition-all duration-200 bg-green-600 hover:bg-green-700 disabled:bg-green-400"
            >
              {loading ? (
                <div className="flex items-center justify-center space-x-2">
                  <LoadingSpinner size="small" />
                  <span>Enviando solicitud...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center space-x-2">
                  <Save className="w-4 h-4" />
                  <span>Solicitar Renovación</span>
                </div>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};