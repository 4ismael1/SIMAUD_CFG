import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Settings, 
  FileText, 
  Shield,
  LogOut,
  Menu,
  X,
  Home,
  UserCheck,
  Bell,
  Search,
  RefreshCw,
  TrendingUp,
  BarChart3,
  Users,
  Target,
  AlertTriangle,
  CheckCircle,
  Clock
} from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';
import { VariableManagement } from '../admin/VariableManagement';
import { TemplateManagement } from '../admin/TemplateManagement';
import { UserProfile } from '../../common/UserProfile';
import { ContractApprovalQueue } from '../../contracts/ContractApprovalQueue';
import { RenewalCenter } from '../../renewals/RenewalCenter';
import { AnalyticsReports } from '../../reports/AnalyticsReports';
import { NotificationCenter } from '../../notifications/NotificationCenter';
import { ExpiryAlerts } from '../../notifications/ExpiryAlerts';
import { LoadingSpinner } from '../../common/LoadingSpinner';

type SupervisorView = 'dashboard' | 'variables' | 'templates' | 'approvals' | 'renewals' | 'analytics' | 'profile';

export const SupervisorDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const [currentView, setCurrentView] = useState<SupervisorView>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const navigationItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'variables', label: 'Variables Sistema', icon: Settings },
    { id: 'templates', label: 'Plantillas Contratos', icon: FileText },
    { id: 'approvals', label: 'Aprobaciones', icon: Bell },
    { id: 'renewals', label: 'Renovaciones', icon: RefreshCw },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'profile', label: 'Mi Perfil', icon: UserCheck }
  ];

  useEffect(() => {
    // Only load dashboard data if we're on dashboard view and don't have data yet
    if (currentView === 'dashboard' && (!dashboardData || error)) {
      loadDashboardData();
    }
  }, [currentView]); // Remove user dependency to prevent reload on tab switch

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
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dashboard-stats?role=supervisor&userId=${user.id}`,
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
      case 'variables':
        return <VariableManagement onCreateVariable={handleCreateVariable} />;
      case 'templates':
        return <TemplateManagement onCreateTemplate={handleCreateTemplate} />;
      case 'approvals':
        return <ContractApprovalQueue />;
      case 'renewals':
        return <RenewalCenter />;
      case 'analytics':
        return <AnalyticsReports />;
      case 'profile':
        return <UserProfile />;
      case 'dashboard':
        return <SupervisorDashboardHome data={dashboardData} loading={loading} error={error} onRefresh={loadDashboardData} onCreateVariable={handleCreateVariable} onCreateTemplate={handleCreateTemplate} />;
      default:
        return <SupervisorDashboardHome data={dashboardData} loading={loading} error={error} onRefresh={loadDashboardData} onCreateVariable={handleCreateVariable} onCreateTemplate={handleCreateTemplate} />;
    }
  };

  const handleCreateVariable = () => {
    setCurrentView('variables');
  };

  const handleCreateTemplate = () => {
    setCurrentView('templates');
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
            <div className="flex items-center justify-center w-8 h-8 bg-gradient-to-r from-green-500 to-green-600 rounded-lg">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">SIMAUD</h1>
              <p className="text-xs text-gray-500">Panel Supervisor</p>
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
                    setCurrentView(item.id as SupervisorView);
                    setSidebarOpen(false);
                  }}
                  className={`w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-colors duration-200 ${
                    isActive
                      ? 'bg-green-50 text-green-700 border-r-2 border-green-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <Icon className={`mr-3 h-5 w-5 ${
                    isActive ? 'text-green-700' : 'text-gray-400'
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
            <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-r from-green-500 to-green-600 rounded-full">
              <UserCheck className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-700 truncate">{user?.name}</p>
              <p className="text-xs text-gray-500 capitalize">Supervisor</p>
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
                  {currentView === 'dashboard' && 'Panel de control supervisor'}
                  {currentView === 'variables' && 'Administra variables del sistema'}
                  {currentView === 'templates' && 'Gestiona plantillas de contratos'}
                  {currentView === 'approvals' && 'Revisa y aprueba contratos pendientes'}
                  {currentView === 'renewals' && 'Gestiona renovaciones de contratos'}
                  {currentView === 'analytics' && 'Métricas y análisis del sistema'}
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
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm"
                />
              </div>
              <NotificationCenter onNavigate={(url) => {
                if (url.includes('/approvals/')) {
                  setCurrentView('approvals');
                } else if (url.includes('/templates/')) {
                  setCurrentView('templates');
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
const SupervisorDashboardHome: React.FC<{ 
  data: any; 
  loading: boolean; 
  error: string; 
  onRefresh: () => void;
  onCreateVariable: () => void;
  onCreateTemplate: () => void;
}> = ({ data, loading, error, onRefresh, onCreateVariable, onCreateTemplate }) => {
  const { user } = useAuth();

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
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors duration-200"
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
      title: 'Plantillas Activas',
      value: data.stats.active_templates.toString(),
      change: `${data.stats.new_templates_month}`,
      icon: FileText,
      color: 'from-blue-500 to-blue-600',
      description: 'nuevas este mes'
    },
    {
      title: 'Variables Disponibles',
      value: data.stats.total_variables.toString(),
      change: `${data.stats.template_utilization.toFixed(1)}%`,
      icon: Settings,
      color: 'from-green-500 to-green-600',
      description: 'utilización plantillas'
    },
    {
      title: 'Contratos Generados',
      value: data.stats.contracts_generated.toString(),
      change: `${data.stats.avg_approval_time.toFixed(1)}d`,
      icon: BarChart3,
      color: 'from-purple-500 to-purple-600',
      description: 'tiempo aprobación'
    },
    {
      title: 'Aprobaciones Pendientes',
      value: data.stats.pending_approvals.toString(),
      change: `${data.stats.expiring_contracts || 0}`,
      icon: Bell,
      color: 'from-orange-500 to-orange-600',
      description: 'contratos por vencer'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">¡Hola, {user?.name}!</h2>
          <p className="text-gray-600">Panel de control supervisor - Gestiona el sistema</p>
        </div>
        <button
          onClick={onRefresh}
          className="flex items-center space-x-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors duration-200"
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
                  stat.change.includes('%') || stat.change.includes('d')
                    ? 'text-blue-600 bg-blue-100'
                    : stat.change.startsWith('+') || parseInt(stat.change) > 0
                    ? 'text-green-600 bg-green-100' 
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

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quick Actions */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Acciones Rápidas</h3>
          <div className="space-y-3">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onCreateVariable}
              className="w-full flex items-center space-x-3 p-3 rounded-lg border border-gray-200 hover:border-green-300 hover:bg-green-50 transition-all duration-200 text-green-600"
            >
              <Settings className="w-5 h-5" />
              <span className="font-medium text-gray-900">Nueva Variable</span>
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onCreateTemplate}
              className="w-full flex items-center space-x-3 p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-all duration-200 text-blue-600"
            >
              <FileText className="w-5 h-5" />
              <span className="font-medium text-gray-900">Nueva Plantilla</span>
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setCurrentView('approvals')}
              className="w-full flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:border-orange-300 hover:bg-orange-50 transition-all duration-200 text-orange-600"
            >
              <div className="flex items-center space-x-3">
                <Bell className="w-5 h-5" />
                <span className="font-medium text-gray-900">Ver Aprobaciones</span>
              </div>
              {data.stats.pending_approvals > 0 && (
                <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                  {data.stats.pending_approvals}
                </span>
              )}
            </motion.button>
          </div>
        </div>

        {/* Template Usage Chart */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Uso de Plantillas</h3>
          <div className="space-y-3">
            {data.charts.template_usage?.slice(0, 5).map((template: any, index: number) => (
              <div key={template.template_id} className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {template.template_name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {template.usage_count} usos • {template.percentage.toFixed(1)}%
                  </p>
                </div>
                <div className="w-16 bg-gray-200 rounded-full h-2 ml-3">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${template.percentage}%` }}
                  />
                </div>
              </div>
            )) || (
              <p className="text-gray-500 text-sm">No hay datos de uso disponibles</p>
            )}
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Variable Usage */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Variables Más Usadas</h3>
          <div className="space-y-3">
            {data.charts.variable_usage?.slice(0, 6).map((variable: any, index: number) => (
              <div key={variable.variable_name} className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {variable.variable_label}
                  </p>
                  <code className="text-xs text-blue-600 bg-blue-50 px-1 py-0.5 rounded">
                    {`{{${variable.variable_name}}}`}
                  </code>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-12 bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-green-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${variable.percentage}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-gray-900 w-6 text-right">
                    {variable.usage_count}
                  </span>
                </div>
              </div>
            )) || (
              <p className="text-gray-500 text-sm">No hay datos de variables disponibles</p>
            )}
          </div>
        </div>

        {/* Template Categories */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Plantillas por Categoría</h3>
          <div className="space-y-3">
            {Object.entries(data.charts.template_categories).map(([category, count]: [string, any]) => (
              <div key={category} className="flex items-center justify-between">
                <span className="text-sm text-gray-600 capitalize">{category}</span>
                <div className="flex items-center space-x-2">
                  <div className="w-16 bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                      style={{ 
                        width: `${(count / data.stats.total_templates) * 100}%` 
                      }}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-900 w-6 text-right">{count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Templates and Pending Approvals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Templates */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Plantillas Recientes</h3>
          <div className="space-y-3">
            {data.recent_templates?.map((template: any, index: number) => (
              <div key={template.id} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <FileText className="w-4 h-4 text-blue-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{template.title}</p>
                  <p className="text-xs text-gray-500">{template.category} • {new Date(template.created_at).toLocaleDateString('es-ES')}</p>
                </div>
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                  template.status === 'active' ? 'text-green-600 bg-green-100' : 'text-gray-600 bg-gray-100'
                }`}>
                  {template.status === 'active' ? 'Activa' : 'Inactiva'}
                </span>
              </div>
            )) || (
              <p className="text-gray-500 text-sm">No hay plantillas recientes</p>
            )}
          </div>
        </div>

        {/* Pending Approvals Quick View */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Aprobaciones Pendientes</h3>
            {data.stats.pending_approvals > 0 && (
              <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                {data.stats.pending_approvals}
              </span>
            )}
          </div>
          {data.pending_approvals_list?.length > 0 ? (
            <div className="space-y-3">
              {data.pending_approvals_list.map((approval: any, index: number) => (
                <div key={approval.id} className="flex items-center space-x-3 p-3 bg-orange-50 rounded-lg">
                  <div className="p-2 bg-orange-100 rounded-lg">
                    <Clock className="w-4 h-4 text-orange-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">Contrato #{approval.contract_id.slice(-8)}</p>
                    <p className="text-xs text-gray-500">
                      Solicitado: {new Date(approval.requested_at).toLocaleDateString('es-ES')}
                    </p>
                  </div>
                </div>
              ))}
              <button
                onClick={() => setCurrentView('approvals')}
                className="w-full text-sm text-orange-600 hover:text-orange-700 font-medium mt-3"
              >
                Ver todas las aprobaciones →
              </button>
            </div>
          ) : (
            <div className="text-center py-6">
              <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">No hay aprobaciones pendientes</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};