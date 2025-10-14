import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  FileText,
  Trash2,
  Eye,
  AlertTriangle,
  X,
  Calendar,
  DollarSign,
  Users,
  Search,
  Filter,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Archive,
  Edit
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { LoadingSpinner } from '../../common/LoadingSpinner';
import { ContractViewModal } from '../../contracts/ContractViewModal';
import { ContractStatusEditor } from './ContractStatusEditor';
import type { Contract } from '../../../types/contracts';

export const ContractManagementAdmin: React.FC = () => {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [deleteConfirmContract, setDeleteConfirmContract] = useState<Contract | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [showStatusEditor, setShowStatusEditor] = useState(false);

  useEffect(() => {
    loadAllContracts();
  }, [showArchived]);

  const loadAllContracts = async () => {
    setLoading(true);
    setError('');
    
    try {
      console.log('Loading all contracts for admin management...');

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
          creator:user_profiles!created_by(name, email, role)
        `)
        .order('created_at', { ascending: false });

      // Filter archived contracts unless specifically showing archived
      if (!showArchived) {
        query = query.eq('archived', false);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error loading contracts:', error);
        throw error;
      }

      console.log('Loaded contracts for admin management:', data?.length);
      setContracts(data || []);
    } catch (error: any) {
      console.error('Error loading contracts:', error);
      setError(error.message || 'Error al cargar los contratos');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteContract = async (contract: Contract) => {
    setDeleting(true);
    setError('');
    setSuccessMessage('');

    try {
      console.log('Deleting contract permanently:', contract.id);

      // Delete in proper order to handle foreign key constraints
      
      // 1. Delete contract audit logs
      await supabase
        .from('contract_audit_logs')
        .delete()
        .eq('contract_id', contract.id);

      // 2. Delete contract versions
      await supabase
        .from('contract_versions')
        .delete()
        .eq('contract_id', contract.id);

      // 3. Delete contract approvals
      await supabase
        .from('contract_approvals')
        .delete()
        .eq('contract_id', contract.id);

      // 4. Delete contract signatories
      await supabase
        .from('contract_signatories')
        .delete()
        .eq('contract_id', contract.id);

      // 5. Delete contract renewals (as original)
      await supabase
        .from('contract_renewals')
        .delete()
        .eq('original_contract_id', contract.id);

      // 6. Delete contract renewals (as new contract)
      await supabase
        .from('contract_renewals')
        .delete()
        .eq('new_contract_id', contract.id);

      // 7. Delete contract cancellations
      await supabase
        .from('contract_cancellations')
        .delete()
        .eq('contract_id', contract.id);

      // 8. Delete notifications related to this contract
      await supabase
        .from('notifications')
        .delete()
        .contains('data', { contract_id: contract.id });

      // 9. Finally delete the contract itself
      const { error: contractError } = await supabase
        .from('contracts')
        .delete()
        .eq('id', contract.id);

      if (contractError) throw contractError;

      // Update local state
      setContracts(prev => prev.filter(c => c.id !== contract.id));
      setDeleteConfirmContract(null);
      setSuccessMessage(`Contrato "${contract.title}" eliminado permanentemente con todos sus datos relacionados`);
      
      // Clear success message after 5 seconds
      setTimeout(() => setSuccessMessage(''), 5000);

      console.log('Contract deleted permanently with all related data');
    } catch (error: any) {
      console.error('Error deleting contract:', error);
      setError(error.message || 'Error al eliminar el contrato');
    } finally {
      setDeleting(false);
    }
  };

  const handleEditStatus = (contract: Contract) => {
    setEditingContract(contract);
    setShowStatusEditor(true);
  };

  const handleViewContract = (contract: Contract) => {
    setSelectedContract(contract);
    setShowViewModal(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'text-gray-600 bg-gray-100';
      case 'pending_approval': return 'text-orange-600 bg-orange-100';
      case 'approved': return 'text-green-600 bg-green-100';
      case 'rejected': return 'text-red-600 bg-red-100';
      case 'signed': return 'text-blue-600 bg-blue-100';
      case 'completed': return 'text-purple-600 bg-purple-100';
      case 'cancelled': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
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

  const filteredContracts = contracts.filter(contract => {
    const matchesSearch = contract.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         contract.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         contract.creator?.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || contract.approval_status === statusFilter;
    return matchesSearch && matchesStatus;
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Gestión de Contratos</h2>
          <p className="text-gray-600 mt-1">
            Vista completa de todos los contratos - Eliminación permanente disponible
          </p>
        </div>
        <button
          onClick={loadAllContracts}
          disabled={loading}
          className="flex items-center space-x-2 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors duration-200"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Actualizar</span>
        </button>
      </div>

      {/* Messages */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3"
        >
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-red-800">Error</h4>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
          <button
            onClick={() => setError('')}
            className="text-red-500 hover:text-red-700"
          >
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}

      {successMessage && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start space-x-3"
        >
          <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-green-800">Éxito</h4>
            <p className="text-sm text-green-700 mt-1">{successMessage}</p>
          </div>
          <button
            onClick={() => setSuccessMessage('')}
            className="text-green-500 hover:text-green-700"
          >
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0 sm:space-x-4">
          <div className="flex items-center space-x-4 flex-1">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Buscar por título, cliente o gestor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              />
            </div>
            
            <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-red-500 focus:border-red-500"
              >
                <option value="all">Todos los estados</option>
                <option value="draft">Borrador</option>
                <option value="pending_approval">En Aprobación</option>
                <option value="approved">Aprobado</option>
                <option value="rejected">Rechazado</option>
                <option value="signed">Firmado</option>
                <option value="completed">Completado</option>
                <option value="cancelled">Cancelado</option>
              </select>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
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
      </div>

      {/* Warning Notice */}
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-red-800">Área de Gestión Avanzada</h4>
            <p className="text-sm text-red-700 mt-1">
              Esta sección permite la eliminación PERMANENTE de contratos. Los contratos eliminados 
              se borrarán completamente de la base de datos junto con todos sus datos relacionados 
              (firmas, versiones, auditorías, etc.). Esta acción NO se puede deshacer.
            </p>
          </div>
        </div>
      </div>

      {/* Contracts List */}
      {loading ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 flex items-center justify-center">
          <div className="text-center">
            <LoadingSpinner size="large" />
            <p className="text-gray-600 mt-4">Cargando contratos...</p>
          </div>
        </div>
      ) : filteredContracts.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 text-lg font-medium">No se encontraron contratos</p>
          <p className="text-gray-400 text-sm">
            {searchTerm || statusFilter !== 'all' ? 'Intenta cambiar los filtros de búsqueda' : 'No hay contratos en el sistema'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contrato
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cliente
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Gestor
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Valor
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fecha
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredContracts.map((contract) => {
                  const actualStatusDisplay = getActualStatusDisplay(contract.actual_status);
                  
                  return (
                    <motion.tr
                      key={contract.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className={`hover:bg-gray-50 transition-colors duration-200 ${
                        contract.archived ? 'opacity-60' : ''
                      }`}
                    >
                      <td className="px-6 py-4">
                        <div>
                          <div className="text-sm font-medium text-gray-900 mb-1">{contract.title}</div>
                          
                          {/* Main Status Tags */}
                          <div className="flex flex-wrap gap-1">
                            {/* Cancellation Tag - Most Prominent */}
                            {contract.approval_status === 'cancelled' && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold text-red-700 bg-red-100 border border-red-300">
                                CANCELADO
                              </span>
                            )}
                            
                            {/* Contract approval status */}
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(contract.approval_status)}`}>
                              {contract.approval_status.replace('_', ' ')}
                            </span>
                            
                            {/* Actual status tags */}
                            {actualStatusDisplay && (
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${actualStatusDisplay.color}`}>
                                {actualStatusDisplay.text}
                              </span>
                            )}
                            
                            {/* Archive tag */}
                            {contract.archived && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-gray-600 bg-gray-200">
                                ARCHIVADO
                              </span>
                            )}
                          </div>
                          
                          {/* Cancellation reason - Prominent display */}
                          {contract.approval_status === 'cancelled' && contract.rejection_reason && (
                            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs">
                              <span className="font-medium text-red-800">Razón:</span>{' '}
                              <span className="text-red-700">{contract.rejection_reason}</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm text-gray-900">{contract.client_name || 'N/A'}</div>
                          <div className="text-sm text-gray-500">{contract.client_email || ''}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm text-gray-900">{contract.creator?.name || 'Desconocido'}</div>
                          <div className="text-sm text-gray-500">{contract.creator?.email || ''}</div>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            contract.creator?.role === 'admin' ? 'text-purple-600 bg-purple-100' :
                            contract.creator?.role === 'supervisor' ? 'text-green-600 bg-green-100' :
                            contract.creator?.role === 'gestor' ? 'text-blue-600 bg-blue-100' :
                            'text-gray-600 bg-gray-100'
                          }`}>
                            {contract.creator?.role || 'N/A'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="space-y-1">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(contract.approval_status)}`}>
                            {contract.approval_status.replace('_', ' ')}
                          </span>
                          {actualStatusDisplay && (
                            <div>
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${actualStatusDisplay.color}`}>
                                {actualStatusDisplay.text}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(contract.contract_value)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{formatDate(contract.created_at)}</div>
                        {contract.end_date && (
                          <div className="text-sm text-gray-500">Vence: {formatDate(contract.end_date)}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => handleViewContract(contract)}
                            className="text-blue-600 hover:text-blue-700 p-1 rounded transition-colors duration-200"
                            title="Ver contrato"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleEditStatus(contract)}
                            className="text-blue-600 hover:text-blue-700 p-1 rounded transition-colors duration-200"
                            title="Editar estados"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirmContract(contract)}
                            className="text-red-600 hover:text-red-700 p-1 rounded transition-colors duration-200"
                            title="Eliminar permanentemente"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Contract View Modal */}
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

      {/* Status Editor Modal */}
      {showStatusEditor && editingContract && (
        <ContractStatusEditor
          isOpen={showStatusEditor}
          onClose={() => {
            setShowStatusEditor(false);
            setEditingContract(null);
          }}
          contract={editingContract}
          onSuccess={() => {
            setShowStatusEditor(false);
            setEditingContract(null);
            loadAllContracts();
            setSuccessMessage('Estados del contrato actualizados exitosamente');
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmContract && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-xl p-6 w-full max-w-2xl"
          >
            <div className="flex items-center space-x-3 mb-6">
              <div className="flex items-center justify-center w-12 h-12 bg-red-100 rounded-full">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Eliminar Contrato Permanentemente</h3>
                <p className="text-gray-600 text-sm">Esta acción NO se puede deshacer</p>
              </div>
            </div>
            
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <h4 className="font-semibold text-red-800 mb-2">¿Estás completamente seguro?</h4>
              <p className="text-sm text-red-700 mb-3">
                Vas a eliminar <strong>PERMANENTEMENTE</strong> el contrato:
              </p>
              <div className="bg-red-100 border border-red-300 rounded p-3 mb-3">
                <p className="font-medium text-red-900">"{deleteConfirmContract.title}"</p>
                <p className="text-sm text-red-800">Cliente: {deleteConfirmContract.client_name}</p>
                <p className="text-sm text-red-800">Valor: {formatCurrency(deleteConfirmContract.contract_value)}</p>
              </div>
              <div className="text-sm text-red-700 space-y-1">
                <p><strong>Se eliminarán TODOS los datos relacionados:</strong></p>
                <ul className="list-disc list-inside ml-2 space-y-1">
                  <li>Todas las firmas y firmantes</li>
                  <li>Todas las versiones del contrato</li>
                  <li>Historial de aprobaciones</li>
                  <li>Registros de auditoría</li>
                  <li>Solicitudes de renovación</li>
                  <li>Notificaciones relacionadas</li>
                  <li>Registros de cancelación</li>
                </ul>
              </div>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-6">
              <p className="text-sm text-yellow-800">
                <strong>Recomendación:</strong> Considera archivar el contrato en lugar de eliminarlo 
                para mantener el historial y cumplir con requisitos de auditoría.
              </p>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => setDeleteConfirmContract(null)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors duration-200"
                disabled={deleting}
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDeleteContract(deleteConfirmContract)}
                disabled={deleting}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors duration-200 disabled:bg-red-400"
              >
                {deleting ? (
                  <div className="flex items-center justify-center space-x-2">
                    <LoadingSpinner size="small" />
                    <span>Eliminando...</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center space-x-2">
                    <Trash2 className="w-4 h-4" />
                    <span>ELIMINAR PERMANENTEMENTE</span>
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