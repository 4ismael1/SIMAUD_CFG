import { useEffect, useState } from 'react';
import { Button, Dialog, Field, Select, Textarea } from '../../../ui';
import { contractStatus } from '../../../lib/api/status';
import type { CancellationReason, ContractStatus } from '../../../lib/api/types';

export const CANCELLATION_REASONS: Record<CancellationReason, string> = {
  mutual_agreement: 'Mutuo acuerdo',
  client_request: 'Solicitud de la otra parte',
  breach: 'Incumplimiento',
  payment_default: 'Falta de pago',
  other: 'Otro motivo',
};

interface CancelDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (input: { reason: CancellationReason; description: string }) => void;
  loading: boolean;
}

export function CancelContractDialog({ open, onClose, onConfirm, loading }: CancelDialogProps) {
  const [reason, setReason] = useState<CancellationReason>('mutual_agreement');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (open) {
      setReason('mutual_agreement');
      setDescription('');
    }
  }, [open]);

  const valid = description.trim().length >= 5;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title="Cancelar contrato"
      description="El contrato dejará de estar vigente. Se avisará al gestor y a los firmantes."
      footer={
        <>
          <Button onClick={onClose} disabled={loading}>Volver</Button>
          <Button
            className="border-red-600 bg-red-600 text-white hover:bg-red-700"
            loading={loading}
            disabled={!valid}
            onClick={() => onConfirm({ reason, description: description.trim() })}
          >
            Cancelar contrato
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Motivo">
          <Select value={reason} onChange={(event) => setReason(event.target.value as CancellationReason)}>
            {Object.entries(CANCELLATION_REASONS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Explicación" hint="Queda registrada en la auditoría del contrato.">
          <Textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} />
        </Field>
      </div>
    </Dialog>
  );
}

/**
 * States an admin can force from each state: the same transitions the API accepts (state-machine.ts),
 * so the dialog never offers a change that will be refused. A cancelled contract uses «Reactivar».
 */
const OVERRIDE_TRANSITIONS: Partial<Record<ContractStatus, ContractStatus[]>> = {
  draft: ['pending_approval'],
  rejected: ['draft', 'pending_approval'],
  pending_approval: ['pending_signatures', 'rejected'],
  pending_signatures: ['active', 'rejected', 'cancelled'],
  active: ['expiring_soon', 'cancelled'],
  expiring_soon: ['expired', 'cancelled'],
};

/** Valid targets for «Forzar estado»; empty means the option should not be shown. */
export function overrideTargets(current: ContractStatus, isAmendment = false): ContractStatus[] {
  const targets = OVERRIDE_TRANSITIONS[current] ?? [];
  // An amendment only becomes active through its signatures (the API refuses it too).
  return isAmendment ? targets.filter((status) => status !== 'active') : targets;
}

interface OverrideDialogProps {
  open: boolean;
  current: ContractStatus;
  isAmendment?: boolean;
  onClose: () => void;
  onConfirm: (input: { status: ContractStatus; reason: string }) => void;
  loading: boolean;
}

/** Admin-only escape hatch. The API only accepts valid transitions and audits every use. */
export function OverrideStatusDialog({ open, current, isAmendment, onClose, onConfirm, loading }: OverrideDialogProps) {
  const options = overrideTargets(current, isAmendment);
  const [status, setStatus] = useState<ContractStatus>(options[0]);
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) {
      setStatus(options[0]);
      setReason('');
    }
    // Reset only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title="Forzar estado"
      description={`Estado actual: ${contractStatus[current].label}. Úsalo solo para corregir errores; quedará registrado.`}
      footer={
        <>
          <Button onClick={onClose} disabled={loading}>Volver</Button>
          <Button variant="dark" loading={loading} disabled={reason.trim().length < 5} onClick={() => onConfirm({ status, reason: reason.trim() })}>
            Cambiar estado
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Nuevo estado">
          <Select value={status} onChange={(event) => setStatus(event.target.value as ContractStatus)}>
            {options.map((option) => (
              <option key={option} value={option}>{contractStatus[option].label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Motivo" hint="Obligatorio. Explica por qué es necesario el cambio.">
          <Textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} />
        </Field>
      </div>
    </Dialog>
  );
}
