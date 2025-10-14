import React, { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { RenewalRequestModal } from './RenewalRequestModal';
import type { Contract } from '../../types/contracts';

interface RenewalRequestButtonProps {
  contract: Contract;
  onSuccess?: () => void;
  size?: 'sm' | 'medium' | 'lg';
  preselectedContractId?: string;
}

export function RenewalRequestButton({ 
  contract, 
  onSuccess, 
  size = 'medium',
  preselectedContractId
}: RenewalRequestButtonProps) {
  const [showModal, setShowModal] = useState(false);
  const [renewalStatus, setRenewalStatus] = useState<{
    hasRenewal: boolean;
    status: string | null;
  }>({ hasRenewal: false, status: null });
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    checkRenewalStatus();
  }, [contract.id]);

  const checkRenewalStatus = async () => {
    try {
      const { data: renewal, error } = await supabase
        .from('contract_renewals')
        .select('status')
        .eq('original_contract_id', contract.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && renewal) {
        setRenewalStatus({
          hasRenewal: true,
          status: renewal.status
        });
      } else {
        setRenewalStatus({ hasRenewal: false, status: null });
      }
    } catch (error) {
      console.error('Error checking renewal status:', error);
    } finally {
      setLoading(false);
    }
  };

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    medium: 'px-3 py-1.5 text-sm',
    lg: 'px-4 py-2 text-base'
  };

  if (loading) {
    return (
      <div className={`${sizeClasses[size]} bg-gray-200 text-gray-500 rounded-lg flex items-center gap-2`}>
        <RotateCcw size={size === 'sm' ? 14 : size === 'medium' ? 16 : 18} className="animate-spin" />
        Verificando...
      </div>
    );
  }

  // Si ya hay una renovación, mostrar el estado
  if (renewalStatus.hasRenewal) {
    const getStatusText = () => {
      switch (renewalStatus.status) {
        case 'pending': return '⏳ Renovación Solicitada';
        case 'approved': return '✅ Renovación Aprobada';
        case 'rejected': return '❌ Renovación Rechazada';
        case 'cancelled': return '🚫 Renovación Cancelada';
        default: return '📋 En Proceso';
      }
    };

    const getStatusColor = () => {
      switch (renewalStatus.status) {
        case 'pending': return 'bg-blue-100 text-blue-700';
        case 'approved': return 'bg-green-100 text-green-700';
        case 'rejected': return 'bg-red-100 text-red-700';
        case 'cancelled': return 'bg-gray-100 text-gray-700';
        default: return 'bg-gray-100 text-gray-700';
      }
    };

    return (
      <div className={`${sizeClasses[size]} ${getStatusColor()} rounded-lg flex items-center gap-2 cursor-default`}>
        <RotateCcw size={size === 'sm' ? 14 : size === 'medium' ? 16 : 18} />
        {getStatusText()}
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className={`${sizeClasses[size]} bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center gap-2 transition-colors`}
        title="Solicitar renovación de contrato"
      >
        <RotateCcw size={size === 'sm' ? 14 : size === 'medium' ? 16 : 18} />
        Solicitar Renovación
      </button>

      {showModal && (
        <RenewalRequestModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          preselectedContractId={preselectedContractId}
          onSuccess={() => {
            setShowModal(false);
            checkRenewalStatus(); // Refresh status after successful request
            if (onSuccess) onSuccess();
          }}
        />
      )}
    </>
  );
}