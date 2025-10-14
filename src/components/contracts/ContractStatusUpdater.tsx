import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, CheckCircle, AlertTriangle, Clock, Zap } from 'lucide-react';

interface ContractStatusUpdaterProps {
  onStatusUpdate?: (result: any) => void;
  className?: string;
}

export const ContractStatusUpdater: React.FC<ContractStatusUpdaterProps> = ({ 
  onStatusUpdate, 
  className = '' 
}) => {
  const [updating, setUpdating] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [result, setResult] = useState<any>(null);
  const [forceUpdating, setForceUpdating] = useState(false);

  // Auto-update every 5 minutes
  useEffect(() => {
    const interval = setInterval(updateContractStatuses, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const updateContractStatuses = async () => {
    setUpdating(true);
    
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/contract-lifecycle?action=update_statuses`,
        {
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error('Error al actualizar estados de contratos');
      }

      const data = await response.json();
      setResult(data);
      setLastUpdate(new Date());
      
      if (onStatusUpdate) {
        onStatusUpdate(data);
      }

    } catch (error: any) {
      console.error('Error updating contract statuses:', error);
    } finally {
      setUpdating(false);
    }
  };

  const forceUpdateAllContracts = async () => {
    setForceUpdating(true);
    
    try {
      console.log('🔄 Force updating all contract statuses...');
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/contract-lifecycle?action=update_statuses&force=true`,
        {
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error('Error al forzar actualización de estados');
      }

      const data = await response.json();
      setResult(data);
      setLastUpdate(new Date());
      
      if (onStatusUpdate) {
        onStatusUpdate(data);
      }

      // Also trigger a regular update to refresh UI
      setTimeout(() => {
        updateContractStatuses();
      }, 1000);

    } catch (error: any) {
      console.error('Error force updating contract statuses:', error);
    } finally {
      setForceUpdating(false);
    }
  };

  return (
    <div className={`bg-blue-50 border border-blue-200 rounded-lg p-4 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className={`flex items-center justify-center w-6 h-6 rounded-full ${
            updating ? 'bg-blue-200' : 'bg-blue-100'
          }`}>
            <RefreshCw className={`w-4 h-4 text-blue-600 ${updating ? 'animate-spin' : ''}`} />
          </div>
          <div>
            <p className="text-sm font-medium text-blue-900">Estados Automáticos</p>
            <p className="text-xs text-blue-700">
              {lastUpdate 
                ? `Última actualización: ${lastUpdate.toLocaleTimeString('es-ES')}`
                : 'Actualizando estados por fechas...'
              }
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={forceUpdateAllContracts}
            disabled={forceUpdating || updating}
            className="flex items-center space-x-1 text-xs bg-orange-100 text-orange-700 px-3 py-1.5 rounded-lg hover:bg-orange-200 transition-colors duration-200 disabled:opacity-50 font-medium"
            title="Actualizar TODOS los contratos existentes basándose en fechas"
          >
            <Zap className="w-3 h-3" />
            <span>{forceUpdating ? 'Forzando...' : 'Forzar Todo'}</span>
          </button>
          <button
            onClick={updateContractStatuses}
            disabled={updating || forceUpdating}
            className="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-200 transition-colors duration-200 disabled:opacity-50 font-medium"
          >
            {updating ? 'Actualizando...' : 'Actualizar'}
          </button>
        </div>
      </div>
      
      {result && (
        <div className="mt-3 pt-3 border-t border-blue-200">
          <div className="flex items-center justify-between text-xs text-blue-700 mb-2">
            <span className="font-medium">Estados actualizados:</span>
            <span className="text-blue-600">{result.updated_at ? new Date(result.updated_at).toLocaleTimeString('es-ES') : ''}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {result.updated_counts && Object.entries(result.updated_counts).map(([status, count]: [string, any]) => (
              <span key={status} className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium">
                {status}: {count}
              </span>
            ))}
          </div>
          {result.message && (
            <div className="mt-2">
              <p className="text-xs text-blue-700 bg-blue-100 px-2 py-1 rounded">
                {result.message}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};