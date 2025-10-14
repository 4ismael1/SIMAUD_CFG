import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  Eye, 
  MessageCircle,
  Calendar,
  User,
  FileText,
  Send,
  AlertTriangle
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { ContractViewModal } from './ContractViewModal';
import { useAuth } from '../../contexts/AuthContext';
import type { Contract, ContractApproval } from '../../types/contracts';

export const ContractApprovalQueue: React.FC = () => {
  const { user } = useAuth();
  const [approvals, setApprovals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [approvalModal, setApprovalModal] = useState<{
    isOpen: boolean;
    approval: any | null;
    action: 'approve' | 'reject' | null;
  }>({ isOpen: false, approval: null, action: null });
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    loadApprovals();
  }, []);

  const loadApprovals = async () => {
    try {
      setLoading(true);
      setSuccessMessage('');
      setErrorMessage('');
      
      console.log('🔍 Loading approvals for supervisor...');
      
      const { data, error } = await supabase
        .from('contract_approvals')
        .select(`
          id,
          contract_id,
          version_number,
          requested_by,
          requested_at,
          reviewed_by,
          reviewed_at,
          status,
          comments,
          created_at,
          contract:contracts(
            id,
            template_id,
            title,
            content,
            variables_data,
            client_name,
            client_email,
            client_phone,
            status,
            created_by,
            created_at,
            updated_at,
            approval_status,
            current_version,
            approved_by,
            approved_at,
            rejection_reason,
            contract_value,
            start_date,
            end_date,
            generated_content,
            notes,
            template:contract_templates(title)
          ),
          requester:user_profiles!requested_by(name, email)
        `)
        .eq('status', 'pending')
        .order('requested_at', { ascending: false });

      if (error) {
        console.error('❌ Error loading approvals:', error);
        throw error;
      }
      
      console.log('✅ Loaded approvals data:', data);
      setApprovals(data || []);
    } catch (error) {
      console.error('Error loading approvals:', error);
      setErrorMessage('Error al cargar las aprobaciones');
    } finally {
      setLoading(false);
    }
  };

  const handleViewContract = (contract: Contract) => {
    setSelectedContract(contract);
    setIsViewModalOpen(true);
  };

  const handleApprovalAction = (approval: any, action: 'approve' | 'reject') => {
    setApprovalModal({ isOpen: true, approval, action });
    setComments('');
  };

  const submitApproval = async () => {
    if (!approvalModal.approval || !approvalModal.action || !user?.id) {
      console.error('❌ Missing required data:', {
        approval: !!approvalModal.approval,
        action: !!approvalModal.action,
        userId: !!user?.id
      });
      setErrorMessage('Error: Faltan datos requeridos para procesar la aprobación');
      return;
    }

    setSubmitting(true);
    try {
      const isApproved = approvalModal.action === 'approve';
      
      // Debug logs para verificar que se ejecuta
      console.log('🔄 Processing approval:', {
        approvalId: approvalModal.approval.id,
        contractId: approvalModal.approval.contract.id,
        action: approvalModal.action,
        comments: comments,
        isApproved
      });

      // PASO 1: Actualizar el registro de aprobación
      const { error: approvalError } = await supabase
        .from('contract_approvals')
        .update({
          status: isApproved ? 'approved' : 'rejected',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          comments: comments || null
        })
        .eq('id', approvalModal.approval.id);

      if (approvalError) {
        console.error('Error updating approval:', approvalError);
        setErrorMessage('Error al actualizar el registro de aprobación');
        throw approvalError;
      }
      
      console.log('✅ Approval record updated successfully');

      // PASO 2: Actualizar el contrato (CRÍTICO)
      const contractUpdate: any = {
        approval_status: isApproved ? 'approved' : 'rejected',
        status: isApproved ? 'active' : 'draft',
        actual_status: isApproved ? 'active' : 'draft'
      };

      if (isApproved) {
        contractUpdate.approved_by = user.id;
        contractUpdate.approved_at = new Date().toISOString();
        contractUpdate.rejection_reason = null; // Limpiar rechazo previo
      } else {
        contractUpdate.rejection_reason = comments || 'Rechazado sin comentarios';
        contractUpdate.approved_by = null;
        contractUpdate.approved_at = null;
      }

      console.log('📝 Updating contract with data:', contractUpdate);

      // Forzar actualización con múltiples intentos si es necesario
      const { error: contractError } = await supabase
        .from('contracts')
        .update(contractUpdate)
        .eq('id', approvalModal.approval.contract.id);

      if (contractError) {
        console.error('Error updating contract:', contractError);
        setErrorMessage('Error al actualizar el estado del contrato');
        throw contractError;
      }

      console.log('✅ Contract updated successfully');
      
      // PASO 3: Recargar la lista para refrescar UI
      await loadApprovals();
      
      setApprovalModal({ isOpen: false, approval: null, action: null });
      setSuccessMessage(`Contrato ${isApproved ? 'aprobado' : 'rechazado'} exitosamente`);
      
      // Limpiar mensaje después de 5 segundos
      setTimeout(() => setSuccessMessage(''), 5000);
      
    } catch (error) {
      console.error('💥 Error processing approval:', error);
      setErrorMessage(`Error al procesar la aprobación: ${error.message || 'Error desconocido'}`);
      setTimeout(() => setErrorMessage(''), 5000);
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatCurrency = (value: number | null) => {
    if (!value) return 'N/A';
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'USD'
    }).format(value);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Cola de Aprobaciones</h2>
        <p className="text-gray-600 mt-1">
          Contratos pendientes de aprobación ({approvals.length} pendientes)
        </p>
      </div>

      {/* Success Message */}
      {successMessage && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start space-x-3"
        >
          <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-green-800">Éxito</h4>
            <p className="text-sm text-green-700 mt-1">{successMessage}</p>
          </div>
          <button
            onClick={() => setSuccessMessage('')}
            className="ml-auto text-green-500 hover:text-green-700"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </motion.div>
      )}

      {/* Error Message */}
      {errorMessage && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3"
        >
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-red-800">Error</h4>
            <p className="text-sm text-red-700 mt-1">{errorMessage}</p>
          </div>
          <button
            onClick={() => setErrorMessage('')}
            className="ml-auto text-red-500 hover:text-red-700"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </motion.div>
      )}
      {/* Approvals List */}
      {approvals.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
          <CheckCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 text-lg font-medium">No hay aprobaciones pendientes</p>
          <p className="text-gray-400 text-sm">
            Los contratos aparecerán aquí cuando necesiten aprobación
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {approvals.map((approval) => (
            <motion.div
              key={approval.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all duration-200 overflow-hidden"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="flex items-center justify-center w-10 h-10 bg-orange-100 rounded-full">
                      <Clock className="w-5 h-5 text-orange-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        {approval.contract?.title || 'Contrato sin título'}
                      </h3>
                      <p className="text-sm text-gray-600">
                        Solicitado por {approval.requester?.name || 'Usuario desconocido'}
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-orange-600 bg-orange-100">
                    <Clock className="w-3 h-3 mr-1" />
                    Pendiente
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center space-x-2 mb-1">
                      <User className="w-4 h-4 text-gray-600" />
                      <span className="text-sm font-medium text-gray-900">Cliente</span>
                    </div>
                    <p className="text-sm text-gray-600">{approval.contract?.client_name || 'No especificado'}</p>
                    <p className="text-xs text-gray-500">{approval.contract?.client_email || 'Sin email'}</p>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center space-x-2 mb-1">
                      <FileText className="w-4 h-4 text-gray-600" />
                      <span className="text-sm font-medium text-gray-900">Valor</span>
                    </div>
                    <p className="text-sm text-gray-600">
                      {formatCurrency(approval.contract?.contract_value)}
                    </p>
                    <p className="text-xs text-gray-500">
                      Template: {approval.contract?.template?.title || 'Sin plantilla'}
                    </p>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center space-x-2 mb-1">
                      <Calendar className="w-4 h-4 text-gray-600" />
                      <span className="text-sm font-medium text-gray-900">Solicitado</span>
                    </div>
                    <p className="text-sm text-gray-600">
                      {formatDate(approval.requested_at)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                  <div className="flex space-x-2">
                    <button
                      onClick={() => approval.contract && handleViewContract(approval.contract)}
                      disabled={!approval.contract}
                      className="flex items-center space-x-2 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors duration-200"
                    >
                      <Eye className="w-4 h-4" />
                      <span>Ver Contrato</span>
                    </button>
                  </div>
                  
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleApprovalAction(approval, 'reject')}
                      className="flex items-center space-x-2 px-4 py-2 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors duration-200"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Rechazar</span>
                    </button>
                    <button
                      onClick={() => handleApprovalAction(approval, 'approve')}
                      className="flex items-center space-x-2 px-4 py-2 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors duration-200"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>Aprobar</span>
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* View Contract Modal */}
      {isViewModalOpen && selectedContract && (
        <ContractViewModal
          isOpen={isViewModalOpen}
          onClose={() => setIsViewModalOpen(false)}
          contract={selectedContract}
        />
      )}

      {/* Approval Action Modal */}
      {approvalModal.isOpen && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md"
          >
            <div className="flex items-center space-x-3 mb-4">
              <div className={`flex items-center justify-center w-12 h-12 rounded-full ${
                approvalModal.action === 'approve' 
                  ? 'bg-green-100' 
                  : 'bg-red-100'
              }`}>
                {approvalModal.action === 'approve' ? (
                  <CheckCircle className="w-6 h-6 text-green-600" />
                ) : (
                  <XCircle className="w-6 h-6 text-red-600" />
                )}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {approvalModal.action === 'approve' ? 'Aprobar' : 'Rechazar'} Contrato
                </h3>
                <p className="text-sm text-gray-600">
                  {approvalModal.approval?.contract?.title || 'Contrato sin título'}
                </p>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Comentarios {approvalModal.action === 'reject' ? '(requeridos)' : '(opcionales)'}
              </label>
              <textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                rows={3}
                className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder={
                  approvalModal.action === 'approve' 
                    ? 'Comentarios sobre la aprobación...' 
                    : 'Explica por qué se rechaza el contrato...'
                }
                required={approvalModal.action === 'reject'}
              />
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => setApprovalModal({ isOpen: false, approval: null, action: null })}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors duration-200"
                disabled={submitting}
              >
                Cancelar
              </button>
              <button
                onClick={submitApproval}
                disabled={submitting || (approvalModal.action === 'reject' && !comments.trim())}
                className={`flex-1 px-4 py-2 rounded-lg font-medium text-white transition-colors duration-200 ${
                  approvalModal.action === 'approve'
                    ? 'bg-green-600 hover:bg-green-700 disabled:bg-green-400'
                    : 'bg-red-600 hover:bg-red-700 disabled:bg-red-400'
                }`}
              >
                {submitting ? (
                  <div className="flex items-center justify-center space-x-2">
                    <LoadingSpinner size="small" />
                    <span>Procesando...</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center space-x-2">
                    <Send className="w-4 h-4" />
                    <span>
                      {approvalModal.action === 'approve' ? 'Aprobar' : 'Rechazar'}
                    </span>
                  </div>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};