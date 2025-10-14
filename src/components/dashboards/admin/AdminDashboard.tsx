import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Users, 
  FileText, 
  BarChart3, 
  Settings, 
  Bell,
  Search,
  Plus,
  Shield,
  LogOut,
  Menu,
  X,
  Home,
  UserCheck,
  TrendingUp,
  DollarSign,
  Clock,
  Target,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { UserManagement } from './UserManagement';
import { TemplateManagement } from './TemplateManagement';
import { VariableManagement } from './VariableManagement';
import { UserProfile } from '../../common/UserProfile';
import { ContractManagement } from '../../contracts/ContractManagement';
import { ContractApprovalQueue } from '../../contracts/ContractApprovalQueue';
import { ReportsCenter } from '../../reports/ReportsCenter';
import { RenewalCenter } from '../../renewals/RenewalCenter';
import { SystemConfiguration } from '../admin/SystemConfiguration';
import { ContractManagementAdmin } from '../admin/ContractManagementAdmin';
import { NotificationCenter } from '../../notifications/NotificationCenter';
import { ExpiryAlerts } from '../../notifications/ExpiryAlerts';
import { LoadingSpinner } from '../../common/LoadingSpinner';

type AdminView = 'dashboard' | 'users' | 'templates' | 'variables' | 'contracts' | 'management' | 'approvals' | 'renewals' | 'reports' | 'settings' | 'profile';

