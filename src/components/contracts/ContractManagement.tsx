import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  FileText,
  PlusCircle,
  Clock,
  CheckCircle,
  XCircle,
  Eye,
  Edit,
  Users,
  Calendar,
  DollarSign,
  Filter,
  Search,
  MoreHorizontal,
  Send,
  Trash2,
  RefreshCw,
  Archive,
  ArchiveRestore,
  AlertTriangle
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { ContractViewModal } from './ContractViewModal';
import { ContractModal } from './ContractModal';
import type { Contract } from '../../types/contracts';

interface ContractManagementProps {
  onCreateContract?: () => void;
}

export const ContractManagement: React.FC<ContractManagementProps> = ({ onCreateContract }) => {
  const { user } = useAuth();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [showContractModal, setShowContractModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [signatureProgress, setSignatureProgress] = useState<Record<string, { total: number; completed: number }>>({});
  const [showArchived, setShowArchived] = useState(false);
  const [archivingContract, setArchivingContract] = useState<string | null>(null);

  useEffect(() => {
    loadContracts();
  }, [user]);

  const loadContracts = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      console.log('Loading contracts for user:', user.id, 'role:', user.role);

      let query = supabase
        .from('contracts')
        .select(`
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
          auto_renewal,
          parent_contract_id,
          renewal_type,
          actual_status,
          archived,
          archived_at,
          archived_by,
          template:contract_templates(title),
          creator:user_profiles!created_by(name, email)
        `)
        .order('created_at', { ascending: false });

      // Apply role-based filtering
      if (user.role === 'gestor') {
        // Gestores only see their own contracts
        query = query.eq('created_by', user.id);
      } else if (user.role === 'user') {
        // Users should not access this component normally, but if they do, show nothing
        query = query.eq('created_by', 'none'); // This will return empty results
      }
      // Admin and supervisor see all contracts (no additional filter)
      
      // Filter archived contracts unless specifically showing archived
      if (!showArchived) {
        query = query.eq('archived', false);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error loading contracts:', error);
        throw error;
      }

      console.log('Loaded contracts:', data?.length);
      setContracts(data || []);

      // Load signature progress for each contract
      if (data && data.length > 0) {
        await loadSignatureProgress(data.map(c => c.id));
      }
    } catch (error) {
      console.error('Error loading contracts:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSignatureProgress = async (contractIds: string[]) => {
    try {
      const { data: signatories, error } = await supabase
        .from('contract_signatories')
        .select('contract_id, signed_at')
        .in('contract_id', contractIds);

      if (error) throw error;

      const progressMap: Record<string, { total: number; completed: number }> = {};
      
      contractIds.forEach(contractId => {
        const contractSignatories = signatories?.filter(s => s.contract_id === contractId) || [];
        progressMap[contractId] = {
          total: contractSignatories.length,
          completed: contractSignatories.filter(s => s.signed_at).length
        };
      });

      setSignatureProgress(progressMap);
    } catch (error) {
      console.error('Error loading signature progress:', error);
    }
  };

  const handleCreateContract = () => {
    setEditingContract(null);
    setShowContractModal(true);
    if (onCreateContract) onCreateContract();
  };

  const handleEditContract = (contract: Contract) => {
    setEditingContract(contract);
    setShowContractModal(true);
  };

  const handleViewContract = (contract: Contract) => {
    setSelectedContract(contract);
    setShowViewModal(true);
  };

  const handleDeleteContract = async (contract: Contract) => {
    if (!confirm(`¿Estás seguro de que quieres eliminar el contrato "${contract.title}"?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('contracts')
        .delete()
        .eq('id', contract.id);

      if (error) throw error;

      setContracts(prev => prev.filter(c => c.id !== contract.id));
    } catch (error) {
      console.error('Error deleting contract:', error);
      alert('Error al eliminar el contrato');
    }
  };

  const handleArchiveContract = async (contract: Contract) => {
    const action = contract.archived ? 'desarchivar' : 'archivar';
    if (!confirm(`¿Estás seguro de que quieres ${action} el contrato "${contract.title}"?`)) {
      return;
    }

    setArchivingContract(contract.id);
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('contracts')
        .update({
          archived: !contract.archived,
          archived_by: !contract.archived ? currentUser?.id : null,
          updated_at: new Date().toISOString()
        })
        .eq('id', contract.id);

      if (error) throw error;

      await loadContracts();
      console.log(`Contrato ${action}do exitosamente`);
    } catch (error) {
      console.error(`Error ${action}ndo contrato:`, error);
      alert(`Error al ${action} el contrato`);
    } finally {
      setArchivingContract(null);
    }
  };

  const handleUncancelContract = async (contract: Contract) => {
    if (!confirm(`¿Estás seguro de que quieres descancelar el contrato "${contract.title}"? El contrato volverá a estar activo para firmas.`)) {
      return;
    }

    try {
      // Update contract status back to approved (ready for signatures)
      const { error } = await supabase
        .from('contracts')
        .update({
          approval_status: 'approved',
          status: 'draft',
          actual_status: 'active',
          rejection_reason: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', contract.id);

      if (error) throw error;

      await loadContracts();
      console.log('Contrato descancelado exitosamente');
    } catch (error) {
      console.error('Error descancelando contrato:', error);
      alert('Error al descancelar el contrato');
    }
  };

  const handleSendForApproval = async (contract: Contract) => {
    console.log('🔄 Sending contract for approval:', contract.id);
    
    try {
      // First check current status
      const { data: currentContract, error: fetchError } = await supabase
        .from('contracts')
        .select('approval_status, current_version')
        .eq('id', contract.id)
        .single();
      
      if (fetchError) throw fetchError;
      
      console.log('📋 Current contract status:', currentContract);
      
      // Update contract status to pending_approval
      const { data: updatedContract, error } = await supabase
        .from('contracts')
        .update({ 
          approval_status: 'pending_approval',
          updated_at: new Date().toISOString()
        })
        .eq('id', contract.id)
        .select()
        .single();

      if (error) throw error;
      
      console.log('✅ Contract status updated:', updatedContract);
      
      // Wait a moment for trigger to execute
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Verify approval record was created
      const { data: approvalRecord, error: approvalError } = await supabase
        .from('contract_approvals')
        .select('*')
        .eq('contract_id', contract.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (approvalError) {
        console.error('❌ Error checking approval record:', approvalError);
      } else {
        console.log('📝 Approval record created:', approvalRecord);
      }
      
      console.log('✅ Contract sent for approval successfully');

      await loadContracts();
    } catch (error) {
      console.error('Error sending contract for approval:', error);
      alert('Error al enviar el contrato para aprobación');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'text-gray-600 bg-gray-100';
      case 'pending_approval': return 'text-orange-600 bg-orange-100';
      case 'approved': return 'text-green-600 bg-green-100';
      case 'rejected': return 'text-red-600 bg-red-100';
      case 'signed': return 'text-blue-600 bg-blue-100';
      case 'completed': return 'text-purple-600 bg-purple-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending_approval': return Clock;
      case 'approved': return CheckCircle;
      case 'rejected': return XCircle;
      case 'signed': return Users;
      case 'completed': return CheckCircle;
      default: return FileText;
    }
  };

  const getActualStatusDisplay = (actualStatus: string | undefined) => {
    switch (actualStatus) {
      case 'expired':
        return { text: 'VENCIDO', color: 'text-red-700 bg-red-100' };
      case 'expiring_soon':
        return { text: 'PRÓXIMO A VENCER', color: 'text-yellow-700 bg-yellow-100' };
      case 'cancelled':
        return { text: 'CANCELADO', color: 'text-red-700 bg-red-100' };
      case 'completed':
        return { text: 'FINALIZADO', color: 'text-purple-700 bg-purple-100' };
      case 'renewed':
        return { text: 'RENOVADO', color: 'text-blue-700 bg-blue-100' };
      default:
        return null;
    }
  };

  const getActualStatusIcon = (status: string) => {
    switch (status) {
      case 'expiring_soon': return Clock;
      case 'expired': return XCircle;
      case 'completed': return CheckCircle;
      case 'renewed': return RefreshCw;
      default: return FileText;
    }
  };

  const filteredContracts = contracts.filter(contract => {
    const matchesSearch = contract.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         contract.client_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'all' || contract.approval_status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
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

  const getSignatureProgressDisplay = (contractId: string) => {
    const progress = signatureProgress[contractId];
    if (!progress || progress.total === 0) {
      return null;
    }

    const isComplete = progress.completed === progress.total;
    const progressPercentage = (progress.completed / progress.total) * 100;

    return (
      <div className="flex items-center space-x-2 text-xs">
        <Users className="w-4 h-4 text-gray-400" />
        <span className={`font-medium ${isComplete ? 'text-green-600' : 'text-orange-600'}`}>
          {progress.completed}/{progress.total}
        </span>
        <div className="w-16 bg-gray-200 rounded-full h-1.5">
          <div 
            className={`h-1.5 rounded-full transition-all duration-300 ${
              isComplete ? 'bg-green-500' : 'bg-orange-500'
            }`}
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>
    );
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Gestión de Contratos</h2>
          <p className="text-gray-600">Administra y gestiona todos tus contratos</p>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleCreateContract}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200 font-medium"
        >
          <PlusCircle className="w-5 h-5 mr-2" />
          Nuevo Contrato
        </motion.button>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0 sm:space-x-4">
          <div className="flex items-center space-x-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Buscar contratos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            >
              <option value="all">Todos los estados</option>
              <option value="draft">Borrador</option>
              <option value="pending_approval">En Aprobación</option>
              <option value="approved">Aprobado</option>
              <option value="rejected">Rechazado</option>
              <option value="signed">Firmado</option>
              <option value="completed">Completado</option>
              <option value="active">Activo</option>
              <option value="expiring_soon">Próximo a Vencer</option>
              <option value="expired">Vencido</option>
              <option value="cancelled">Cancelado</option>
              <option value="renewed">Renovado</option>
            </select>
          </div>
          
          {/* Archive Toggle */}
          <div className="flex items-center space-x-2">
            <label className="text-sm text-gray-600">Archivados:</label>
            <button
              onClick={() => setShowArchived(!showArchived)}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors duration-200 ${
                showArchived 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {showArchived ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
          <div className="text-sm text-gray-500">
            {filteredContracts.length} contrato{filteredContracts.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Contracts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredContracts.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm || filterStatus !== 'all' ? 'No se encontraron contratos' : 'No hay contratos'}
            </h3>
            <p className="text-gray-500 mb-6">
              {searchTerm || filterStatus !== 'all' 
                ? 'Intenta cambiar los filtros de búsqueda'
                : 'Crea tu primer contrato para comenzar'
              }
            </p>
            {!searchTerm && filterStatus === 'all' && (
              <button
                onClick={handleCreateContract}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200"
              >
                <PlusCircle className="w-4 h-4 mr-2" />
                Crear Contrato
              </button>
            )}
          </div>
        ) : (
          filteredContracts.map((contract) => {
            const StatusIcon = getStatusIcon(contract.approval_status);
            const progress = signatureProgress[contract.id];
            const actualStatusDisplay = getActualStatusDisplay(contract.actual_status);
            
            return (
              <motion.div
                key={contract.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className={`bg-white rounded-xl border p-6 hover:shadow-md transition-shadow duration-200 ${
                  contract.archived 
                    ? 'border-gray-300 opacity-75' 
                    : 'border-gray-200'
                }`}
              >
                {/* Archive indicator */}
                {contract.archived && (
                  <div className="mb-3 flex items-center space-x-2 text-sm text-gray-500">
                    <Archive className="w-4 h-4" />
                    <span>Archivado el {new Date(contract.archived_at!).toLocaleDateString('es-ES')}</span>
                  </div>
                )}
                
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded-lg bg-blue-100">
                      <StatusIcon className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate" title={contract.title}>
                        {contract.title}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {contract.template?.title || 'Sin plantilla'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => handleViewContract(contract)}
                      className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    {(contract.approval_status === 'draft' || contract.approval_status === 'rejected') && (
                      <button
                        onClick={() => handleEditContract(contract)}
                        className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                    )}
                    <div className="relative group">
                      <button className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                      <div className="absolute right-0 top-8 bg-white border border-gray-200 rounded-lg shadow-lg py-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10 whitespace-nowrap">
                        {contract.approval_status === 'draft' && (
                          <button
                            onClick={() => handleSendForApproval(contract)}
                            className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
                          >
                            <Send className="w-4 h-4" />
                            <span>Enviar a Aprobación</span>
                          </button>
                        )}
                        <button
                          onClick={() => handleArchiveContract(contract)}
                          disabled={archivingContract === contract.id}
                          className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
                        >
                          {contract.archived ? (
                            <>
                              <ArchiveRestore className="w-4 h-4" />
                              <span>Desarchivar</span>
                            </>
                          ) : (
                            <>
                              <Archive className="w-4 h-4" />
                              <span>Archivar</span>
                            </>
                          )}
                        </button>
                        {contract.approval_status === 'cancelled' && (
                          <button
                            onClick={() => handleUncancelContract(contract)}
                            className="w-full text-left px-3 py-2 text-sm text-green-600 hover:bg-green-50 flex items-center space-x-2"
                          >
                            <CheckCircle className="w-4 h-4" />
                            <span>Descancelar</span>
                          </button>
                        )}
                        {(contract.approval_status === 'draft' || contract.approval_status === 'rejected') && (
                          <button
                            onClick={() => handleDeleteContract(contract)}
                            className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2"
                          >
                            <Trash2 className="w-4 h-4" />
                            <span>Eliminar</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Status */}
                <div className="mb-4">
                  {/* Cancellation notice - most prominent */}
                  {contract.approval_status === 'cancelled' && (
                    <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <div className="flex items-center space-x-2 mb-2">
                        <AlertTriangle className="w-4 h-4 text-red-600" />
                        <span className="font-bold text-red-900">CONTRATO CANCELADO</span>
                      </div>
                      {contract.rejection_reason && (
                        <p className="text-sm text-red-800">
                          <strong>Razón:</strong> {contract.rejection_reason}
                        </p>
                      )}
                    </div>
                  )}
                  
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(contract.approval_status)}`}>
                      {contract.approval_status.replace('_', ' ')}
                    </span>
                    
                    {/* Additional status tags */}
                    {actualStatusDisplay && (
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${actualStatusDisplay.color}`}>
                        {actualStatusDisplay.text}
                      </span>
                    )}
                    
                    {contract.archived && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-gray-600 bg-gray-200">
                        ARCHIVADO
                      </span>
                    )}
                  </div>
                </div>

                {/* Contract Info */}
                <div className="space-y-3 mb-4">
                  {/* Contract Status Info */}
                  {contract.actual_status && ['expiring_soon', 'expired', 'completed', 'renewed'].includes(contract.actual_status) && (
                    <div className={`flex items-center space-x-2 text-sm p-2 rounded-lg ${
                      contract.actual_status === 'expired' ? 'bg-red-50 border border-red-200' :
                      contract.actual_status === 'expiring_soon' ? 'bg-yellow-50 border border-yellow-200' :
                      contract.actual_status === 'completed' ? 'bg-purple-50 border border-purple-200' :
                      'bg-blue-50 border border-blue-200'
                    }`}>
                      {(() => {
                        const ActualStatusIcon = getActualStatusIcon(contract.actual_status);
                        return ActualStatusIcon ? <ActualStatusIcon className="w-4 h-4" /> : null;
                      })()}
                      <span className="font-medium">
                        {contract.actual_status === 'expiring_soon' ? 'Próximo a vencer' :
                         contract.actual_status === 'expired' ? 'Contrato vencido' :
                         contract.actual_status === 'completed' ? 'Contrato finalizado' :
                         contract.actual_status === 'renewed' ? 'Contrato renovado' :
                         contract.actual_status === 'cancelled' ? 'Contrato cancelado' :
                         contract.actual_status}
                      </span>
                    </div>
                  )}
                  
                  {contract.client_name && (
                    <div className="flex items-center space-x-2 text-sm text-gray-600">
                      <Users className="w-4 h-4" />
                      <span className="truncate">{contract.client_name}</span>
                    </div>
                  )}
                  {contract.contract_value && (
                    <div className="flex items-center space-x-2 text-sm text-gray-600">
                      <DollarSign className="w-4 h-4" />
                      <span>{formatCurrency(contract.contract_value)}</span>
                    </div>
                  )}
                  <div className="flex items-center space-x-2 text-sm text-gray-600">
                    <Calendar className="w-4 h-4" />
                    <span>Creado: {formatDate(contract.created_at)}</span>
                  </div>
                  {(contract.start_date || contract.end_date) && (
                    <div className="flex items-center space-x-2 text-sm text-gray-600">
                      <Calendar className="w-4 h-4" />
                      <span>
                        {contract.start_date && contract.end_date 
                          ? `${formatDate(contract.start_date)} - ${formatDate(contract.end_date)}`
                          : contract.start_date 
                          ? `Inicio: ${formatDate(contract.start_date)}`
                          : `Fin: ${formatDate(contract.end_date)}`
                        }
                      </span>
                    </div>
                  )}
                  {contract.parent_contract_id && (
                    <div className="flex items-center space-x-2 text-sm text-blue-600">
                      <RefreshCw className="w-4 h-4" />
                      <span>Renovación {contract.renewal_type === 'auto_renewal' ? 'automática' : 'manual'}</span>
                    </div>
                  )}
                </div>

                {/* Signature Progress */}
                <div className="space-y-2 mb-4">
                  {getSignatureProgressDisplay(contract.id)}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center space-x-2 mt-4 pt-4 border-t border-gray-100">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleViewContract(contract)}
                    className="flex-1 text-sm bg-gray-100 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-200 transition-colors duration-200 font-medium text-center"
                  >
                    Ver Detalles
                  </motion.button>
                  {(contract.approval_status === 'draft' || contract.approval_status === 'rejected') && (
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleEditContract(contract)}
                      className="flex-1 text-sm bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 transition-colors duration-200 font-medium text-center"
                    >
                      Editar
                    </motion.button>
                  )}
                  {!contract.archived && (
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleArchiveContract(contract)}
                      disabled={archivingContract === contract.id}
                      className="px-2 py-2 text-sm bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors duration-200"
                      title="Archivar contrato"
                    >
                      {archivingContract === contract.id ? (
                        <LoadingSpinner size="small" />
                      ) : (
                        <Archive className="w-4 h-4" />
                      )}
                    </motion.button>
                  )}
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Modals */}
      {showContractModal && (
        <ContractModal
          isOpen={showContractModal}
          onClose={() => {
            setShowContractModal(false);
            setEditingContract(null);
          }}
          contract={editingContract}
          isEditMode={!!editingContract}
          onSuccess={() => {
            setShowContractModal(false);
            setEditingContract(null);
            loadContracts();
          }}
        />
      )}

      {selectedContract && (
        <ContractViewModal
          isOpen={showViewModal}
          onClose={() => {
            setShowViewModal(false);
            setSelectedContract(null);
          }}
          contract={selectedContract}
        />
      )}
    </div>
  );
};