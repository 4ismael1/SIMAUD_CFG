import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  AlertTriangle, 
  Calendar, 
  RefreshCw, 
  Eye, 
  Clock,
  DollarSign,
  User,
  X
} from 'lucide-react';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

interface ExpiringContract {
  id: string;
  title: string;
  client_name: string;
  end_date: string;
  contract_value: number;
  auto_renewal: boolean;
  days_until_expiry: number;
  creator?: any;
}

interface ExpiryAlertsProps {
  onViewContract?: (contractId: string) => void;
  className?: string;
  maxItems?: number;
}

export const ExpiryAlerts: React.FC<ExpiryAlertsProps> = ({ 
  onViewContract, 
  className = '',
  maxItems = 5
}) => {
  const { user } = useAuth();
  const [expiringContracts, setExpiringContracts] = useState<ExpiringContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadExpiringContracts();
    
    // Auto-refresh every 5 minutes
    const interval = setInterval(loadExpiringContracts, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const loadExpiringContracts = async () => {
    if (!user) return;
    
    setLoading(true);
    setError('');

    try {
      // Calculate date 30 days from now
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      
      let query = supabase
        .from('contracts')
        .select(`
          id,
          title,
          client_name,
          end_date,
          contract_value,
          auto_renewal,
          created_by,
          user_profiles!contracts_created_by_fkey(
            id,
            name,
            email
          )
        `)
        .lte('end_date', thirtyDaysFromNow.toISOString().split('T')[0])
        .gte('end_date', new Date().toISOString().split('T')[0])
        .in('approval_status', ['approved', 'signed'])
        .in('actual_status', ['active'])
        .order('end_date', { ascending: true });

      // Filter based on user role - gestores see only their contracts
      if (user.role === 'gestor') {
        query = query.eq('created_by', user.id);
      }
      // Admin and supervisor see all contracts (handled by RLS)

      const { data, error: dbError } = await query;

      if (dbError) {
        throw new Error(dbError.message);
      }

      // Calculate days until expiry for each contract
      const contractsWithExpiry = (data || []).map(contract => {
        const endDate = new Date(contract.end_date);
        const today = new Date();
        const diffTime = endDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        return {
          ...contract,
          days_until_expiry: Math.max(0, diffDays),
          creator: contract.user_profiles
        };
      });

      setExpiringContracts(contractsWithExpiry);
    } catch (error: any) {
      console.error('Error loading expiring contracts:', error);
      setError(error.message || 'Error al cargar contratos próximos a vencer');
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = (contractId: string) => {
    setDismissed(prev => new Set(prev.add(contractId)));
  };

  const getUrgencyColor = (days: number) => {
    if (days <= 1) return 'from-red-500 to-red-600';
    if (days <= 5) return 'from-orange-500 to-orange-600';
    if (days <= 10) return 'from-yellow-500 to-yellow-600';
    return 'from-blue-500 to-blue-600';
  };

  const getUrgencyBorder = (days: number) => {
    if (days <= 1) return 'border-red-200 bg-red-50';
    if (days <= 5) return 'border-orange-200 bg-orange-50';
    if (days <= 10) return 'border-yellow-200 bg-yellow-50';
    return 'border-blue-200 bg-blue-50';
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'USD' }).format(value);
  };

  const visibleContracts = expiringContracts
    .filter(contract => !dismissed.has(contract.id))
    .sort((a, b) => a.days_until_expiry - b.days_until_expiry)
    .slice(0, maxItems);

  if (loading) {
    return (
      <div className={`bg-white rounded-xl shadow-sm border border-gray-100 p-4 ${className}`}>
        <div className="flex items-center justify-center">
          <LoadingSpinner size="small" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`bg-red-50 border border-red-200 rounded-xl p-4 ${className}`}>
        <div className="flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          <p className="text-sm text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  if (visibleContracts.length === 0) {
    return null; // Don't show anything if no expiring contracts
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {visibleContracts.map((contract) => (
        <motion.div
          key={contract.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`rounded-lg border p-4 ${getUrgencyBorder(contract.days_until_expiry)}`}
        >
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-start space-x-3">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-r ${getUrgencyColor(contract.days_until_expiry)}`}>
                <AlertTriangle className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-gray-900 mb-1">
                  {contract.title}
                </h4>
                <p className="text-xs text-gray-600 mb-2">
                  Cliente: {contract.client_name}
                </p>
                <div className="flex items-center space-x-4 text-xs text-gray-500">
                  <div className="flex items-center space-x-1">
                    <Calendar className="w-3 h-3" />
                    <span>Vence: {new Date(contract.end_date).toLocaleDateString('es-ES')}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <DollarSign className="w-3 h-3" />
                    <span>{formatCurrency(contract.contract_value)}</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-bold text-white bg-gradient-to-r ${getUrgencyColor(contract.days_until_expiry)}`}>
                {contract.days_until_expiry} día{contract.days_until_expiry !== 1 ? 's' : ''}
              </span>
              <button
                onClick={() => handleDismiss(contract.id)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>

          {contract.auto_renewal && (
            <div className="bg-purple-100 border border-purple-200 rounded-md p-2 mb-3">
              <div className="flex items-center space-x-2">
                <RefreshCw className="w-3 h-3 text-purple-600" />
                <span className="text-xs font-medium text-purple-800">
                  Renovación automática activada
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-500">
              {contract.auto_renewal 
                ? 'Se renovará automáticamente'
                : 'Requiere acción manual'
              }
            </div>
            
            <div className="flex space-x-2">
              {onViewContract && (
                <button
                  onClick={() => onViewContract(contract.id)}
                  className="flex items-center space-x-1 px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors duration-200"
                >
                  <Eye className="w-3 h-3" />
                  <span>Ver</span>
                </button>
              )}
              {!contract.auto_renewal && (
                <button
                  className="flex items-center space-x-1 px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors duration-200"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Renovar</span>
                </button>
              )}
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
};