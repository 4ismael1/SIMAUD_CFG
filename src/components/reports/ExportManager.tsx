import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Download, 
  FileText, 
  Users, 
  BarChart3,
  File,
  Table,
  FileSpreadsheet,
  Loader,
  CheckCircle,
  AlertTriangle,
  Calendar,
  Filter,
  Package
} from 'lucide-react';
import { LoadingSpinner } from '../common/LoadingSpinner';

interface ExportRequest {
  reportType: 'contracts' | 'users' | 'analytics';
  format: 'pdf' | 'excel' | 'csv' | 'json';
  filters?: any;
  template?: string;
}

export const ExportManager: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [exportHistory, setExportHistory] = useState<any[]>([]);
  
  const [exportConfig, setExportConfig] = useState<ExportRequest>({
    reportType: 'contracts',
    format: 'csv',
    filters: {}
  });

  const reportTypes = [
    { 
      value: 'contracts', 
      label: 'Contratos', 
      icon: FileText,
      description: 'Exportar datos completos de contratos',
      color: 'text-blue-600 bg-blue-100'
    },
    { 
      value: 'users', 
      label: 'Usuarios', 
      icon: Users,
      description: 'Exportar información de usuarios del sistema',
      color: 'text-green-600 bg-green-100'
    },
    { 
      value: 'analytics', 
      label: 'Analytics', 
      icon: BarChart3,
      description: 'Exportar métricas y análisis del sistema',
      color: 'text-purple-600 bg-purple-100'
    }
  ];

  const formatTypes = [
    { 
      value: 'csv', 
      label: 'CSV', 
      icon: Table,
      description: 'Archivo de valores separados por comas',
      extension: '.csv'
    },
    { 
      value: 'excel', 
      label: 'Excel', 
      icon: FileSpreadsheet,
      description: 'Hoja de cálculo de Microsoft Excel',
      extension: '.xls'
    },
    { 
      value: 'pdf', 
      label: 'PDF', 
      icon: File,
      description: 'Documento PDF formateado para impresión',
      extension: '.pdf'
    },
    { 
      value: 'json', 
      label: 'JSON', 
      icon: Package,
      description: 'Datos estructurados en formato JSON',
      extension: '.json'
    }
  ];

  const handleExport = async () => {
    setLoading(true);
    setError('');
    setSuccessMessage('');
    
    try {
      console.log('🚀 Starting export with config:', exportConfig);
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reports-export`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(exportConfig)
        }
      );

      if (!response.ok) {
        throw new Error('Error al exportar los datos');
      }

      // Handle different response types based on format
      if (exportConfig.format === 'pdf') {
        const result = await response.json();
        if (result.success && result.html) {
          // For PDF, we'll create a new window with the HTML content
          const newWindow = window.open('', '_blank');
          if (newWindow) {
            newWindow.document.write(result.html);
            newWindow.document.close();
            newWindow.print();
          }
          setSuccessMessage('Reporte PDF generado y abierto en nueva ventana');
        } else {
          throw new Error('Error al generar PDF');
        }
      } else if (exportConfig.format === 'json') {
        const result = await response.json();
        if (result.success) {
          // Download JSON file
          const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = result.filename;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
          setSuccessMessage('Archivo JSON descargado exitosamente');
        } else {
          throw new Error('Error al generar JSON');
        }
      } else {
        // Handle CSV/Excel downloads
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        const extension = formatTypes.find(f => f.value === exportConfig.format)?.extension || '.csv';
        a.download = `${exportConfig.reportType}-export-${new Date().toISOString().split('T')[0]}${extension}`;
        
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        setSuccessMessage(`Archivo ${exportConfig.format.toUpperCase()} descargado exitosamente`);
      }

      // Add to export history
      const exportRecord = {
        id: Date.now().toString(),
        reportType: exportConfig.reportType,
        format: exportConfig.format,
        timestamp: new Date().toISOString(),
        status: 'completed'
      };
      
      setExportHistory(prev => [exportRecord, ...prev.slice(0, 9)]); // Keep last 10

    } catch (error: any) {
      console.error('Error exporting data:', error);
      setError(error.message || 'Error al exportar los datos');
    } finally {
      setLoading(false);
    }
  };

  const clearMessages = () => {
    setError('');
    setSuccessMessage('');
  };

  return (
    <div className="space-y-6">
      {/* Export Configuration */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-6">Configurar Exportación</h3>
        
        {/* Report Type Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Tipo de Datos a Exportar
          </label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {reportTypes.map((type) => {
              const Icon = type.icon;
              const isSelected = exportConfig.reportType === type.value;
              return (
                <button
                  key={type.value}
                  onClick={() => {
                    setExportConfig(prev => ({ ...prev, reportType: type.value as any }));
                    clearMessages();
                  }}
                  className={`p-4 border rounded-lg transition-all duration-200 text-left ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center space-x-3 mb-2">
                    <div className={`p-2 rounded-lg ${isSelected ? type.color : 'bg-gray-100 text-gray-600'}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-900">{type.label}</h4>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600">{type.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Format Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Formato de Exportación
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {formatTypes.map((format) => {
              const Icon = format.icon;
              const isSelected = exportConfig.format === format.value;
              return (
                <button
                  key={format.value}
                  onClick={() => {
                    setExportConfig(prev => ({ ...prev, format: format.value as any }));
                    clearMessages();
                  }}
                  className={`p-4 border rounded-lg transition-all duration-200 text-left ${
                    isSelected
                      ? 'border-orange-500 bg-orange-50'
                      : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center space-x-3 mb-2">
                    <Icon className={`w-5 h-5 ${
                      isSelected ? 'text-orange-600' : 'text-gray-600'
                    }`} />
                    <div>
                      <h4 className="font-medium text-gray-900">{format.label}</h4>
                      <p className="text-xs text-gray-500">{format.extension}</p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600">{format.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Export Action */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          <div className="text-sm text-gray-600">
            <p>Se exportarán todos los datos de <strong>{exportConfig.reportType}</strong> en formato <strong>{exportConfig.format.toUpperCase()}</strong></p>
          </div>
          
          <button
            onClick={handleExport}
            disabled={loading}
            className="flex items-center space-x-2 px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors duration-200 disabled:opacity-50 font-medium"
          >
            {loading ? (
              <>
                <LoadingSpinner size="small" />
                <span>Exportando...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Exportar Datos</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3"
        >
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-red-800">Error de Exportación</h4>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
        </motion.div>
      )}

      {successMessage && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start space-x-3"
        >
          <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-green-800">Exportación Exitosa</h4>
            <p className="text-sm text-green-700 mt-1">{successMessage}</p>
          </div>
        </motion.div>
      )}

      {/* Export History */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Historial de Exportaciones</h3>
        
        {exportHistory.length === 0 ? (
          <div className="text-center py-8">
            <Download className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">No hay exportaciones recientes</p>
            <p className="text-sm text-gray-400 mt-1">
              Las exportaciones aparecerán aquí una vez que generes alguna
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {exportHistory.map((export_item, index) => {
              const formatInfo = formatTypes.find(f => f.value === export_item.format);
              const Icon = formatInfo?.icon || Download;
              
              return (
                <motion.div
                  key={export_item.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors duration-200"
                >
                  <div className="flex items-center space-x-3">
                    <div className="flex items-center justify-center w-10 h-10 bg-orange-100 rounded-full">
                      <Icon className="w-5 h-5 text-orange-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        Reporte de {export_item.reportType} ({export_item.format.toUpperCase()})
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(export_item.timestamp).toLocaleString('es-ES')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-green-600 bg-green-100">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Completado
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Export Templates Preview */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Formatos Disponibles</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Quick Export Examples */}
          <div>
            <h4 className="text-md font-semibold text-gray-900 mb-3">Exportación Rápida</h4>
            <div className="space-y-2">
              <button
                onClick={() => {
                  setExportConfig({ reportType: 'contracts', format: 'csv' });
                  setTimeout(handleExport, 100);
                }}
                disabled={loading}
                className="w-full flex items-center justify-between p-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-200"
              >
                <div className="flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-gray-900">Todos los Contratos (CSV)</span>
                </div>
                <Download className="w-4 h-4 text-gray-400" />
              </button>
              
              <button
                onClick={() => {
                  setExportConfig({ reportType: 'users', format: 'excel' });
                  setTimeout(handleExport, 100);
                }}
                disabled={loading}
                className="w-full flex items-center justify-between p-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-200"
              >
                <div className="flex items-center space-x-2">
                  <Users className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium text-gray-900">Todos los Usuarios (Excel)</span>
                </div>
                <Download className="w-4 h-4 text-gray-400" />
              </button>
              
              <button
                onClick={() => {
                  setExportConfig({ reportType: 'analytics', format: 'pdf' });
                  setTimeout(handleExport, 100);
                }}
                disabled={loading}
                className="w-full flex items-center justify-between p-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-200"
              >
                <div className="flex items-center space-x-2">
                  <BarChart3 className="w-4 h-4 text-purple-600" />
                  <span className="text-sm font-medium text-gray-900">Reporte Analytics (PDF)</span>
                </div>
                <Download className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          </div>

          {/* Format Information */}
          <div>
            <h4 className="text-md font-semibold text-gray-900 mb-3">Información de Formatos</h4>
            <div className="space-y-3">
              {formatTypes.map((format) => {
                const Icon = format.icon;
                return (
                  <div key={format.value} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                    <Icon className="w-5 h-5 text-gray-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{format.label}</p>
                      <p className="text-xs text-gray-600">{format.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Advanced Export Options */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Opciones Avanzadas</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-md font-semibold text-gray-900 mb-3">Filtros de Fecha</h4>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Desde</label>
                  <input
                    type="date"
                    value={exportConfig.filters?.startDate || ''}
                    onChange={(e) => setExportConfig(prev => ({
                      ...prev,
                      filters: { ...prev.filters, startDate: e.target.value }
                    }))}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Hasta</label>
                  <input
                    type="date"
                    value={exportConfig.filters?.endDate || ''}
                    onChange={(e) => setExportConfig(prev => ({
                      ...prev,
                      filters: { ...prev.filters, endDate: e.target.value }
                    }))}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                </div>
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-md font-semibold text-gray-900 mb-3">Próximamente</h4>
            <div className="space-y-2 text-sm text-gray-500">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                <span>Exportaciones programadas</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                <span>Templates PDF personalizables</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                <span>Envío automático por email</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                <span>Compresión de archivos grandes</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};