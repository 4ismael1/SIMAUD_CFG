import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { 
  RefreshCw, 
  Calendar, 
  User, 
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Eye,
  Edit,
  DollarSign,
  Send,
  Filter,
  Search
} from 'lucide-react';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { RenewalRequestModal } from './RenewalRequestModal';
import { RenewalProcessModal } from './RenewalProcessModal';
import { ContractViewModal } from '../contracts/ContractViewModal';
import type { Contract } from '../../types/contracts';

interface Renewal {
  id: string;
  original_contract_id: string;
  requested_by: string;
  requested_at: string;
  status: 'pending' | 'in_progress' | 'approved' | 'rejected' | 'cancelled';
  proposed_changes: any;
  proposed_start_date: string;
  proposed_end_date: string;
  proposed_value: number;
  gestor_response: string;
  processed_by: string;
  processed_at: string;
  new_contract_id: string;
  escalated_at: string;
  escalated_to: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  auto_renewal: boolean;
  original_contract?: any;
  requester?: any;
  processor?: any;
  new_contract?: any;
}

export const RenewalCenter: React.FC = () => {
  const [renewals, setRenewals] = useState<Renewal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [metrics, setMetrics] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRenewal, setSelectedRenewal] = useState<Renewal | null>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [contractToView, setContractToView] = useState<Contract | null>(null);
  const [showContractModal, setShowContractModal] = useState(false);

  useEffect(() => {
    loadRenewals();
  }, [statusFilter]);

  const loadRenewals = async () => {
    setLoading(true);
    setError('');

    try {
      // Get authenticated session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        throw new Error('Error de sesión: ' + sessionError.message);
      }
      
      if (!session) {
        throw new Error('No hay sesión activa');
      }

      const params = new URLSearchParams({ action: 'list' });
      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/renewal-manager?${params}`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Error al cargar renovaciones');
      }

      const data = await response.json();
      setRenewals(data.renewals || []);
      setMetrics(data.metrics || {});

    } catch (error: any) {
      console.error('Error loading renewals:', error);
      setError(error.message || 'Error al cargar las renovaciones');
      setRenewals([]);
      setMetrics(null);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestRenewal = () => {
    setSelectedRenewal(null);
    setShowRequestModal(true);
  };

  const handleProcessRenewal = (renewal: Renewal) => {
    setSelectedRenewal(renewal);
    setShowProcessModal(true);
  };

  const handleViewContract = async (contractId: string) => {
    try {
      const { data: contract, error } = await supabase
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
          actual_status
        `)
        .eq('id', contractId)
        .single();

      if (error) throw error;
      
      setContractToView(contract);
      setShowContractModal(true);
    } catch (error) {
      console.error('Error loading contract:', error);
      setError('Error al cargar el contrato');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-orange-600 bg-orange-100';
      case 'in_progress': return 'text-blue-600 bg-blue-100';
      case 'approved': return 'text-green-600 bg-green-100';
      case 'rejected': return 'text-red-600 bg-red-100';
      case 'cancelled': return 'text-gray-600 bg-gray-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return Clock;
      case 'in_progress': return RefreshCw;
      case 'approved': return CheckCircle;
      case 'rejected': return XCircle;
      case 'cancelled': return XCircle;
      default: return Clock;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'text-red-600 bg-red-100';
      case 'high': return 'text-orange-600 bg-orange-100';
      case 'medium': return 'text-blue-600 bg-blue-100';
      case 'low': return 'text-gray-600 bg-gray-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
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

  const filteredRenewals = renewals.filter(renewal => {
    const matchesSearch = renewal.original_contract?.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         renewal.original_contract?.client_name?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Centro de Renovaciones</h2>
          <p className="text-gray-600 mt-1">
            Gestiona solicitudes de renovación de contratos ({renewals.length} solicitudes)
          </p>
        </div>
        <button
          onClick={handleRequestRenewal}
          className="flex items-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors duration-200 font-medium"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Solicitar Renovación</span>
        </button>
      </div>

      {/* Metrics */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 bg-blue-100 rounded-lg">
                <RefreshCw className="w-5 h-5 text-blue-600" />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-gray-900">{metrics.total_renewals}</h3>
            <p className="text-gray-600 text-sm">Total Renovaciones</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Clock className="w-5 h-5 text-orange-600" />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-gray-900">{metrics.pending_renewals}</h3>
            <p className="text-gray-600 text-sm">Pendientes</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-gray-900">{metrics.approved_renewals}</h3>
            <p className="text-gray-600 text-sm">Aprobadas</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 bg-purple-100 rounded-lg">
                <RefreshCw className="w-5 h-5 text-purple-600" />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-gray-900">{metrics.auto_renewals}</h3>
            <p className="text-gray-600 text-sm">Auto-renovaciones</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0 sm:space-x-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Buscar por título de contrato o cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
            />
          </div>

          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-green-500 focus:border-green-500"
            >
              <option value="all">Todos los estados</option>
              <option value="pending">Pendientes</option>
              <option value="in_progress">En Proceso</option>
              <option value="approved">Aprobadas</option>
              <option value="rejected">Rechazadas</option>
            </select>
          </div>
        </div>
      </div>

      {/* Renewals List */}
      {loading ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 flex items-center justify-center">
          <div className="text-center">
            <LoadingSpinner size="large" />
            <p className="text-gray-600 mt-4">Cargando renovaciones...</p>
          </div>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <div>
              <h3 className="text-sm font-semibold text-red-800">Error al cargar renovaciones</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      ) : filteredRenewals.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <RefreshCw className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 text-lg font-medium">No hay solicitudes de renovación</p>
          <p className="text-gray-400 text-sm">
            Las solicitudes aparecerán aquí cuando los contratos estén próximos a vencer
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredRenewals.map((renewal) => {
            const StatusIcon = getStatusIcon(renewal.status);
            
            return (
              <motion.div
                key={renewal.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all duration-200 overflow-hidden"
              >
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
                        renewal.auto_renewal ? 'bg-purple-100' : 'bg-green-100'
                      }`}>
                        <StatusIcon className={`w-5 h-5 ${
                          renewal.auto_renewal ? 'text-purple-600' : 'text-green-600'
                        }`} />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          {renewal.original_contract?.title || 'Contrato sin título'}
                        </h3>
                        <p className="text-sm text-gray-600 flex items-center space-x-2">
                          <span>Solicitado por {renewal.requester?.name || 'Usuario desconocido'}</span>
                          {renewal.auto_renewal && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-purple-600 bg-purple-100">
                              Auto-renovación
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(renewal.priority)}`}>
                        {renewal.priority.toUpperCase()}
                      </span>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(renewal.status)}`}>
                        {renewal.status.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="flex items-center space-x-2 mb-1">
                        <User className="w-4 h-4 text-gray-600" />
                        <span className="text-sm font-medium text-gray-900">Cliente</span>
                      </div>
                      <p className="text-sm text-gray-600">{renewal.original_contract?.client_name || 'No especificado'}</p>
                      <p className="text-xs text-gray-500">{renewal.original_contract?.client_email || ''}</p>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="flex items-center space-x-2 mb-1">
                        <DollarSign className="w-4 h-4 text-gray-600" />
                        <span className="text-sm font-medium text-gray-900">Valor</span>
                      </div>
                      <p className="text-sm text-gray-600">
                        {formatCurrency(renewal.proposed_value)}
                      </p>
                      {renewal.original_contract?.contract_value !== renewal.proposed_value && (
                        <p className="text-xs text-gray-500">
                          Original: {formatCurrency(renewal.original_contract?.contract_value)}
                        </p>
                      )}
                    </div>

                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="flex items-center space-x-2 mb-1">
                        <Calendar className="w-4 h-4 text-gray-600" />
                        <span className="text-sm font-medium text-gray-900">Nueva Vigencia</span>
                      </div>
                      <p className="text-sm text-gray-600">
                        {new Date(renewal.proposed_start_date).toLocaleDateString('es-ES')} - {new Date(renewal.proposed_end_date).toLocaleDateString('es-ES')}
                      </p>
                    </div>
                  </div>

                  {renewal.escalated_at && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                      <div className="flex items-center space-x-2">
                        <AlertTriangle className="w-4 h-4 text-red-600" />
                        <span className="text-sm font-medium text-red-800">
                          Solicitud escalada el {formatDate(renewal.escalated_at)}
                        </span>
                      </div>
                      <p className="text-sm text-red-700 mt-1">{renewal.escalation_reason}</p>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                    <div className="text-sm text-gray-500">
                      Solicitado: {formatDate(renewal.requested_at)}
                    </div>
                    
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleViewContract(renewal.original_contract_id)}
                        className="flex items-center space-x-2 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors duration-200"
                      >
                        <Eye className="w-4 h-4" />
                        <span>Ver Original</span>
                      </button>
                      
                      {renewal.status === 'pending' && (
                        <button
                          onClick={() => handleProcessRenewal(renewal)}
                          className="flex items-center space-x-2 px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors duration-200"
                        >
                          <Edit className="w-4 h-4" />
                          <span>Procesar</span>
                        </button>
                      )}

                      {renewal.new_contract_id && (
                        <button
                          onClick={() => handleViewContract(renewal.new_contract_id)}
                          className="flex items-center space-x-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200"
                        >
                          <FileText className="w-4 h-4" />
                          <span>Ver Renovado</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {showRequestModal && (
        <RenewalRequestModal
          isOpen={showRequestModal}
          onClose={() => setShowRequestModal(false)}
          onSuccess={loadRenewals}
        />
      )}

      {showProcessModal && selectedRenewal && (
        <RenewalProcessModal
          isOpen={showProcessModal}
          onClose={() => setShowProcessModal(false)}
          renewal={selectedRenewal}
          onSuccess={loadRenewals}
        />
      )}

      {showContractModal && contractToView && (
        <ContractViewModal
          isOpen={showContractModal}
          onClose={() => setShowContractModal(false)}
          contract={contractToView}
        />
      )}
    </div>
  );
};