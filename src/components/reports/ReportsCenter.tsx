import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  BarChart3, 
  FileText, 
  Users, 
  Download,
  Calendar,
  Filter,
  RefreshCw,
  TrendingUp,
  PieChart,
  Activity,
  DollarSign,
  Clock,
  Target,
  AlertCircle
} from 'lucide-react';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { ContractReports } from './ContractReports';
import { UserReports } from './UserReports';
import { AnalyticsReports } from './AnalyticsReports';
import { ExportManager } from './ExportManager';

type ReportView = 'overview' | 'contracts' | 'users' | 'analytics' | 'export';

export const ReportsCenter: React.FC = () => {
  const [currentView, setCurrentView] = useState<ReportView>('overview');
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    setError('');
    
    try {
      // Cargar analytics básicos para el overview
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reports-analytics?type=dashboard`,
        {
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error('Error al cargar datos del dashboard');
      }

      const data = await response.json();
      setDashboardData(data);
      setLastRefresh(new Date());
    } catch (error: any) {
      console.error('Error loading dashboard data:', error);
      setError(error.message || 'Error al cargar los datos');
    } finally {
      setLoading(false);
    }
  };

  const reportCategories = [
    {
      id: 'contracts',
      title: 'Reportes de Contratos',
      description: 'Análisis detallado de contratos por estado, fecha, usuario y valor',
      icon: FileText,
      color: 'from-blue-500 to-blue-600',
      stats: dashboardData?.kpis ? [
        { label: 'Total Contratos', value: dashboardData.kpis.total_contracts },
        { label: 'Valor Total', value: `$${(dashboardData.kpis.total_contract_value || 0).toLocaleString()}` },
        { label: 'Tasa Aprobación', value: `${dashboardData.kpis.approval_rate?.toFixed(1) || 0}%` }
      ] : []
    },
    {
      id: 'users',
      title: 'Reportes de Usuarios',
      description: 'Estadísticas de usuarios, roles, actividad y productividad',
      icon: Users,
      color: 'from-green-500 to-green-600',
      stats: dashboardData?.kpis ? [
        { label: 'Total Usuarios', value: dashboardData.kpis.total_users },
        { label: 'Usuarios Activos', value: dashboardData.top_performers?.length || 0 },
        { label: 'Nuevos (30d)', value: 'N/A' }
      ] : []
    },
    {
      id: 'analytics',
      title: 'Analytics Avanzado',
      description: 'Tendencias, patrones y métricas de rendimiento del sistema',
      icon: TrendingUp,
      color: 'from-purple-500 to-purple-600',
      stats: dashboardData?.kpis ? [
        { label: 'Eficiencia', value: '85%' },
        { label: 'Tiempo Aprobación', value: '2.3 días' },
        { label: 'Plantillas Activas', value: dashboardData.kpis.total_templates }
      ] : []
    },
    {
      id: 'export',
      title: 'Exportar Datos',
      description: 'Descarga reportes en múltiples formatos (PDF, Excel, CSV)',
      icon: Download,
      color: 'from-orange-500 to-orange-600',
      stats: [
        { label: 'Formatos', value: '4' },
        { label: 'Plantillas', value: '3' },
        { label: 'Auto Export', value: 'Próximamente' }
      ]
    }
  ];

  const navigationItems = [
    { id: 'overview', label: 'Resumen', icon: BarChart3 },
    { id: 'contracts', label: 'Contratos', icon: FileText },
    { id: 'users', label: 'Usuarios', icon: Users },
    { id: 'analytics', label: 'Analytics', icon: TrendingUp },
    { id: 'export', label: 'Exportar', icon: Download }
  ];

  const renderMainContent = () => {
    switch (currentView) {
      case 'contracts':
        return <ContractReports />;
      case 'users':
        return <UserReports />;
      case 'analytics':
        return <AnalyticsReports />;
      case 'export':
        return <ExportManager />;
      case 'overview':
      default:
        return <OverviewDashboard data={dashboardData} onRefresh={loadDashboardData} />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Centro de Reportes</h1>
          <p className="text-gray-600 mt-1">
            Análisis completo del sistema y generación de reportes
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <span className="text-sm text-gray-500">
            Actualizado: {lastRefresh.toLocaleTimeString('es-ES')}
          </span>
          <button
            onClick={loadDashboardData}
            disabled={loading}
            className="flex items-center space-x-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-1">
        <div className="flex space-x-1">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentView(item.id as ReportView)}
                className={`flex items-center space-x-2 px-4 py-3 rounded-lg font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3"
        >
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-red-800">Error</h4>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
        </motion.div>
      )}

      {/* Main Content */}
      <div className="min-h-[600px]">
        {renderMainContent()}
      </div>
    </div>
  );
};

