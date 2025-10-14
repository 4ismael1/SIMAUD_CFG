import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Settings, 
  RefreshCw, 
  Database, 
  Bell, 
  Calendar,
  Clock,
  Zap,
  AlertTriangle,
  CheckCircle,
  Info,
  Server,
  Shield,
  Activity
} from 'lucide-react';
import { LoadingSpinner } from '../../common/LoadingSpinner';
import { ContractStatusUpdater } from '../../contracts/ContractStatusUpdater';

export const SystemConfiguration: React.FC = () => {
  const [systemStats, setSystemStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  useEffect(() => {
    loadSystemStats();
  }, []);

  const loadSystemStats = async () => {
    setLoading(true);
    try {
      // Load basic system stats
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reports-analytics?type=overview`,
        {
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        setSystemStats(data);
      }
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Error loading system stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const configurationSections = [
    {
      id: 'automation',
      title: 'Automatización del Sistema',
      description: 'Configuraciones para procesos automáticos',
      icon: Zap,
      color: 'from-blue-500 to-blue-600'
    },
    {
      id: 'notifications',
      title: 'Sistema de Notificaciones',
      description: 'Configurar alertas y recordatorios',
      icon: Bell,
      color: 'from-green-500 to-green-600'
    },
    {
      id: 'database',
      title: 'Mantenimiento de Base de Datos',
      description: 'Limpieza y optimización de datos',
      icon: Database,
      color: 'from-purple-500 to-purple-600'
    },
    {
      id: 'security',
      title: 'Configuración de Seguridad',
      description: 'Permisos y políticas de acceso',
      icon: Shield,
      color: 'from-red-500 to-red-600'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Configuración del Sistema</h1>
          <p className="text-gray-600 mt-1">
            Administra configuraciones avanzadas y procesos automáticos
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <span className="text-sm text-gray-500">
            Actualizado: {lastRefresh.toLocaleTimeString('es-ES')}
          </span>
          <button
            onClick={loadSystemStats}
            disabled={loading}
            className="flex items-center space-x-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* System Status Overview */}
      {systemStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 rounded-lg bg-gradient-to-r from-blue-500 to-blue-600">
                <Database className="w-6 h-6 text-white" />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-1">
              {systemStats.system_health?.total_entities?.contracts || 0}
            </h3>
            <p className="text-gray-600 text-sm">Total Contratos</p>
            <p className="text-gray-500 text-xs mt-1">En el sistema</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 rounded-lg bg-gradient-to-r from-green-500 to-green-600">
                <Activity className="w-6 h-6 text-white" />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-1">
              {systemStats.system_health?.active_entities?.active_contracts || 0}
            </h3>
            <p className="text-gray-600 text-sm">Contratos Activos</p>
            <p className="text-gray-500 text-xs mt-1">En vigencia</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 rounded-lg bg-gradient-to-r from-orange-500 to-orange-600">
                <Bell className="w-6 h-6 text-white" />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-1">
              {systemStats.system_health?.active_entities?.pending_approvals || 0}
            </h3>
            <p className="text-gray-600 text-sm">Aprobaciones Pendientes</p>
            <p className="text-gray-500 text-xs mt-1">Requieren revisión</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 rounded-lg bg-gradient-to-r from-purple-500 to-purple-600">
                <Server className="w-6 h-6 text-white" />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-1">
              {systemStats.system_health?.system_utilization?.efficiency_score?.toFixed(1) || 0}%
            </h3>
            <p className="text-gray-600 text-sm">Eficiencia Sistema</p>
            <p className="text-gray-500 text-xs mt-1">Rendimiento general</p>
          </div>
        </div>
      )}

      {/* Configuration Sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {configurationSections.map((section) => {
          const Icon = section.icon;
          return (
            <div key={section.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className={`p-3 rounded-lg bg-gradient-to-r ${section.color}`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{section.title}</h3>
                  <p className="text-sm text-gray-600">{section.description}</p>
                </div>
              </div>
              
              {section.id === 'automation' ? (
                <AutomationConfig onUpdate={() => setLastRefresh(new Date())} />
              ) : section.id === 'notifications' ? (
                <NotificationConfig />
              ) : section.id === 'database' ? (
                <DatabaseConfig />
              ) : (
                <SecurityConfig />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Automation Configuration Component
const AutomationConfig: React.FC<{ onUpdate: () => void }> = ({ onUpdate }) => {
  return (
    <div className="space-y-4">
      <div className="border border-blue-200 rounded-lg p-4 bg-blue-50">
        <h4 className="text-sm font-semibold text-blue-900 mb-3">Estados Automáticos de Contratos</h4>
        <p className="text-sm text-blue-700 mb-4">
          Actualiza automáticamente el estado de los contratos basándose en fechas de vencimiento
        </p>
        <ContractStatusUpdater 
          onStatusUpdate={(result) => {
            console.log('Contract statuses updated:', result);
            onUpdate();
          }}
          className="border border-blue-300"
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center space-x-2">
            <Clock className="w-4 h-4 text-gray-600" />
            <span className="text-sm font-medium text-gray-900">Auto-renovaciones</span>
          </div>
          <span className="text-sm text-green-600">✓ Activo</span>
        </div>
        
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center space-x-2">
            <Bell className="w-4 h-4 text-gray-600" />
            <span className="text-sm font-medium text-gray-900">Notificaciones de vencimiento</span>
          </div>
          <span className="text-sm text-green-600">✓ Activo</span>
        </div>
        
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center space-x-2">
            <Calendar className="w-4 h-4 text-gray-600" />
            <span className="text-sm font-medium text-gray-900">Actualización diaria de estados</span>
          </div>
          <span className="text-sm text-green-600">✓ Activo</span>
        </div>
      </div>
    </div>
  );
};

// Notification Configuration Component
const NotificationConfig: React.FC = () => {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
        <div className="flex items-center space-x-2">
          <Bell className="w-4 h-4 text-gray-600" />
          <span className="text-sm font-medium text-gray-900">Alertas de vencimiento</span>
        </div>
        <span className="text-sm text-green-600">30, 15, 10, 5, 1 días</span>
      </div>
      
      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
        <div className="flex items-center space-x-2">
          <RefreshCw className="w-4 h-4 text-gray-600" />
          <span className="text-sm font-medium text-gray-900">Notificaciones de renovación</span>
        </div>
        <span className="text-sm text-green-600">✓ Activo</span>
      </div>
      
      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
        <div className="flex items-center space-x-2">
          <CheckCircle className="w-4 h-4 text-gray-600" />
          <span className="text-sm font-medium text-gray-900">Confirmaciones de firma</span>
        </div>
        <span className="text-sm text-green-600">✓ Activo</span>
      </div>
    </div>
  );
};

// Database Configuration Component
const DatabaseConfig: React.FC = () => {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
        <div className="flex items-center space-x-2">
          <Database className="w-4 h-4 text-gray-600" />
          <span className="text-sm font-medium text-gray-900">Limpieza automática</span>
        </div>
        <span className="text-sm text-green-600">✓ Activo</span>
      </div>
      
      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
        <div className="flex items-center space-x-2">
          <RefreshCw className="w-4 h-4 text-gray-600" />
          <span className="text-sm font-medium text-gray-900">Respaldos diarios</span>
        </div>
        <span className="text-sm text-green-600">✓ Activo</span>
      </div>
      
      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
        <div className="flex items-center space-x-2">
          <Activity className="w-4 h-4 text-gray-600" />
          <span className="text-sm font-medium text-gray-900">Optimización semanal</span>
        </div>
        <span className="text-sm text-green-600">✓ Activo</span>
      </div>
    </div>
  );
};

// Security Configuration Component
const SecurityConfig: React.FC = () => {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
        <div className="flex items-center space-x-2">
          <Shield className="w-4 h-4 text-gray-600" />
          <span className="text-sm font-medium text-gray-900">RLS Policies</span>
        </div>
        <span className="text-sm text-green-600">✓ Activo</span>
      </div>
      
      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
        <div className="flex items-center space-x-2">
          <Clock className="w-4 h-4 text-gray-600" />
          <span className="text-sm font-medium text-gray-900">Sesiones de usuario</span>
        </div>
        <span className="text-sm text-green-600">24h timeout</span>
      </div>
      
      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
        <div className="flex items-center space-x-2">
          <Activity className="w-4 h-4 text-gray-600" />
          <span className="text-sm font-medium text-gray-900">Auditoría completa</span>
        </div>
        <span className="text-sm text-green-600">✓ Activo</span>
      </div>
    </div>
  );
};