export const AdminDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const [currentView, setCurrentView] = useState<AdminView>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const navigationItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'users', label: 'Gestión de Usuarios', icon: Users },
    { id: 'templates', label: 'Plantillas Contratos', icon: FileText },
    { id: 'variables', label: 'Variables Sistema', icon: Settings },
    { id: 'contracts', label: 'Contratos', icon: FileText },
    { id: 'management', label: 'Gestión', icon: Settings },
    { id: 'approvals', label: 'Aprobaciones', icon: Bell },
    { id: 'renewals', label: 'Renovaciones', icon: RefreshCw },
    { id: 'reports', label: 'Centro de Reportes', icon: BarChart3 },
    { id: 'settings', label: 'Configuración', icon: Settings },
    { id: 'profile', label: 'Mi Perfil', icon: UserCheck }
  ];

  useEffect(() => {
    // Only load dashboard data if we're on dashboard view and don't have data yet
    if (currentView === 'dashboard' && (!dashboardData || error)) {
      loadDashboardData();
    }
  }, [currentView]); // Keep only currentView dependency

  const loadDashboardData = async () => {
    if (!user) return;
    
    setLoading(true);
    setError('');
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.warn('No authenticated session found, skipping dashboard data load');
        setDashboardData(null);
        setLoading(false);
        return;
      }

      if (!import.meta.env.VITE_SUPABASE_URL) {
        throw new Error('VITE_SUPABASE_URL no está configurado');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dashboard-stats?role=admin&userId=${user.id}`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error('Error al cargar datos del dashboard');
      }

      const data = await response.json();
      setDashboardData(data);
    } catch (error: any) {
      console.error('Error loading dashboard data:', error);
      setError(error.message || 'Error al cargar los datos');
    } finally {
      setLoading(false);
    }
  };

  const renderMainContent = () => {
    switch (currentView) {
      case 'users':
        return <UserManagement onCreateUser={handleCreateUser} />;
      case 'templates':
        return <TemplateManagement onCreateTemplate={handleCreateTemplate} />;
      case 'variables':
        return <VariableManagement onCreateVariable={handleCreateVariable} />;
      case 'contracts':
        return <ContractManagement onCreateContract={handleCreateContract} />;
      case 'management':
        return <ContractManagementAdmin />;
      case 'approvals':
        return <ContractApprovalQueue />;
      case 'renewals':
        return <RenewalCenter />;
      case 'reports':
        return <ReportsCenter />;
      case 'settings':
        return <SystemConfiguration />;
      case 'profile':
        return <UserProfile />;
      case 'dashboard':
        return (
          <DashboardHome
            data={dashboardData}
            loading={loading}
            error={error}
            onRefresh={loadDashboardData}
            onNavigate={(view) => setCurrentView(view)}
          />
        );
      default:
        return (
          <DashboardHome
            data={dashboardData}
            loading={loading}
            error={error}
            onRefresh={loadDashboardData}
            onNavigate={(view) => setCurrentView(view)}
          />
        );
    }
  };

  const handleCreateUser = () => {
    setCurrentView('users');
    // La lógica de crear usuario se maneja en UserManagement
  };

  const handleCreateTemplate = () => {
    setCurrentView('templates');
    // La lógica de crear plantilla se maneja en TemplateManagement
  };

  const handleCreateVariable = () => {
    setCurrentView('variables');
    // La lógica de crear variable se maneja en VariableManagement
  };

  const handleCreateContract = () => {
    setCurrentView('contracts');
    // La lógica de crear contrato se maneja en ContractManagement
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
            <div className="flex items-center justify-center w-8 h-8 bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">SIMAUD</h1>
              <p className="text-xs text-gray-500">Admin Panel</p>
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
                    setCurrentView(item.id as AdminView);
                    setSidebarOpen(false);
                  }}
                  className={`w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-colors duration-200 ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <Icon className={`mr-3 h-5 w-5 ${
                    isActive ? 'text-blue-700' : 'text-gray-400'
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
            <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-r from-purple-500 to-purple-600 rounded-full">
              <UserCheck className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-700 truncate">{user?.name}</p>
              <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
            </div>
          </button>
          <button
            onClick={logout}
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
                  {currentView === 'dashboard' && 'Resumen general del sistema'}
                  {currentView === 'users' && 'Administra usuarios del sistema'}
                  {currentView === 'templates' && 'Gestiona plantillas de contratos'}
                  {currentView === 'variables' && 'Administra variables del sistema'}
                  {currentView === 'contracts' && 'Gestiona contratos y documentos'}
                  {currentView === 'management' && 'Gestión avanzada de contratos - Eliminar permanentemente'}
                  {currentView === 'approvals' && 'Revisa y aprueba contratos pendientes'}
                  {currentView === 'renewals' && 'Gestiona renovaciones de contratos'}
                  {currentView === 'reports' && 'Centro completo de reportes y analytics'}
                  {currentView === 'settings' && 'Configuración del sistema'}
                  {currentView === 'profile' && 'Gestiona tu información personal'}
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Buscar..."
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>
              <NotificationCenter onNavigate={(url) => {
                // Handle navigation based on URL
                if (url.includes('/contracts/')) {
                  setCurrentView('contracts');
                } else if (url.includes('/renewals/')) {
                  // TODO: Navigate to renewals when implemented
                } else if (url.includes('/approvals/')) {
                  setCurrentView('approvals');
                }
              }} />
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto bg-gray-50">
          <div className="p-6">
            {renderMainContent()}
          </div>
        </main>
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-gray-600 bg-opacity-75 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
};

// Dashboard Home Component
const DashboardHome: React.FC<{
  data: any;
  loading: boolean;
  error: string;
  onRefresh: () => void;
  onNavigate: (view: AdminView) => void;
}> = ({ data, loading, error, onRefresh, onNavigate }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'charts'>('overview');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <LoadingSpinner size="large" />
          <p className="text-gray-600 mt-4">Cargando estadísticas...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-500 mb-4">
          <AlertTriangle className="w-12 h-12 mx-auto" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Error al cargar datos</h3>
        <p className="text-gray-500 mb-6">{error}</p>
        <button
          onClick={onRefresh}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No hay datos disponibles</p>
      </div>
    );
  }

  const stats = [
    {
      title: 'Usuarios Totales',
      value: data.stats.total_users.toLocaleString(),
      change: `+${data.stats.new_users_month}`,
      icon: Users,
      color: 'from-blue-500 to-blue-600',
      description: `${data.stats.new_users_month} nuevos este mes`
    },
    {
      title: 'Contratos Totales',
      value: data.stats.total_contracts.toLocaleString(),
      change: `+${data.stats.new_contracts_month}`,
      icon: FileText,
      color: 'from-green-500 to-green-600',
      description: `${data.stats.new_contracts_month} nuevos este mes`
    },
    {
      title: 'Valor Total',
      value: `$${data.stats.total_value.toLocaleString()}`,
      change: `${data.quick_stats.approval_rate.toFixed(1)}%`,
      icon: DollarSign,
      color: 'from-purple-500 to-purple-600',
      description: 'Tasa de aprobación'
    },
    {
      title: 'Contratos Activos',
      value: (data.stats.active_contracts || 0).toString(),
      change: `${data.stats.expiring_soon || 0}`,
      icon: Clock,
      color: 'from-orange-500 to-orange-600',
      description: 'próximos a vencer'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header with tabs */}
      <div className="flex items-center justify-between">
        <div className="flex space-x-4">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors duration-200 ${
              activeTab === 'overview'
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Resumen
          </button>
          <button
            onClick={() => setActiveTab('charts')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors duration-200 ${
              activeTab === 'charts'
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Gráficos
          </button>
        </div>
        <button
          onClick={onRefresh}
          className="flex items-center space-x-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Actualizar</span>
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
                <span className={`text-sm font-semibold px-2 py-1 rounded-full ${
                  stat.change.startsWith('+') 
                    ? 'text-green-600 bg-green-100' 
                    : stat.change.includes('%')
                    ? 'text-blue-600 bg-blue-100'
                    : 'text-gray-600 bg-gray-100'
                }`}>
                  {stat.change}
                </span>
              </div>
              <div>
                <h3 className="text-2xl font-bold text-gray-900 mb-1">
                  {stat.value}
                </h3>
                <p className="text-gray-600 text-sm">{stat.title}</p>
                <p className="text-gray-500 text-xs mt-1">{stat.description}</p>
              </div>
            </motion.div>
          );
        })}
      </div>

      {activeTab === 'overview' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Quick Actions */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Acciones Rápidas</h3>
            <div className="space-y-3">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onNavigate('users')}
                className="w-full flex items-center space-x-3 p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-all duration-200 text-blue-600"
              >
                <Plus className="w-5 h-5" />
                <span className="font-medium text-gray-900">Gestionar Usuarios</span>
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onNavigate('contracts')}
                className="w-full flex items-center space-x-3 p-3 rounded-lg border border-gray-200 hover:border-green-300 hover:bg-green-50 transition-all duration-200 text-green-600"
              >
                <FileText className="w-5 h-5" />
                <span className="font-medium text-gray-900">Gestionar Contratos</span>
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onNavigate('reports')}
                className="w-full flex items-center space-x-3 p-3 rounded-lg border border-gray-200 hover:border-purple-300 hover:bg-purple-50 transition-all duration-200 text-purple-600"
              >
                <BarChart3 className="w-5 h-5" />
                <span className="font-medium text-gray-900">Centro de Reportes</span>
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onNavigate('approvals')}
                className="w-full flex items-center space-x-3 p-3 rounded-lg border border-gray-200 hover:border-orange-300 hover:bg-orange-50 transition-all duration-200 text-orange-600"
              >
                <Bell className="w-5 h-5" />
                <span className="font-medium text-gray-900">Cola de Aprobaciones</span>
                {data.stats.pending_approvals > 0 && (
                  <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                    {data.stats.pending_approvals}
                  </span>
                )}
              </motion.button>
            </div>
          </div>

          {/* Activity and Stats */}
          <div className="space-y-6">
            {/* Recent Activity */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Actividad Reciente</h3>
              <div className="space-y-4">
                {data.recent_activity?.slice(0, 4).map((activity: any, index: number) => (
                  <div key={index} className="flex items-start space-x-3">
                    <div className="p-2 bg-blue-100 rounded-full">
                      <FileText className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{activity.title}</p>
                      <p className="text-xs text-gray-500">
                        Cliente: {activity.client_name} • {new Date(activity.created_at).toLocaleDateString('es-ES')}
                      </p>
                    </div>
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      activity.approval_status === 'approved' ? 'text-green-600 bg-green-100' :
                      activity.approval_status === 'pending_approval' ? 'text-orange-600 bg-orange-100' :
                      'text-gray-600 bg-gray-100'
                    }`}>
                      {activity.approval_status.replace('_', ' ')}
                    </span>
                  </div>
                )) || (
                  <p className="text-gray-500 text-sm">No hay actividad reciente</p>
                )}
              </div>
            </div>

            {/* Top Gestores */}
            {data.top_gestores && data.top_gestores.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Gestores</h3>
                <div className="space-y-3">
                  {data.top_gestores.map((gestor: any, index: number) => (
                    <div key={gestor.user_id} className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                          index === 0 ? 'bg-yellow-100 text-yellow-600' :
                          index === 1 ? 'bg-gray-100 text-gray-600' :
                          index === 2 ? 'bg-orange-100 text-orange-600' :
                          'bg-blue-100 text-blue-600'
                        }`}>
                          <span className="text-xs font-bold">#{index + 1}</span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{gestor.user_name}</p>
                          <p className="text-xs text-gray-500">{gestor.contracts_count} contratos</p>
                        </div>
                      </div>
                      <span className="text-sm font-medium text-gray-600">
                        ${gestor.total_value.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <AdminChartsView data={data} />
      )}
    </div>
  );
};

// Admin Charts View Component
const AdminChartsView: React.FC<{ data: any }> = ({ data }) => {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'USD' }).format(value);
  };

  return (
    <div className="space-y-6">
      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Contracts by Month */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Contratos por Mes</h3>
          <div className="space-y-3">
            {Object.entries(data.charts.contracts_by_month).map(([month, count]: [string, any]) => (
              <div key={month} className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{month}</span>
                <div className="flex items-center space-x-2">
                  <div className="w-24 bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ 
                        width: `${(count / Math.max(...Object.values(data.charts.contracts_by_month))) * 100}%` 
                      }}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-900 w-8 text-right">{count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Status Distribution */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Distribución por Estado</h3>
          <div className="space-y-3">
            {Object.entries(data.charts.status_distribution).map(([status, count]: [string, any]) => (
              <div key={status} className="flex items-center justify-between">
                <span className="text-sm text-gray-600 capitalize">{status.replace('_', ' ')}</span>
                <div className="flex items-center space-x-2">
                  <div className="w-20 bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-green-600 h-2 rounded-full transition-all duration-300"
                      style={{ 
                        width: `${(count / data.stats.total_contracts) * 100}%` 
                      }}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-900 w-8 text-right">{count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Role Distribution */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Usuarios por Rol</h3>
          <div className="space-y-3">
            {Object.entries(data.charts.role_distribution).map(([role, count]: [string, any]) => (
              <div key={role} className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className={`w-3 h-3 rounded-full ${
                    role === 'admin' ? 'bg-purple-500' :
                    role === 'supervisor' ? 'bg-green-500' :
                    role === 'gestor' ? 'bg-blue-500' : 'bg-gray-500'
                  }`}></div>
                  <span className="text-sm text-gray-600 capitalize">
                    {role === 'admin' ? 'Administradores' :
                     role === 'supervisor' ? 'Supervisores' :
                     role === 'gestor' ? 'Gestores' : 'Usuarios'}
                  </span>
                </div>
                <span className="text-sm font-medium text-gray-900">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Value Trend */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Tendencia de Valor</h3>
          <div className="space-y-3">
            {Object.entries(data.charts.value_trend).slice(-6).map(([month, value]: [string, any]) => (
              <div key={month} className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{month}</span>
                <div className="flex items-center space-x-2">
                  <div className="w-20 bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                      style={{ 
                        width: `${(value / Math.max(...Object.values(data.charts.value_trend))) * 100}%` 
                      }}
                    />
                  </div>
                  <span className="text-xs font-medium text-gray-900">
                    ${(value / 1000).toFixed(0)}K
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* System Metrics */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-6">Métricas del Sistema</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="text-center">
            <div className="flex items-center justify-center w-12 h-12 bg-blue-100 rounded-full mx-auto mb-3">
              <Target className="w-6 h-6 text-blue-600" />
            </div>
            <p className="text-2xl font-bold text-blue-600">{data.quick_stats.approval_rate.toFixed(1)}%</p>
            <p className="text-sm text-gray-600">Tasa de Aprobación</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center w-12 h-12 bg-green-100 rounded-full mx-auto mb-3">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
            <p className="text-2xl font-bold text-green-600">
              ${(data.quick_stats.average_contract_value / 1000).toFixed(0)}K
            </p>
            <p className="text-sm text-gray-600">Valor Promedio</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center w-12 h-12 bg-purple-100 rounded-full mx-auto mb-3">
              <Clock className="w-6 h-6 text-purple-600" />
            </div>
            <p className="text-2xl font-bold text-purple-600">
              {data.quick_stats.avg_approval_time.toFixed(1)}d
            </p>
            <p className="text-sm text-gray-600">Tiempo Aprobación</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center w-12 h-12 bg-orange-100 rounded-full mx-auto mb-3">
              <TrendingUp className="w-6 h-6 text-orange-600" />
            </div>
            <p className="text-2xl font-bold text-orange-600">{data.quick_stats.system_efficiency.toFixed(1)}%</p>
            <p className="text-sm text-gray-600">Eficiencia Sistema</p>
          </div>
        </div>
      </div>
    </div>
  );
};
