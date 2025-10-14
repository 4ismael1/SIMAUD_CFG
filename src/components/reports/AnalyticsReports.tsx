import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  TrendingUp, 
  Activity, 
  Target, 
  Clock,
  BarChart3,
  PieChart,
  RefreshCw,
  Download,
  Calendar,
  AlertTriangle,
  CheckCircle,
  Users,
  FileText
} from 'lucide-react';
import { LoadingSpinner } from '../common/LoadingSpinner';

interface AnalyticsFilters {
  type: 'dashboard' | 'trends' | 'performance' | 'overview';
  period: 'week' | 'month' | 'quarter' | 'year';
  startDate?: string;
  endDate?: string;
}

export const AnalyticsReports: React.FC = () => {
  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<AnalyticsFilters>({
    type: 'dashboard',
    period: 'month'
  });

  useEffect(() => {
    generateReport();
  }, []);

  const generateReport = async () => {
    setLoading(true);
    setError('');
    
    try {
      const params = new URLSearchParams({
        type: filters.type,
        period: filters.period
      });

      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reports-analytics?${params}`,
        {
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error('Error al generar el reporte de analytics');
      }

      const data = await response.json();
      setReportData(data);
    } catch (error: any) {
      console.error('Error generating analytics report:', error);
      setError(error.message || 'Error al generar el reporte');
    } finally {
      setLoading(false);
    }
  };

  const reportTypes = [
    { value: 'dashboard', label: 'Dashboard KPIs', icon: BarChart3 },
    { value: 'trends', label: 'Tendencias', icon: TrendingUp },
    { value: 'performance', label: 'Rendimiento', icon: Target },
    { value: 'overview', label: 'Overview Sistema', icon: Activity }
  ];

  return (
    <div className="space-y-6">
      {/* Filters Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Configurar Analytics</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Report Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tipo de Analytics
            </label>
            <select
              value={filters.type}
              onChange={(e) => setFilters(prev => ({ ...prev, type: e.target.value as any }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            >
              {reportTypes.map(type => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>

          {/* Period */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Período de Análisis
            </label>
            <select
              value={filters.period}
              onChange={(e) => setFilters(prev => ({ ...prev, period: e.target.value as any }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            >
              <option value="week">Semanal</option>
              <option value="month">Mensual</option>
              <option value="quarter">Trimestral</option>
              <option value="year">Anual</option>
            </select>
          </div>

          {/* Custom Date Range (for trends/performance) */}
          {(filters.type === 'trends' || filters.type === 'performance') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Rango Personalizado
              </label>
              <div className="flex space-x-2">
                <input
                  type="date"
                  value={filters.startDate || ''}
                  onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
                  className="flex-1 px-2 py-2 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
                <input
                  type="date"
                  value={filters.endDate || ''}
                  onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
                  className="flex-1 px-2 py-2 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200">
          <button
            onClick={generateReport}
            disabled={loading}
            className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors duration-200 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Analizando...' : 'Generar Analytics'}</span>
          </button>
        </div>
      </div>

      {/* Report Results */}
      {loading ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 flex items-center justify-center">
          <div className="text-center">
            <LoadingSpinner size="large" />
            <p className="text-gray-600 mt-4">Generando analytics...</p>
          </div>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <div>
              <h3 className="text-sm font-semibold text-red-800">Error al generar analytics</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      ) : reportData ? (
        <AnalyticsResults data={reportData} filters={filters} />
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <TrendingUp className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">Haz clic en "Generar Analytics" para ver los resultados</p>
        </div>
      )}
    </div>
  );
};

// Component for displaying analytics results
const AnalyticsResults: React.FC<{ data: any; filters: AnalyticsFilters }> = ({ data, filters }) => {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES');
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'USD' }).format(value);
  };

  return (
    <div className="space-y-6">
      {/* Dashboard KPIs */}
      {filters.type === 'dashboard' && data.kpis && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Indicadores Clave (KPIs)</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <FileText className="w-5 h-5 text-blue-600" />
                <span className="text-sm font-medium text-gray-900">Total Contratos</span>
              </div>
              <p className="text-2xl font-bold text-blue-600">{data.kpis.total_contracts}</p>
              <p className="text-xs text-gray-500 mt-1">En el período</p>
            </div>
            
            <div className="bg-green-50 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Users className="w-5 h-5 text-green-600" />
                <span className="text-sm font-medium text-gray-900">Total Usuarios</span>
              </div>
              <p className="text-2xl font-bold text-green-600">{data.kpis.total_users}</p>
              <p className="text-xs text-gray-500 mt-1">Registrados</p>
            </div>
            
            <div className="bg-purple-50 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Target className="w-5 h-5 text-purple-600" />
                <span className="text-sm font-medium text-gray-900">Tasa Aprobación</span>
              </div>
              <p className="text-2xl font-bold text-purple-600">{data.kpis.approval_rate?.toFixed(1) || 0}%</p>
              <p className="text-xs text-gray-500 mt-1">Contratos aprobados</p>
            </div>
            
            <div className="bg-orange-50 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Clock className="w-5 h-5 text-orange-600" />
                <span className="text-sm font-medium text-gray-900">Aprobaciones Pendientes</span>
              </div>
              <p className="text-2xl font-bold text-orange-600">{data.kpis.pending_approvals}</p>
              <p className="text-xs text-gray-500 mt-1">En cola</p>
            </div>
          </div>

          {/* Contract Status Distribution */}
          {data.contract_status_distribution && (
            <div className="mt-8">
              <h4 className="text-md font-semibold text-gray-900 mb-4">Distribución por Estado</h4>
              <div className="space-y-3">
                {Object.entries(data.contract_status_distribution).map(([status, count]: [string, any]) => (
                  <div key={status} className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 capitalize">
                      {status.replace('_', ' ')}
                    </span>
                    <div className="flex items-center space-x-3">
                      <div className="w-32 bg-gray-200 rounded-full h-2">
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
            </div>
          )}
        </div>
      )}

      {/* Performance Metrics */}
      {filters.type === 'performance' && data.metrics && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Métricas de Rendimiento</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Clock className="w-5 h-5 text-blue-600" />
                <span className="text-sm font-medium text-gray-900">Tiempo Promedio Aprobación</span>
              </div>
              <p className="text-2xl font-bold text-blue-600">{data.metrics.average_approval_time?.toFixed(1) || 0}</p>
              <p className="text-xs text-gray-500 mt-1">días</p>
            </div>
            
            <div className="bg-green-50 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="text-sm font-medium text-gray-900">Tasa Completación</span>
              </div>
              <p className="text-2xl font-bold text-green-600">{data.metrics.contract_completion_rate?.toFixed(1) || 0}%</p>
              <p className="text-xs text-gray-500 mt-1">contratos completados</p>
            </div>
            
            <div className="bg-purple-50 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Target className="w-5 h-5 text-purple-600" />
                <span className="text-sm font-medium text-gray-900">Eficiencia Sistema</span>
              </div>
              <p className="text-2xl font-bold text-purple-600">{data.metrics.system_efficiency?.toFixed(1) || 0}%</p>
              <p className="text-xs text-gray-500 mt-1">procesados vs creados</p>
            </div>
          </div>

          {/* Bottlenecks Analysis */}
          {data.metrics.bottlenecks && (
            <div className="mt-8">
              <h4 className="text-md font-semibold text-gray-900 mb-4">Análisis de Cuellos de Botella</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-orange-600" />
                    <span className="text-sm font-medium text-gray-900">Aprobaciones Pendientes</span>
                  </div>
                  <p className="text-lg font-bold text-orange-600">{data.metrics.bottlenecks.pending_approvals}</p>
                </div>
                
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <FileText className="w-4 h-4 text-gray-600" />
                    <span className="text-sm font-medium text-gray-900">Borradores</span>
                  </div>
                  <p className="text-lg font-bold text-gray-600">{data.metrics.bottlenecks.draft_contracts}</p>
                </div>
                
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                    <span className="text-sm font-medium text-gray-900">Rechazados</span>
                  </div>
                  <p className="text-lg font-bold text-red-600">{data.metrics.bottlenecks.rejected_contracts}</p>
                </div>
              </div>
              
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-700">
                  <strong>Principal cuello de botella:</strong> {' '}
                  {data.metrics.bottlenecks.main_bottleneck === 'approvals' 
                    ? 'Proceso de aprobaciones - considera optimizar el flujo de revisión'
                    : 'Creación de contratos - considera capacitación para gestores'
                  }
                </p>
              </div>
            </div>
          )}

          {/* Peak Hours */}
          {data.metrics.peak_hours && (
            <div className="mt-8">
              <h4 className="text-md font-semibold text-gray-900 mb-4">Análisis de Horarios Pico</h4>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Hora de mayor actividad</p>
                    <p className="text-2xl font-bold text-blue-600">
                      {data.metrics.peak_hours.peak_hour}:00 - {data.metrics.peak_hours.peak_hour + 1}:00
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">Contratos creados</p>
                    <p className="text-lg font-bold text-blue-600">{data.metrics.peak_hours.peak_count}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Trends Analysis */}
      {filters.type === 'trends' && data.contract_creation_trends && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Análisis de Tendencias</h3>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Creation Trends */}
            <div>
              <h4 className="text-md font-semibold text-gray-900 mb-4">Tendencias de Creación</h4>
              <div className="space-y-3">
                {Object.entries(data.contract_creation_trends).map(([period, count]: [string, any]) => (
                  <div key={period} className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">{period}</span>
                    <div className="flex items-center space-x-2">
                      <div className="w-20 bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full"
                          style={{ width: `${(count / Math.max(...Object.values(data.contract_creation_trends))) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-gray-900 w-8 text-right">{count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Value Trends */}
            {data.contract_value_trends && (
              <div>
                <h4 className="text-md font-semibold text-gray-900 mb-4">Tendencias de Valor</h4>
                <div className="space-y-3">
                  {Object.entries(data.contract_value_trends).map(([period, values]: [string, any]) => (
                    <div key={period} className="bg-gray-50 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-900">{period}</span>
                        <span className="text-sm text-gray-600">{values.count} contratos</span>
                      </div>
                      <p className="text-lg font-bold text-green-600">
                        {formatCurrency(values.total_value)}
                      </p>
                      <p className="text-xs text-gray-500">
                        Promedio: {formatCurrency(values.total_value / values.count)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Growth Rate */}
          {data.growth_rate !== undefined && (
            <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border">
              <div className="flex items-center space-x-3">
                <TrendingUp className="w-6 h-6 text-blue-600" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Tasa de Crecimiento</p>
                  <p className={`text-2xl font-bold ${
                    data.growth_rate >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {data.growth_rate >= 0 ? '+' : ''}{data.growth_rate.toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* System Overview */}
      {filters.type === 'overview' && data.system_health && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Salud del Sistema</h3>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Total Entities */}
            <div>
              <h4 className="text-md font-semibold text-gray-900 mb-4">Entidades Totales</h4>
              <div className="space-y-3">
                {Object.entries(data.system_health.total_entities).map(([entity, count]: [string, any]) => (
                  <div key={entity} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm font-medium text-gray-900 capitalize">
                      {entity.replace('_', ' ')}
                    </span>
                    <span className="text-lg font-bold text-blue-600">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Active Entities */}
            <div>
              <h4 className="text-md font-semibold text-gray-900 mb-4">Entidades Activas</h4>
              <div className="space-y-3">
                {Object.entries(data.system_health.active_entities).map(([entity, count]: [string, any]) => (
                  <div key={entity} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                    <span className="text-sm font-medium text-gray-900 capitalize">
                      {entity.replace('_', ' ')}
                    </span>
                    <span className="text-lg font-bold text-green-600">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* System Utilization */}
          {data.system_health.system_utilization && (
            <div className="mt-8">
              <h4 className="text-md font-semibold text-gray-900 mb-4">Utilización del Sistema</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-900">Utilización de Plantillas</span>
                    <span className="text-lg font-bold text-blue-600">
                      {data.system_health.system_utilization.template_utilization?.toFixed(1) || 0}%
                    </span>
                  </div>
                  <div className="w-full bg-blue-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full"
                      style={{ width: `${data.system_health.system_utilization.template_utilization || 0}%` }}
                    />
                  </div>
                </div>

                <div className="bg-green-50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-900">Engagement de Usuarios</span>
                    <span className="text-lg font-bold text-green-600">
                      {data.system_health.system_utilization.user_engagement?.toFixed(1) || 0}%
                    </span>
                  </div>
                  <div className="w-full bg-green-200 rounded-full h-2">
                    <div 
                      className="bg-green-600 h-2 rounded-full"
                      style={{ width: `${data.system_health.system_utilization.user_engagement || 0}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};