// Overview Dashboard Component
const OverviewDashboard: React.FC<{ 
  data: any; 
  onRefresh: () => void; 
}> = ({ data, onRefresh }) => {
  if (!data) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  const kpis = [
    {
      title: 'Total Contratos',
      value: data.kpis?.total_contracts?.toLocaleString() || '0',
      change: '+12%',
      icon: FileText,
      color: 'from-blue-500 to-blue-600'
    },
    {
      title: 'Total Usuarios',
      value: data.kpis?.total_users?.toLocaleString() || '0',
      change: '+8%',
      icon: Users,
      color: 'from-green-500 to-green-600'
    },
    {
      title: 'Valor Total',
      value: `$${(data.kpis?.total_contract_value || 0).toLocaleString()}`,
      change: '+23%',
      icon: DollarSign,
      color: 'from-purple-500 to-purple-600'
    },
    {
      title: 'Aprobaciones Pendientes',
      value: data.kpis?.pending_approvals?.toString() || '0',
      change: '-5%',
      icon: Clock,
      color: 'from-orange-500 to-orange-600'
    },
    {
      title: 'Tasa de Aprobación',
      value: `${data.kpis?.approval_rate?.toFixed(1) || 0}%`,
      change: '+2%',
      icon: Target,
      color: 'from-emerald-500 to-emerald-600'
    },
    {
      title: 'Plantillas Activas',
      value: data.kpis?.total_templates?.toString() || '0',
      change: '+1',
      icon: Activity,
      color: 'from-indigo-500 to-indigo-600'
    }
  ];

  return (
    <div className="space-y-6">
      {/* KPIs Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {kpis.map((kpi, index) => {
          const Icon = kpi.icon;
          return (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 hover:shadow-md transition-all duration-200"
            >
              <div className="flex items-center justify-between mb-4">
                <div className={`p-3 rounded-lg bg-gradient-to-r ${kpi.color}`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <span className={`text-sm font-semibold px-2 py-1 rounded-full ${
                  kpi.change.startsWith('+') 
                    ? 'text-green-600 bg-green-100' 
                    : kpi.change.startsWith('-')
                    ? 'text-red-600 bg-red-100'
                    : 'text-gray-600 bg-gray-100'
                }`}>
                  {kpi.change}
                </span>
              </div>
              <div>
                <h3 className="text-2xl font-bold text-gray-900 mb-1">
                  {kpi.value}
                </h3>
                <p className="text-gray-600 text-sm">{kpi.title}</p>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Quick Report Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Distribución por Estado</h3>
            <PieChart className="w-5 h-5 text-gray-400" />
          </div>
          
          {data.contract_status_distribution && (
            <div className="space-y-3">
              {Object.entries(data.contract_status_distribution).map(([status, count]: [string, any]) => (
                <div key={status} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 capitalize">
                    {status.replace('_', ' ')}
                  </span>
                  <div className="flex items-center space-x-2">
                    <div className="w-20 bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ 
                          width: `${((count / data.kpis.total_contracts) * 100)}%` 
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-900 w-8 text-right">{count}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Top Performers</h3>
            <TrendingUp className="w-5 h-5 text-gray-400" />
          </div>
          
          {data.top_performers && data.top_performers.length > 0 ? (
            <div className="space-y-3">
              {data.top_performers.slice(0, 5).map((performer: any, index: number) => (
                <div key={performer.user_id} className="flex items-center space-x-3">
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                    index === 0 ? 'bg-yellow-100 text-yellow-600' :
                    index === 1 ? 'bg-gray-100 text-gray-600' :
                    index === 2 ? 'bg-orange-100 text-orange-600' :
                    'bg-blue-100 text-blue-600'
                  }`}>
                    <span className="text-xs font-bold">#{index + 1}</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {performer.user_name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {performer.contracts_count} contratos
                    </p>
                  </div>
                  <span className="text-sm font-medium text-gray-600">
                    ${(performer.total_value || 0).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No hay datos de rendimiento disponibles</p>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Actividad Reciente</h3>
          <Activity className="w-5 h-5 text-gray-400" />
        </div>
        
        {data.recent_activity && data.recent_activity.length > 0 ? (
          <div className="space-y-3">
            {data.recent_activity.slice(0, 5).map((activity: any, index: number) => (
              <div key={index} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-center w-8 h-8 bg-blue-100 rounded-full">
                  <FileText className="w-4 h-4 text-blue-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {activity.title}
                  </p>
                  <p className="text-xs text-gray-500">
                    Cliente: {activity.client_name} • {new Date(activity.created_at).toLocaleDateString('es-ES')}
                  </p>
                </div>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  activity.approval_status === 'approved' ? 'text-green-600 bg-green-100' :
                  activity.approval_status === 'pending_approval' ? 'text-orange-600 bg-orange-100' :
                  activity.approval_status === 'rejected' ? 'text-red-600 bg-red-100' :
                  'text-gray-600 bg-gray-100'
                }`}>
                  {activity.approval_status.replace('_', ' ')}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No hay actividad reciente</p>
        )}
      </div>
    </div>
  );
};