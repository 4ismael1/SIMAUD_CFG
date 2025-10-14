import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  FileText, 
  Users, 
  CheckCircle, 
  XCircle,
  Clock,
  Eye,
  User,
  LogOut,
  Menu,
  X,
  Home,
  UserCheck,
  Bell,
  Search,
  Calendar,
  Mail,
  Phone,
  AlertTriangle,
  PenTool,
  DollarSign
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { UserProfile } from '../../common/UserProfile';
import { ContractViewModal } from '../../contracts/ContractViewModal';
import { NotificationCenter } from '../../notifications/NotificationCenter';
import { LoadingSpinner } from '../../common/LoadingSpinner';
import { SignatureCanvas } from '../../contracts/SignatureCanvas';
import type { Contract } from '../../../types/contracts';

type UserView = 'dashboard' | 'contracts' | 'profile';

interface SignatoryContract extends Contract {
  signatory_status?: 'pending' | 'signed';
  signed_at?: string | null;
  signing_order?: number;
}

export const UserDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const [currentView, setCurrentView] = useState<UserView>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [contracts, setContracts] = useState<SignatoryContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [error, setError] = useState('');
  const [signingContract, setSigningContract] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [currentSignatory, setCurrentSignatory] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [contractStatusFilter, setContractStatusFilter] = useState<string>('all');
  const [signatureStatusFilter, setSignatureStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date' | 'title' | 'status'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    if (user) {
      loadSignatoryContracts();
    }
  }, [user]);

  const loadSignatoryContracts = async () => {
    if (!user) return;
    
    setLoading(true);
    setError('');
    
    try {
      console.log('🔍 Loading contracts for signatory user:', user.email, user.id);

      // PASO 1: Obtener registros de firmantes para este usuario
      const { data: signatories, error: signatoriesError } = await supabase
        .from('contract_signatories')
        .select('*')
        .or(`user_id.eq.${user.id},email.eq."${user.email}"`);

      if (signatoriesError) {
        console.error('❌ Error loading signatories:', signatoriesError);
        throw signatoriesError;
      }

      console.log('📝 Found signatory records:', signatories);

      if (!signatories || signatories.length === 0) {
        console.log('📭 No signatory records found for user:', user.email);
        
        // DEBUG: Check if there are signatories with this email but no user_id
        const { data: emailSignatories } = await supabase
          .from('contract_signatories')
          .select('*')
          .eq('email', user.email);
        
        console.log('📧 Signatories with matching email:', emailSignatories);
        
        if (emailSignatories && emailSignatories.length > 0) {
          console.log('🔗 Found signatories by email - attempting to link to user_id...');
          
          // Auto-link signatories to this user
          const { error: linkError } = await supabase
            .from('contract_signatories')
            .update({ user_id: user.id })
            .eq('email', user.email)
            .is('user_id', null);
          
          if (linkError) {
            console.error('Error linking signatories:', linkError);
          } else {
            console.log('✅ Successfully linked signatories to user');
            // Retry loading after linking
            return loadSignatoryContracts();
          }
        }
        
        setContracts([]);
        setLoading(false);
        return;
      }

      const contractIds = signatories.map(s => s.contract_id);
      console.log('🔗 Contract IDs to fetch:', contractIds);

      // PASO 2: Obtener contratos completos y filtrar por estado
      const { data: contractsData, error: contractsError } = await supabase
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
          template:contract_templates(title)
        `)
        .in('id', contractIds)
        .in('approval_status', ['approved', 'signed', 'completed', 'cancelled']) // Incluir todos los estados relevantes
        .eq('archived', false); // No mostrar archivados

      if (contractsError) {
        console.error('❌ Error loading contracts:', contractsError);
        throw contractsError;
      }

      console.log('📋 Found eligible contracts for signing:', contractsData?.length || 0);
      console.log('📊 Contract details for debugging:', contractsData?.map(c => ({
        id: c.id.slice(-8),
        title: c.title,
        approval_status: c.approval_status,
        status: c.status,
        actual_status: c.actual_status,
        client: c.client_name
      })));
      
      console.log('📊 Contract statuses:', contractsData?.map(c => ({
        id: c.id.slice(-8),
        title: c.title,
        approval_status: c.approval_status,
        status: c.status,
        actual_status: c.actual_status
      })));

      // PASO 3: Combinar datos de contratos con estado de firmante
      const contractsWithStatus = contractsData?.map(contract => {
        const signatory = signatories.find(s => s.contract_id === contract.id);
        return {
          ...contract,
          signatory_status: signatory?.signed_at ? 'signed' : 'pending',
          signed_at: signatory?.signed_at,
          signing_order: signatory?.signing_order
        };
      }) || [];

      console.log('✅ Contracts with signatory status:', contractsWithStatus);
      setContracts(contractsWithStatus);
    } catch (error) {
      console.error('❌ Error loading signatory contracts:', error);
      setError('Error al cargar los contratos para firmar');
    } finally {
      setLoading(false);
    }
  };

  const handleViewContract = (contract: Contract) => {
    setSelectedContract(contract);
    setShowViewModal(true);
  };

  const handleSignContract = async (contract: Contract) => {
    if (!user) {
      setError('Usuario no autenticado');
      return;
    }

    try {
      console.log('🔍 Finding signatory record for contract:', contract.id, 'user:', user.email, 'user_id:', user.id);

      // Buscar el registro del firmante para este contrato
      const { data: signatory, error: signatoryError } = await supabase
        .from('contract_signatories')
        .select('*')
        .eq('contract_id', contract.id)
        .or(`user_id.eq.${user.id},email.eq."${user.email}"`)
        .is('signed_at', null) // Solo firmantes que NO han firmado aún
        .limit(1);

      if (signatoryError) {
        console.error('❌ Error finding signatory:', signatoryError);
        setError('Error al buscar registro de firmante');
        return;
      }

      const signatoryRecord = signatory?.[0];
      if (!signatoryRecord) {
        setError('No se encontró un registro de firmante pendiente para ti en este contrato');
        return;
      }

      if (signatoryRecord.signed_at) {
        setError('Este contrato ya ha sido firmado');
        return;
      }

      // Verificar que el firmante corresponde realmente al usuario actual
      if (signatoryRecord.user_id !== user.id && signatoryRecord.email !== user.email) {
        setError('Este registro de firmante no te corresponde');
        return;
      }
      console.log('📝 Found signatory record:', signatoryRecord);
      setCurrentSignatory({
        id: signatoryRecord.id,
        contract_id: signatoryRecord.contract_id,
        name: signatoryRecord.name,
        email: signatoryRecord.email,
        role: signatoryRecord.role,
        signing_order: signatoryRecord.signing_order,
        contract_title: contract.title
      });
      setShowSignatureModal(true);
      
    } catch (error: any) {
      console.error('Error finding signatory:', error);
      setError('Error al preparar la firma del contrato');
    }
  };

  const handleSaveSignature = async (signatureDataUrl: string) => {
    if (!currentSignatory) return;

    try {
      console.log('💾 Saving signature for signatory ID:', currentSignatory.id);
      console.log('💾 Signatory details:', {
        id: currentSignatory.id,
        name: currentSignatory.name,
        email: currentSignatory.email,
        contract_id: currentSignatory.contract_id
      });

      // Update signatory with signature
      const { error: updateError } = await supabase
        .from('contract_signatories')
        .update({
          signed_at: new Date().toISOString(),
          signature_url: signatureDataUrl,
          status: 'signed',
          ip_address: '127.0.0.1',
          user_agent: navigator.userAgent
        })
        .eq('id', currentSignatory.id);

      if (updateError) {
        console.error('❌ Error updating signatory:', updateError);
        throw updateError;
      }

      console.log('✅ Digital signature saved successfully');

      // Verificar que solo se actualizó UN registro
      const { data: updatedSignatory, error: verifyError } = await supabase
        .from('contract_signatories')
        .select('id, name, signed_at')
        .eq('id', currentSignatory.id)
        .single();

      if (verifyError) {
        console.error('❌ Error verifying signature update:', verifyError);
      } else {
        console.log('✅ Verified signature update for:', updatedSignatory);
      }
      // Update local state
      setContracts(prev => prev.map(c => 
        c.id === currentSignatory.contract_id 
          ? { ...c, signatory_status: 'signed' as const, signed_at: new Date().toISOString() }
          : c
      ));

      // Reload contracts from database to ensure fresh data
      await loadSignatoryContracts();
      setSuccessMessage(`Contrato "${currentSignatory.contract_title}" firmado digitalmente con éxito`);
      setShowSignatureModal(false);
      setCurrentSignatory(null);
      
      // Clear message after 5 seconds
      setTimeout(() => setSuccessMessage(''), 5000);
      
    } catch (error: any) {
      console.error('💥 Error saving signature:', error);
      throw error;
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const stats = [
    {
      title: 'Contratos Para Firmar',
      value: contracts.filter(c => c.signatory_status === 'pending').length.toString(),
      change: '',
      icon: PenTool,
      color: 'from-orange-500 to-orange-600'
    },
    {
      title: 'Contratos Firmados',
      value: contracts.filter(c => c.signatory_status === 'signed').length.toString(),
      change: '',
      icon: CheckCircle,
      color: 'from-green-500 to-green-600'
    },
    {
      title: 'Total de Contratos',
      value: contracts.length.toString(),
      change: '',
      icon: FileText,
      color: 'from-blue-500 to-blue-600'
    }
  ];

  const navigationItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'contracts', label: 'Mis Contratos', icon: FileText },
    { id: 'profile', label: 'Mi Perfil', icon: UserCheck }
  ];

  const renderMainContent = () => {
    switch (currentView) {
      case 'contracts':
        return <ContractsView 
          contracts={contracts} 
          loading={loading} 
          error={error} 
          onViewContract={handleViewContract} 
          onSignContract={handleSignContract} 
          signingContract={signingContract} 
          onRetry={loadSignatoryContracts}
          searchTerm={searchTerm}
          contractStatusFilter={contractStatusFilter}
          signatureStatusFilter={signatureStatusFilter}
          sortBy={sortBy}
          sortOrder={sortOrder}
        />;
      case 'profile':
        return <UserProfile />;
      case 'dashboard':
        return <DashboardHome 
          stats={stats} 
          contracts={contracts} 
          onViewContract={handleViewContract} 
          onSignContract={handleSignContract} 
          signingContract={signingContract} 
          searchTerm={searchTerm}
        />;
      default:
        return <DashboardHome 
          stats={stats} 
          contracts={contracts} 
          onViewContract={handleViewContract} 
          onSignContract={handleSignContract} 
          signingContract={signingContract} 
          searchTerm={searchTerm}
        />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-xl transform ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      } transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0`}>
        
        {/* Sidebar Header */}
        <div className="flex items-center justify-between h-16 px-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="flex items-center justify-center w-8 h-8 bg-gradient-to-r from-orange-500 to-orange-600 rounded-lg">
              <PenTool className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">SIMAUD</h1>
              <p className="text-xs text-gray-500">Panel Firmante</p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="mt-6 px-3">
          <div className="space-y-1">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setCurrentView(item.id as UserView);
                    setSidebarOpen(false);
                  }}
                  className={`w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-colors duration-200 ${
                    isActive
                      ? 'bg-orange-50 text-orange-700 border-r-2 border-orange-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <Icon className={`mr-3 h-5 w-5 ${
                    isActive ? 'text-orange-700' : 'text-gray-400'
                  }`} />
                  {item.label}
                </button>
              );
            })}
          </div>
        </nav>

        {/* User Info */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200">
          <button 
            onClick={() => setCurrentView('profile')}
            className="w-full flex items-center space-x-3 mb-3 p-2 rounded-lg hover:bg-gray-50 transition-colors duration-200"
          >
            <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-r from-orange-500 to-orange-600 rounded-full">
              <User className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-700 truncate">{user?.name}</p>
              <p className="text-xs text-gray-500">Firmante</p>
            </div>
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center px-3 py-2 text-sm text-gray-600 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors duration-200"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Cerrar Sesión
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden lg:ml-0">
        {/* Top Bar */}
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="flex items-center justify-between h-16 px-4 sm:px-6">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 text-gray-400 hover:text-gray-600"
              >
                <Menu className="w-6 h-6" />
              </button>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">
                  {navigationItems.find(item => item.id === currentView)?.label}
                </h1>
                <p className="text-sm text-gray-500">
                  {currentView === 'dashboard' && 'Panel de control para firmantes'}
                  {currentView === 'contracts' && 'Contratos para revisar y firmar'}
                  {currentView === 'profile' && 'Gestiona tu información personal'}
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar contratos..."
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm"
                />
              </div>
              <NotificationCenter onNavigate={(url) => {
                if (url.includes('/contracts/')) {
                  setCurrentView('contracts');
                }
              }} />
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto bg-gray-50">
          <div className="p-6">
            {/* Success Message */}
            {successMessage && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 flex items-start space-x-3"
              >
                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-green-800">Contrato Firmado</h4>
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

            {/* Error Message */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-start space-x-3"
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

            {renderMainContent()}
          </div>
        
          {/* Filters for contracts view only */}
          {currentView === 'contracts' && (
            <div className="p-6 pt-0">
              <ContractsFilters 
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                contractStatusFilter={contractStatusFilter}
                setContractStatusFilter={setContractStatusFilter}
                signatureStatusFilter={signatureStatusFilter}
                setSignatureStatusFilter={setSignatureStatusFilter}
                sortBy={sortBy}
                setSortBy={setSortBy}
                sortOrder={sortOrder}
                setSortOrder={setSortOrder}
              />
            </div>
          )}
        </main>
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-gray-600 bg-opacity-75 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
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
          contractTitle={currentSignatory.contract_title}
        />
      )}
    </div>
  );
};

// Contracts Filters Component
const ContractsFilters: React.FC<{
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  contractStatusFilter: string;
  setContractStatusFilter: (status: string) => void;
  signatureStatusFilter: string;
  setSignatureStatusFilter: (status: string) => void;
  sortBy: 'date' | 'title' | 'status';
  setSortBy: (sort: 'date' | 'title' | 'status') => void;
  sortOrder: 'asc' | 'desc';
  setSortOrder: (order: 'asc' | 'desc') => void;
}> = ({
  searchTerm,
  setSearchTerm,
  contractStatusFilter,
  setContractStatusFilter,
  signatureStatusFilter,
  setSignatureStatusFilter,
  sortBy,
  setSortBy,
  sortOrder,
  setSortOrder
}) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Buscar contratos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm"
          />
        </div>

        {/* Contract Status Filter */}
        <select
          value={contractStatusFilter}
          onChange={(e) => setContractStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm"
        >
          <option value="all">Todos los estados</option>
          <option value="approved">Aprobados</option>
          <option value="signed">Firmados</option>
          <option value="completed">Completados</option>
          <option value="cancelled">Cancelados</option>
        </select>

        {/* Signature Status Filter */}
        <select
          value={signatureStatusFilter}
          onChange={(e) => setSignatureStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm"
        >
          <option value="all">Todas las firmas</option>
          <option value="pending">Pendiente de firmar</option>
          <option value="signed">Ya firmados</option>
        </select>

        {/* Sort Options */}
        <div className="flex space-x-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm"
          >
            <option value="date">Por fecha</option>
            <option value="title">Por título</option>
            <option value="status">Por estado</option>
          </select>
          <button
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-200"
            title={`Ordenar ${sortOrder === 'asc' ? 'descendente' : 'ascendente'}`}
          >
            {sortOrder === 'asc' ? '↑' : '↓'}
          </button>
        </div>
      </div>
    </div>
  );
};

// Dashboard Home Component
const DashboardHome: React.FC<{ 
  stats: any[]; 
  contracts: SignatoryContract[];
  onViewContract: (contract: Contract) => void;
  onSignContract: (contract: Contract) => void;
  signingContract: string | null;
  searchTerm: string;
}> = ({ stats, contracts, onViewContract, onSignContract, signingContract, searchTerm }) => {
  const { user } = useAuth();
  
  // Filter contracts based on search term
  const filteredContracts = contracts.filter(contract => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return contract.title.toLowerCase().includes(searchLower) ||
           contract.client_name?.toLowerCase().includes(searchLower);
  });
  
  const pendingContracts = filteredContracts.filter(c => 
    c.signatory_status === 'pending' && 
    c.approval_status !== 'cancelled'
  ).slice(0, 3);

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-xl shadow-sm p-6 text-white"
      >
        <div className="flex items-center space-x-4">
          <div className="flex items-center justify-center w-12 h-12 bg-white bg-opacity-20 rounded-full">
            <PenTool className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">¡Hola, {user?.name}!</h2>
            <p className="text-orange-100">Tienes contratos esperando tu firma</p>
          </div>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 hover:shadow-md transition-shadow duration-200"
            >
              <div className="flex items-center justify-between mb-4">
                <div className={`p-3 rounded-lg bg-gradient-to-r ${stat.color}`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
              <div>
                <h3 className="text-2xl font-bold text-gray-900 mb-1">
                  {stat.value}
                </h3>
                <p className="text-gray-600 text-sm">{stat.title}</p>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Pending Contracts */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Contratos Pendientes de Firma</h3>
          {contracts.filter(c => c.signatory_status === 'pending').length > 3 && (
            <button className="text-sm text-orange-600 hover:text-orange-700 font-medium">
              Ver todos
            </button>
          )}
        </div>
        
        {pendingContracts.length === 0 ? (
          <div className="text-center py-8">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <p className="text-gray-500">¡Excelente! No tienes contratos pendientes</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingContracts.map((contract, index) => (
              <ContractCard 
                key={contract.id}
                contract={contract}
                onViewContract={onViewContract}
                onSignContract={onSignContract}
                signingContract={signingContract}
                index={index}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Contracts View Component
const ContractsView: React.FC<{
  contracts: SignatoryContract[];
  loading: boolean;
  error: string;
  onViewContract: (contract: Contract) => void;
  onSignContract: (contract: Contract) => void;
  signingContract: string | null;
  onRetry: () => void;
  searchTerm: string;
  contractStatusFilter: string;
  signatureStatusFilter: string;
  sortBy: 'date' | 'title' | 'status';
  sortOrder: 'asc' | 'desc';
}> = ({ 
  contracts, 
  loading, 
  error, 
  onViewContract, 
  onSignContract, 
  signingContract, 
  onRetry,
  searchTerm,
  contractStatusFilter,
  signatureStatusFilter,
  sortBy,
  sortOrder
}) => {
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Filter and sort contracts
  const filteredAndSortedContracts = contracts
    .filter(contract => {
      // Search filter
      const matchesSearch = !searchTerm || 
        contract.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        contract.client_name?.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Contract status filter
      const matchesContractStatus = contractStatusFilter === 'all' || 
        contract.approval_status === contractStatusFilter;
      
      // Signature status filter
      const matchesSignatureStatus = signatureStatusFilter === 'all' || 
        contract.signatory_status === signatureStatusFilter;
      
      return matchesSearch && matchesContractStatus && matchesSignatureStatus;
    })
    .sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;
        case 'status':
          comparison = a.approval_status.localeCompare(b.approval_status);
          break;
        case 'date':
        default:
          comparison = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Error al cargar contratos</h3>
        <p className="text-gray-500 mb-6">{error}</p>
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors duration-200"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (filteredAndSortedContracts.length === 0) {
    return (
      <div className="text-center py-12">
        <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No hay contratos para firmar</h3>
        <p className="text-gray-500">Los contratos aparecerán aquí cuando sean asignados para tu firma</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {filteredAndSortedContracts.map((contract, index) => (
        <ContractCard 
          key={contract.id}
          contract={contract}
          onViewContract={onViewContract}
          onSignContract={onSignContract}
          signingContract={signingContract}
          index={index}
        />
      ))}
    </div>
  );
};

// Improved Contract Card Component
const ContractCard: React.FC<{
  contract: SignatoryContract;
  onViewContract: (contract: Contract) => void;
  onSignContract: (contract: Contract) => void;
  signingContract: string | null;
  index: number;
}> = ({ contract, onViewContract, onSignContract, signingContract, index }) => {
  
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
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className="bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all duration-200 overflow-hidden"
    >
      <div className="p-6">
        {/* Cancellation notice - most prominent */}
        {contract.approval_status === 'cancelled' && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
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

        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-orange-100">
              {contract.signatory_status === 'signed' ? (
                <CheckCircle className="w-5 h-5 text-orange-600" />
              ) : (
                <PenTool className="w-5 h-5 text-orange-600" />
              )}
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
          <div className="flex flex-col items-end space-y-1">
            {/* CANCELLATION TAG - Most Prominent */}
            {contract.approval_status === 'cancelled' && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold text-red-700 bg-red-100 border border-red-300">
                CANCELADO
              </span>
            )}
            
            {/* EXPIRY TAGS */}
            {contract.actual_status === 'expired' && contract.approval_status !== 'cancelled' && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold text-red-700 bg-red-100">
                VENCIDO
              </span>
            )}
            {contract.actual_status === 'expiring_soon' && contract.approval_status !== 'cancelled' && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold text-yellow-700 bg-yellow-100">
                PRÓXIMO A VENCER
              </span>
            )}
            
            {/* Regular Status Tags - only if not cancelled */}
            {contract.approval_status !== 'cancelled' && (
              <>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  contract.approval_status === 'signed' ? 'text-blue-600 bg-blue-100' :
                  contract.approval_status === 'approved' ? 'text-green-600 bg-green-100' :
                  'text-gray-600 bg-gray-100'
                }`}>
                  {contract.approval_status.replace('_', ' ')}
                </span>
                
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  contract.signatory_status === 'signed' 
                    ? 'text-green-600 bg-green-100'
                    : 'text-orange-600 bg-orange-100'
                }`}>
                  {contract.signatory_status === 'signed' ? 'Ya Firmado' : 'Pendiente de Firma'}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Contract Info */}
        <div className="space-y-3 mb-4">
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
          {contract.end_date && (
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <Calendar className="w-4 h-4" />
              <span>Vence: {formatDate(contract.end_date)}</span>
            </div>
          )}
          {contract.signed_at && (
            <div className="flex items-center space-x-2 text-sm text-green-600">
              <CheckCircle className="w-4 h-4" />
              <span>Firmado: {formatDate(contract.signed_at)}</span>
            </div>
          )}
        </div>
        {/* Action Buttons */}
        <div className="flex space-x-2 mt-4 pt-4 border-t border-gray-200">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onViewContract(contract)}
            className="flex-1 text-sm bg-gray-100 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-200 transition-colors duration-200 font-medium text-center"
          >
            Ver Detalles
          </motion.button>
          
          {contract.approval_status !== 'cancelled' && contract.signatory_status === 'pending' && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onSignContract(contract)}
              disabled={signingContract === contract.id}
              className="flex-1 text-sm bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 disabled:bg-green-400 transition-colors duration-200 font-medium text-center"
            >
              {signingContract === contract.id ? (
                <div className="flex items-center justify-center space-x-2">
                  <LoadingSpinner size="small" />
                  <span>Firmando...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center space-x-2">
                  <PenTool className="w-4 h-4" />
                  <span>Firmar</span>
                </div>
              )}
            </motion.button>
          )}
          
          {contract.signatory_status === 'signed' && contract.approval_status !== 'cancelled' && (
            <div className="flex-1 text-sm bg-green-100 text-green-700 px-3 py-2 rounded-lg font-medium text-center">
              <div className="flex items-center justify-center space-x-2">
                <CheckCircle className="w-4 h-4" />
                <span>Ya Firmado</span>
              </div>
            </div>
          )}

          {contract.approval_status === 'cancelled' && (
            <div className="flex-1 text-sm bg-red-100 text-red-700 px-3 py-2 rounded-lg font-medium text-center">
              <div className="flex items-center justify-center space-x-2">
                <XCircle className="w-4 h-4" />
                <span>Cancelado</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};