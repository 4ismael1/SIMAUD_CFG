import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  X, 
  FileText, 
  Calendar, 
  DollarSign, 
  User, 
  Mail, 
  Phone,
  Clock,
  CheckCircle,
  XCircle,
  History,
  Users,
  Eye,
  MessageCircle,
  RefreshCw,
  AlertTriangle,
  PenTool,
  Download
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { RenewalRequestButton } from '../renewals/RenewalRequestButton';
import { ContractCancellationModal } from './ContractCancellationModal';
import { SignatureCanvas } from './SignatureCanvas';
import { useAuth } from '../../contexts/AuthContext';
import type { 
  Contract, 
  ContractSignatory, 
  ContractVersion, 
  ContractAuditLog 
} from '../../types/contracts';

interface ContractViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  contract: Contract;
}

export const ContractViewModal: React.FC<ContractViewModalProps> = ({
  isOpen,
  onClose,
  contract
}) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'details' | 'signatories' | 'versions' | 'audit'>('details');
  const [loading, setLoading] = useState(false);
  const [signatories, setSignatories] = useState<ContractSignatory[]>([]);
  const [versions, setVersions] = useState<ContractVersion[]>([]);
  const [auditLogs, setAuditLogs] = useState<ContractAuditLog[]>([]);
  const [previewContent, setPreviewContent] = useState('');
  const [showCancellationModal, setShowCancellationModal] = useState(false);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [currentSignatory, setCurrentSignatory] = useState<ContractSignatory | null>(null);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [renewalStatus, setRenewalStatus] = useState({
    hasRenewal: false,
    status: null as string | null,
    rejectionReason: null as string | null,
    renewalDate: null as string | null
  });

  useEffect(() => {
    if (isOpen) {
      loadContractData();
    }
  }, [isOpen, contract.id]);

  const loadRenewalStatus = async () => {
    try {
      const { data, error } = await supabase
        .from('contract_renewals')
        .select('status, gestor_response, requested_at')
        .eq('original_contract_id', contract.id)
        .order('requested_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setRenewalStatus({
          hasRenewal: true,
          status: data.status,
          rejectionReason: data.gestor_response,
          renewalDate: data.requested_at
        });
      } else {
        setRenewalStatus({
          hasRenewal: false,
          status: null,
          rejectionReason: null,
          renewalDate: null
        });
      }
    } catch (error) {
      console.error('Error loading renewal status:', error);
      setRenewalStatus({
        hasRenewal: false,
        status: null,
        rejectionReason: null,
        renewalDate: null
      });
    }
  };

  const handleDigitalSign = (signatory: ContractSignatory) => {
    setCurrentSignatory(signatory);
    setShowSignatureModal(true);
  };

  const handleSaveSignature = async (signatureDataUrl: string) => {
    if (!currentSignatory) return;

    try {
      // Update signatory with signature
      const { error } = await supabase
        .from('contract_signatories')
        .update({
          signed_at: new Date().toISOString(),
          signature_url: signatureDataUrl,
          status: 'signed',
          ip_address: '127.0.0.1',
          user_agent: navigator.userAgent
        })
        .eq('id', currentSignatory.id);

      if (error) throw error;
      setShowSignatureModal(false);
      setCurrentSignatory(null);
      await loadContractData(); // Refresh data
    } catch (error) {
      console.error('Error saving signature:', error);
      throw error;
    }
  };

  const generateContractPDF = async () => {
    setPdfGenerating(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No authenticated session');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/contract-pdf`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contract_id: contract.id,
            action: 'generate'
          })
        }
      );

      if (!response.ok) {
        throw new Error('Error generating PDF');
      }

      const result = await response.json();
      
      if (result.success && result.html) {
        // Open PDF in new window
        const newWindow = window.open('', '_blank');
        if (newWindow) {
          newWindow.document.write(result.html);
          newWindow.document.close();
        }
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      setPdfGenerating(false);
    }
  };

  const loadContractData = async () => {
    setLoading(true);
    try {
      // Load renewal status first
      await loadRenewalStatus();

      // Cargar firmantes
      console.log('Loading signatories for contract:', contract.id);
      
      const { data: signatoriesData, error: signatoriesError } = await supabase
        .from('contract_signatories')
        .select('*')
        .eq('contract_id', contract.id)
        .order('signing_order');

      if (signatoriesError) {
        console.error('Error loading signatories:', signatoriesError);
        throw signatoriesError;
      }
      
      console.log('Loaded signatories data:', signatoriesData);
      setSignatories(signatoriesData || []);

      // Cargar versiones
      const { data: versionsData, error: versionsError } = await supabase
        .from('contract_versions')
        .select(`
          *,
          creator:user_profiles!created_by(name, email)
        `)
        .eq('contract_id', contract.id)
        .order('version_number', { ascending: false });

      if (versionsError) throw versionsError;
      setVersions(versionsData || []);

      // Cargar logs de auditoria
      const { data: auditData, error: auditError } = await supabase
        .from('contract_audit_logs')
        .select('*')
        .eq('contract_id', contract.id)
        .order('timestamp', { ascending: false })
        .limit(50);

      if (auditError) throw auditError;
      setAuditLogs(auditData || []);

      // Generar contenido procesado
      if (contract.generated_content) {
        setPreviewContent(contract.generated_content);
      }
    } catch (error) {
      console.error('Error loading contract data:', error);
    } finally {
      setLoading(false);
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
      case 'active': return 'text-green-600 bg-green-100';
      case 'expiring_soon': return 'text-yellow-600 bg-yellow-100';
      case 'expired': return 'text-red-600 bg-red-100';
      case 'cancelled': return 'text-gray-600 bg-gray-100';
      case 'renewed': return 'text-blue-600 bg-blue-100';
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
      case 'active': return CheckCircle;
      case 'expiring_soon': return Clock;
      case 'expired': return XCircle;
      case 'cancelled': return XCircle;
      case 'renewed': return RefreshCw;
      default: return FileText;
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

  const tabs = [
    { id: 'details', label: 'Detalles', icon: FileText },
    { id: 'signatories', label: 'Firmantes', icon: Users },
    { id: 'versions', label: 'Versiones', icon: History },
    { id: 'audit', label: 'Auditoria', icon: MessageCircle }
  ];

  if (!isOpen) return null;

  const StatusIcon = getStatusIcon(contract.approval_status);

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-xl shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-blue-100">
              <StatusIcon className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{contract.title}</h3>
              <div className="flex items-center space-x-2 mt-1">
                <div className="flex flex-wrap gap-2">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(contract.approval_status)}`}>
                    {contract.approval_status.replace('_', ' ')}
                  </span>
                  
                  {/* Actual Status */}
                  {contract.actual_status && contract.actual_status !== 'draft' && (
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(contract.actual_status)}`}>
                      {contract.actual_status === 'expiring_soon' ? 'Próximo a vencer' :
                       contract.actual_status === 'expired' ? 'Vencido' :
                       contract.actual_status === 'completed' ? 'Finalizado' :
                       contract.actual_status === 'renewed' ? 'Renovado' :
                       contract.actual_status === 'cancelled' ? 'Cancelado' :
                       contract.actual_status}
                    </span>
                  )}
                  
                  {/* Auto-renewal indicator */}
                  {contract.auto_renewal && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-purple-600 bg-purple-100">
                      <RefreshCw className="w-3 h-3 mr-1" />
                      Auto-renovación
                    </span>
                  )}
                  
                  {/* Renewal reference */}
                  {contract.parent_contract_id && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-blue-600 bg-blue-100">
                      <FileText className="w-3 h-3 mr-1" />
                      Renovación {contract.renewal_type === 'auto_renewal' ? 'Automática' : 'Manual'}
                    </span>
                  )}
                </div>
                <span className="text-sm text-gray-500">
                  Versión {contract.current_version}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-2 rounded-lg hover:bg-gray-100 transition-colors duration-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <div className="flex space-x-0">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center space-x-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors duration-200 ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[calc(90vh-200px)] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner size="large" />
            </div>
          ) : (
            <>
              {activeTab === 'details' && (
                <div className="space-y-6">
                  {/* Cancellation Notice - Most Prominent */}
                  {contract.approval_status === 'cancelled' && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <AlertTriangle className="w-5 h-5 text-red-600" />
                        <h4 className="font-bold text-red-900">CONTRATO CANCELADO</h4>
                      </div>
                      <p className="text-sm text-red-800">
                        Este contrato ha sido cancelado y ya no está activo.
                      </p>
                      {contract.rejection_reason && (
                        <div className="mt-3 p-3 bg-red-100 border border-red-300 rounded">
                          <p className="text-sm text-red-800">
                            <strong>Razón de cancelación:</strong> {contract.rejection_reason}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Contract Info */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <User className="w-4 h-4 text-gray-600" />
                        <h4 className="font-medium text-gray-900">Cliente</h4>
                      </div>
                      <p className="text-sm text-gray-600">{contract.client_name || 'N/A'}</p>
                      {contract.client_email && (
                        <p className="text-xs text-gray-500 mt-1">{contract.client_email}</p>
                      )}
                      {contract.client_phone && (
                        <p className="text-xs text-gray-500">{contract.client_phone}</p>
                      )}
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <DollarSign className="w-4 h-4 text-green-600" />
                        <h4 className="font-medium text-gray-900">Valor</h4>
                      </div>
                      <p className="text-sm text-gray-600">{formatCurrency(contract.contract_value)}</p>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <Calendar className="w-4 h-4 text-blue-600" />
                        <h4 className="font-medium text-gray-900">Fechas</h4>
                      </div>
                      <p className="text-xs text-gray-500">Inicio: {formatDate(contract.start_date)}</p>
                      <p className="text-xs text-gray-500">Fin: {formatDate(contract.end_date)}</p>
                    </div>
                  </div>

                  {/* Renewal Status Display */}
                  {renewalStatus.hasRenewal && (
                    <div className={`p-4 rounded-lg border ${
                      renewalStatus.status === 'approved' ? 'bg-green-50 border-green-200' :
                      renewalStatus.status === 'rejected' ? 'bg-red-50 border-red-200' :
                      renewalStatus.status === 'pending' ? 'bg-blue-50 border-blue-200' :
                      'bg-gray-50 border-gray-200'
                    }`}>
                      <div className="flex items-center space-x-2 mb-2">
                        <RefreshCw className={`w-5 h-5 ${
                          renewalStatus.status === 'approved' ? 'text-green-600' :
                          renewalStatus.status === 'rejected' ? 'text-red-600' :
                          renewalStatus.status === 'pending' ? 'text-blue-600' :
                          'text-gray-600'
                        }`} />
                        <h4 className={`font-medium ${
                          renewalStatus.status === 'approved' ? 'text-green-900' :
                          renewalStatus.status === 'rejected' ? 'text-red-900' :
                          renewalStatus.status === 'pending' ? 'text-blue-900' :
                          'text-gray-900'
                        }`}>
                          {renewalStatus.status === 'approved' ? '✅ Renovación Aprobada' :
                           renewalStatus.status === 'rejected' ? '❌ Renovación Rechazada' :
                           renewalStatus.status === 'pending' ? '⏳ Renovación Solicitada' :
                           'Estado de Renovación Desconocido'}
                        </h4>
                      </div>
                      <p className={`text-sm ${
                        renewalStatus.status === 'approved' ? 'text-green-700' :
                        renewalStatus.status === 'rejected' ? 'text-red-700' :
                        renewalStatus.status === 'pending' ? 'text-blue-700' :
                        'text-gray-700'
                      }`}>
                        {renewalStatus.status === 'approved' ? 'Se ha creado un nuevo contrato basado en esta renovación.' :
                         renewalStatus.status === 'rejected' ? `Renovación rechazada. ${renewalStatus.rejectionReason || 'Sin comentarios adicionales.'}` :
                         renewalStatus.status === 'pending' ? 'La solicitud de renovación está siendo revisada por el gestor.' :
                         'Estado de renovación no reconocido.'}
                      </p>
                      {renewalStatus.renewalDate && (
                        <p className="text-xs text-gray-500 mt-2">
                          Solicitado el {formatDate(renewalStatus.renewalDate)}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Renewal Actions for expired/completed contracts */}
                  {(contract.actual_status === 'expired' || contract.actual_status === 'completed') && !renewalStatus.hasRenewal && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <RefreshCw className="w-5 h-5 text-green-600" />
                          <div>
                            <h4 className="font-medium text-green-900">Contrato Finalizado</h4>
                            <p className="text-sm text-green-700">Este contrato ha llegado al final de su vigencia</p>
                          </div>
                        </div>
                        <RenewalRequestButton 
                          contract={contract}
                          preselectedContractId={contract.id}
                          onSuccess={() => {
                            // Reload contract data
                            loadContractData();
                          }}
                          size="medium"
                        />
                      </div>
                    </div>
                  )}

                  {/* Show renewal request status even for active contracts */}
                  {renewalStatus.hasRenewal && renewalStatus.status === 'pending' && contract.actual_status === 'active' && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-center space-x-2">
                        <RefreshCw className="w-5 h-5 text-blue-600" />
                        <div>
                          <h4 className="font-medium text-blue-900">Renovación en Proceso</h4>
                          <p className="text-sm text-blue-700">Ya existe una solicitud de renovación pendiente para este contrato</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Signature Progress - Solo mostrar si hay firmantes */}
                  {signatories.length > 0 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-2">
                          <Users className="w-5 h-5 text-blue-600" />
                          <h4 className="font-medium text-gray-900">Progreso de Firmas</h4>
                        </div>
                        <SignatureProgressBadge signatories={signatories} />
                      </div>
                      <div className="w-full bg-blue-200 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ 
                            width: `${signatories.length > 0 ? (signatories.filter(s => s.signed_at).length / signatories.length) * 100 : 0}%` 
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Contract Content */}
                  <div>
                    <div className="flex items-center space-x-2 mb-4">
                      <Eye className="w-4 h-4 text-gray-600" />
                      <h4 className="font-medium text-gray-900">Contenido del Contrato</h4>
                    </div>
                    <ContractContentViewer 
                      contract={contract} 
                      previewContent={previewContent}
                    />
                  </div>

                  {/* Notes */}
                  {contract.notes && (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">Notas</h4>
                      <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
                        {contract.notes}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'signatories' && (
                <div className="space-y-4">
                  {/* Signature Progress Header */}
                  {signatories.length > 0 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-gray-900">Estado de Firmas</h4>
                          <p className="text-sm text-gray-600">
                            {signatories.filter(s => s.signed_at).length} de {signatories.length} firmantes han firmado
                          </p>
                        </div>
                        <SignatureProgressBadge signatories={signatories} />
                      </div>
                      <div className="w-full bg-blue-200 rounded-full h-3 mt-3">
                        <div 
                          className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                          style={{ 
                            width: `${signatories.length > 0 ? (signatories.filter(s => s.signed_at).length / signatories.length) * 100 : 0}%` 
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {signatories.length === 0 ? (
                    <div className="text-center py-8 bg-gray-50 rounded-lg">
                      <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-500">No hay firmantes registrados</p>
                      <p className="text-sm text-gray-400 mt-1">
                        Los firmantes aparecerán aquí una vez que se agreguen al contrato
                      </p>
                    </div>
                  ) : (
                    signatories.map((signatory, index) => (
                      <motion.div 
                        key={signatory.id} 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow duration-200"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-3">
                            <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                              signatory.signed_at ? 'bg-green-100' : 'bg-blue-100'
                            }`}>
                              <span className="text-xs font-semibold text-blue-600">
                                {signatory.signing_order}
                              </span>
                            </div>
                            <div>
                              <h4 className="font-medium text-gray-900">{signatory.name}</h4>
                              <p className="text-sm text-gray-600 capitalize flex items-center space-x-1">
                                <span>{signatory.role}</span>
                                {signatory.status && (
                                  <span className="text-xs">• {signatory.status}</span>
                                )}
                              </p>
                            </div>
                          </div>
                          {signatory.signed_at ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-green-600 bg-green-100">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Firmado
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-orange-600 bg-orange-100">
                              <Clock className="w-3 h-3 mr-1" />
                              Pendiente
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                          <div className="flex items-center space-x-2 text-sm text-gray-600">
                            <Mail className="w-4 h-4" />
                            <span>{signatory.email}</span>
                          </div>
                          {signatory.phone && (
                            <div className="flex items-center space-x-2 text-sm text-gray-600">
                              <Phone className="w-4 h-4" />
                              <span>{signatory.phone}</span>
                            </div>
                          )}
                        </div>
                        
                        {/* Signature Display */}
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          {signatory.signed_at ? (
                            <div className="space-y-2">
                              <p className="text-xs text-gray-500">
                                Firmado el {formatDate(signatory.signed_at)}
                              </p>
                              {signatory.signature_url && (
                                <div className="bg-white border border-gray-200 rounded-lg p-3">
                                  <p className="text-xs text-gray-600 mb-2">Firma Digital:</p>
                                  <img 
                                    src={signatory.signature_url} 
                                    alt={`Firma de ${signatory.name}`}
                                    className="h-16 border border-gray-200 rounded bg-gray-50"
                                    style={{ maxWidth: '200px' }}
                                  />
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center justify-between">
                              <p className="text-xs text-gray-500">Pendiente de firma</p>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    ))
                  )}
                  
                  {/* PDF Generation Section */}
                  <div className="mt-6 pt-6 border-t border-gray-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-gray-900">Documento PDF</h4>
                        <p className="text-sm text-gray-600">
                          {signatories.filter(s => s.signed_at).length === signatories.length
                            ? 'Todas las firmas completadas - PDF disponible para descarga'
                            : `${signatories.filter(s => s.signed_at).length}/${signatories.length} firmas completadas`
                          }
                        </p>
                      </div>
                      <button
                        onClick={generateContractPDF}
                        disabled={pdfGenerating}
                        className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors duration-200 disabled:opacity-50"
                      >
                        {pdfGenerating ? (
                          <>
                            <LoadingSpinner size="small" />
                            <span>Generando PDF...</span>
                          </>
                        ) : (
                          <>
                            <Download className="w-4 h-4" />
                            <span>Ver/Descargar PDF</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'versions' && (
                <div className="space-y-4">
                  {versions.length === 0 ? (
                    <div className="text-center py-8">
                      <History className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-500">No hay versiones registradas</p>
                    </div>
                  ) : (
                    versions.map((version: any) => (
                      <div key={version.id} className="bg-gray-50 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-3">
                            <div className="flex items-center justify-center w-8 h-8 bg-purple-100 rounded-full">
                              <span className="text-xs font-semibold text-purple-600">
                                v{version.version_number}
                              </span>
                            </div>
                            <div>
                              <h4 className="font-medium text-gray-900">
                                Versión {version.version_number}
                              </h4>
                              <p className="text-sm text-gray-600">
                                por {version.creator?.name || 'Usuario desconocido'}
                              </p>
                            </div>
                          </div>
                          <span className="text-xs text-gray-500">
                            {formatDate(version.created_at)}
                          </span>
                        </div>
                        {version.change_summary && (
                          <p className="text-sm text-gray-600 mt-2">
                            {version.change_summary}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'audit' && (
                <div className="space-y-4">
                  {/* Approval History Section */}
                  <div className="mb-8">
                    <h4 className="text-lg font-medium text-gray-900 mb-4 flex items-center space-x-2">
                      <Clock className="w-5 h-5" />
                      <span>Historial de Aprobaciones</span>
                    </h4>
                    <ApprovalHistory contractId={contract.id} />
                  </div>

                  {auditLogs.length === 0 ? (
                    <div className="text-center py-8">
                      <MessageCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-500">No hay registros de auditoria</p>
                    </div>
                  ) : (
                    auditLogs.map((log) => (
                      <div key={log.id} className="bg-gray-50 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-3">
                            <div className="flex items-center justify-center w-8 h-8 bg-indigo-100 rounded-full">
                              <MessageCircle className="w-4 h-4 text-indigo-600" />
                            </div>
                            <div>
                              <h4 className="font-medium text-gray-900 capitalize">
                                {log.action}
                              </h4>
                              <p className="text-sm text-gray-600">
                                por {log.user_name || 'Sistema'}
                              </p>
                            </div>
                          </div>
                          <span className="text-xs text-gray-500">
                            {formatDate(log.timestamp)}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
        
        {/* Contract Cancellation Modal */}
        {showCancellationModal && (
          <ContractCancellationModal
            isOpen={showCancellationModal}
            onClose={() => setShowCancellationModal(false)}
            contract={contract}
            onSuccess={() => {
              setShowCancellationModal(false);
              onClose(); // Close the view modal too
            }}
          />
        )}
        
        {/* Digital Signature Modal */}
        {showSignatureModal && currentSignatory && (
          <SignatureCanvas
            isOpen={showSignatureModal}
            onClose={() => {
              setShowSignatureModal(false);
              setCurrentSignatory(null);
            }}
            onSave={handleSaveSignature}
            signerName={currentSignatory.name}
            contractTitle={contract.title}
            loading={loading}
          />
        )}
      </motion.div>
    </div>
  );
};

// Componente para mostrar progreso de firmas
const SignatureProgressBadge: React.FC<{ signatories: any[] }> = ({ signatories }) => {
  const totalSignatories = signatories.length;
  const completedSignatures = signatories.filter(s => s.signed_at).length;
  
  const getProgressColor = () => {
    if (completedSignatures === 0) return 'text-gray-600 bg-gray-100';
    if (completedSignatures === totalSignatories) return 'text-green-600 bg-green-100';
    return 'text-blue-600 bg-blue-100';
  };
  
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getProgressColor()}`}>
      <Users className="w-4 h-4 mr-2" />
      {completedSignatures}/{totalSignatories} Firmas
    </span>
  );
};

// Componente para mostrar contenido del contrato
const ContractContentViewer: React.FC<{ contract: any; previewContent: string }> = ({ 
  contract, 
  previewContent 
}) => {
  const [processedContent, setProcessedContent] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    processContractContent();
  }, [contract, previewContent]);

  const processContractContent = async () => {
    try {
      setLoading(true);
      
      // Si ya hay contenido procesado, usarlo
      if (previewContent) {
        setProcessedContent(previewContent);
        setLoading(false);
        return;
      }
      
      // Si hay generated_content, usarlo
      if (contract.generated_content) {
        setProcessedContent(contract.generated_content);
        setLoading(false);
        return;
      }
      
      // Procesar el contenido con variables
      let content = contract.content || '';
      
      if (contract.variables_data && contract.template_id) {
        try {
          const { data: template } = await supabase
            .from('contract_templates')
            .select('variables')
            .eq('id', contract.template_id)
            .single();
            
          if (template && template.variables) {
            const { data: variables } = await supabase
              .from('template_variables')
              .select('*')
              .in('name', template.variables);
              
            if (variables) {
              variables.forEach(variable => {
                const value = contract.variables_data[variable.name] || `[${variable.label}]`;
                content = content.replace(
                  new RegExp(`{{${variable.name}}}`, 'g'), 
                  value
                );
              });
            }
          }
        } catch (error) {
          console.warn('Error processing variables:', error);
        }
      }
      
      setProcessedContent(content);
    } catch (error) {
      console.error('Error processing contract content:', error);
      setProcessedContent(contract.content || 'Error al cargar el contenido');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="border border-gray-200 rounded-lg p-6 bg-white">
        <div className="flex items-center justify-center py-8">
          <LoadingSpinner size="large" />
        </div>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
      <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
        <h5 className="font-medium text-gray-900">Documento Completo</h5>
      </div>
      <div className="p-6">
        <div className="prose max-w-none">
          <pre className="whitespace-pre-wrap text-sm text-gray-900 font-sans leading-relaxed">
            {processedContent}
          </pre>
        </div>
      </div>
    </div>
  );
};

// Componente para mostrar historial de aprobaciones
const ApprovalHistory: React.FC<{ contractId: string }> = ({ contractId }) => {
  const [approvals, setApprovals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadApprovalHistory();
  }, [contractId]);

  const loadApprovalHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('contract_approvals')
        .select(`
          *,
          requester:user_profiles!requested_by(name, email),
          reviewer:user_profiles!reviewed_by(name, email)
        `)
        .eq('contract_id', contractId)
        .order('requested_at', { ascending: false });

      if (error) throw error;
      setApprovals(data || []);
    } catch (error) {
      console.error('Error loading approval history:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-orange-600 bg-orange-100';
      case 'approved': return 'text-green-600 bg-green-100';
      case 'rejected': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return Clock;
      case 'approved': return CheckCircle;
      case 'rejected': return XCircle;
      default: return History;
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <LoadingSpinner size="small" />
      </div>
    );
  }

  if (approvals.length === 0) {
    return (
      <div className="text-center py-6 bg-gray-50 rounded-lg">
        <History className="w-8 h-8 text-gray-400 mx-auto mb-2" />
        <p className="text-gray-500 text-sm">No hay historial de aprobaciones</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {approvals.map((approval, index) => {
        const StatusIcon = getStatusIcon(approval.status);
        return (
          <div key={approval.id} className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center space-x-3">
                <div className="flex items-center justify-center w-8 h-8 bg-blue-100 rounded-full">
                  <span className="text-xs font-semibold text-blue-600">
                    v{approval.version_number}
                  </span>
                </div>
                <div>
                  <h5 className="font-medium text-gray-900">
                    Solicitud de Aprobación #{approvals.length - index}
                  </h5>
                  <p className="text-sm text-gray-600">
                    Solicitado por {approval.requester?.name || 'Usuario desconocido'}
                  </p>
                </div>
              </div>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(approval.status)}`}>
                <StatusIcon className="w-3 h-3 mr-1" />
                {approval.status === 'pending' ? 'Pendiente' :
                 approval.status === 'approved' ? 'Aprobado' : 'Rechazado'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600 mb-3">
              <div>
                <span className="font-medium">Solicitado:</span> {formatDate(approval.requested_at)}
              </div>
              {approval.reviewed_at && (
                <div>
                  <span className="font-medium">
                    {approval.status === 'approved' ? 'Aprobado' : 'Rechazado'}:
                  </span> {formatDate(approval.reviewed_at)}
                </div>
              )}
            </div>

            {approval.reviewer && (
              <div className="text-sm text-gray-600 mb-3">
                <span className="font-medium">Revisado por:</span> {approval.reviewer.name}
              </div>
            )}

            {approval.comments && (
              <div className={`p-3 rounded-lg text-sm ${
                approval.status === 'rejected' 
                  ? 'bg-red-50 border border-red-200'
                  : 'bg-gray-50 border border-gray-200'
              }`}>
                <div className="flex items-start space-x-2">
                  <MessageCircle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                    approval.status === 'rejected' ? 'text-red-600' : 'text-gray-600'
                  }`} />
                  <div>
                    <h6 className={`font-semibold text-xs uppercase tracking-wide mb-1 ${
                      approval.status === 'rejected' ? 'text-red-800' : 'text-gray-800'
                    }`}>
                      {approval.status === 'rejected' ? 'Motivo del Rechazo:' : 'Comentarios:'}
                    </h6>
                    <p className={approval.status === 'rejected' ? 'text-red-700' : 'text-gray-700'}>
                      {approval.comments}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};