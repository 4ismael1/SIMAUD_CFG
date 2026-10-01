import React, { useCallback, useEffect, useState } from 'react';
import { Ban, CheckCircle, ClipboardList, Clock, RotateCcw, XCircle } from 'lucide-react';
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

  const checkRenewalStatus = useCallback(async () => {
    setLoading(true);
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
  }, [contract.id]);

  useEffect(() => {
    void checkRenewalStatus();
  }, [checkRenewalStatus]);

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
    const statusPresentation = {
      pending: { label: 'Renovación Solicitada', icon: Clock, color: 'bg-blue-100 text-blue-700' },
      approved: { label: 'Renovación Aprobada', icon: CheckCircle, color: 'bg-green-100 text-green-700' },
      rejected: { label: 'Renovación Rechazada', icon: XCircle, color: 'bg-red-100 text-red-700' },
      cancelled: { label: 'Renovación Cancelada', icon: Ban, color: 'bg-gray-100 text-gray-700' },
    };
    const status = renewalStatus.status && renewalStatus.status in statusPresentation
      ? statusPresentation[renewalStatus.status as keyof typeof statusPresentation]
      : { label: 'En Proceso', icon: ClipboardList, color: 'bg-gray-100 text-gray-700' };
    const StatusIcon = status.icon;

    return (
      <div className={`${sizeClasses[size]} ${status.color} rounded-lg flex items-center gap-2 cursor-default`}>
        <StatusIcon size={size === 'sm' ? 14 : size === 'medium' ? 16 : 18} aria-hidden="true" />
        {status.label}
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
