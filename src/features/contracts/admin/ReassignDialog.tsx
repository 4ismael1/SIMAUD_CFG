import { useEffect, useState } from 'react';
import { Alert, Button, Dialog, Field, Select, Textarea } from '../../../ui';
import { useUsers } from '../../../lib/api/hooks/users';
import type { Contract } from '../../../lib/api/types';

const MIN_REASON_LENGTH = 5;
const MANAGER_PAGE_SIZE = 100;

interface ReassignDialogProps {
  contract: Contract | null;
  onClose: () => void;
  onConfirm: (input: { managerId: string; reason: string }) => void;
  loading: boolean;
}

/** Admin only: hand a contract over to another manager. The reason is kept in the audit trail. */
export function ReassignDialog({ contract, onClose, onConfirm, loading }: ReassignDialogProps) {
  // Only while the dialog is open (it is mounted for every list, also for non-admins who never open it).
  const managers = useUsers({ role: 'gestor', pageSize: MANAGER_PAGE_SIZE }, { enabled: contract !== null });
  const [managerId, setManagerId] = useState('');
  const [reason, setReason] = useState('');
  const candidates = (managers.data?.data ?? []).filter((manager) => manager.id !== contract?.createdBy);
  const valid = Boolean(managerId) && reason.trim().length >= MIN_REASON_LENGTH;

  useEffect(() => {
    if (contract) {
      setManagerId('');
      setReason('');
    }
  }, [contract]);

  return (
    <Dialog
      open={contract !== null}
      onClose={onClose}
      size="sm"
      title="Reasignar gestor"
      description={contract ? `${contract.code} · hoy lo gestiona ${contract.creator?.name ?? 'nadie'}.` : undefined}
      footer={
        <>
          <Button onClick={onClose} disabled={loading}>Volver</Button>
          <Button variant="primary" loading={loading} disabled={!valid} onClick={() => onConfirm({ managerId, reason: reason.trim() })}>
            Reasignar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {managers.isError && <Alert tone="danger">No se pudo cargar la lista de gestores.</Alert>}
        <Field label="Nuevo gestor">
          <Select value={managerId} onChange={(event) => setManagerId(event.target.value)} disabled={managers.isPending}>
            <option value="">{managers.isPending ? 'Cargando…' : 'Elige un gestor'}</option>
            {candidates.map((manager) => (
              <option key={manager.id} value={manager.id}>{manager.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Motivo" hint="Obligatorio. El gestor anterior y el nuevo recibirán un aviso.">
          <Textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} />
        </Field>
      </div>
    </Dialog>
  );
}
