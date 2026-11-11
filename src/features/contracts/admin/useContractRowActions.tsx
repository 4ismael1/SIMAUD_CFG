import { useState, type ReactNode } from 'react';
import { Archive, ArchiveRestore, Ban, Download, Eye, Pencil, RotateCcw, ShieldAlert, Trash2, UserRoundCog } from 'lucide-react';
import { useAction, type MenuItem } from '../../../ui';
import { useContractRowAction, useDeleteContractRow, useReassignContract } from '../../../lib/api/hooks/contract-admin';
import type { Contract, ContractStatus, Role } from '../../../lib/api/types';
import { downloadFromApi } from '../../../lib/download';
import { CancelContractDialog, OverrideStatusDialog, overrideTargets } from '../components/ContractDialogs';
import { ReassignDialog } from './ReassignDialog';

type DialogKind = 'cancel' | 'override' | 'reassign';

const EDITABLE = new Set<ContractStatus>(['draft', 'rejected']);
const CANCELLABLE = new Set<ContractStatus>(['pending_approval', 'pending_signatures', 'active', 'expiring_soon']);

/**
 * Per-row actions of the contract list. What appears depends on the role and the status;
 * the API stays the authority and answers with a clear error if something is not allowed.
 */
export function useContractRowActions(role: Role | undefined): { menuFor: (contract: Contract) => MenuItem[]; dialogs: ReactNode } {
  const { runAction } = useAction();
  const rowAction = useContractRowAction();
  const removeRow = useDeleteContractRow();
  const reassign = useReassignContract();
  const [target, setTarget] = useState<{ kind: DialogKind; contract: Contract } | null>(null);
  const isAdmin = role === 'admin';
  const canManage = isAdmin || role === 'gestor';

  function closeAfter(run: () => Promise<unknown>, success: string) {
    void runAction({ run, success }).then((result) => {
      if (result.ok) setTarget(null);
    });
  }

  function toggleArchive(contract: Contract) {
    const forward = contract.archived ? 'unarchive' : 'archive';
    const backward = contract.archived ? 'archive' : 'unarchive';
    void runAction({
      run: () => rowAction.mutateAsync({ id: contract.id, action: forward }),
      success: contract.archived ? `Se desarchivó ${contract.code}.` : `Se archivó ${contract.code}.`,
      undo: { run: () => rowAction.mutateAsync({ id: contract.id, action: backward }), success: 'Se deshizo el cambio.' },
    });
  }

  function reactivate(contract: Contract) {
    void runAction({
      confirm: {
        title: `¿Reactivar ${contract.code}?`,
        description: 'Volverá al estado que tenía antes de cancelarse y quedará registrado en el historial.',
        confirmLabel: 'Reactivar',
      },
      run: () => rowAction.mutateAsync({ id: contract.id, action: 'uncancel' }),
      success: `Se reactivó ${contract.code}.`,
    });
  }

  function removeDraft(contract: Contract) {
    void runAction({
      confirm: {
        title: `¿Eliminar el borrador ${contract.code}?`,
        description: 'Solo se pueden eliminar borradores sin firmas. No se puede deshacer.',
        confirmLabel: 'Eliminar borrador',
        tone: 'danger',
      },
      run: () => removeRow.mutateAsync(contract.id),
      success: `Se eliminó el borrador ${contract.code}.`,
    });
  }

  function downloadPdf(contract: Contract) {
    void runAction({
      run: () => downloadFromApi(`/contracts/${contract.id}/pdf`, `${contract.code}.pdf`),
      pending: `Preparando el PDF de ${contract.code}…`,
      success: 'Se descargó el PDF.',
      error: 'No se pudo descargar el PDF.',
    });
  }

  function adminItems(contract: Contract): MenuItem[] {
    const items: MenuItem[] = [
      { label: 'Reasignar gestor…', icon: <UserRoundCog />, onSelect: () => setTarget({ kind: 'reassign', contract }), separatorBefore: true },
    ];
    if (overrideTargets(contract.status).length > 0)
      items.push({ label: 'Forzar estado…', icon: <ShieldAlert />, onSelect: () => setTarget({ kind: 'override', contract }) });
    if (contract.status === 'cancelled') items.push({ label: 'Reactivar', icon: <RotateCcw />, onSelect: () => reactivate(contract) });
    return items;
  }

  function menuFor(contract: Contract): MenuItem[] {
    const items: MenuItem[] = [{ label: 'Ver contrato', icon: <Eye />, to: `/app/contratos/${contract.id}` }];
    if (canManage && EDITABLE.has(contract.status)) {
      items.push({ label: contract.status === 'rejected' ? 'Corregir' : 'Editar', icon: <Pencil />, to: `/app/contratos/${contract.id}/editar` });
    }
    items.push({ label: 'Descargar PDF', icon: <Download />, onSelect: () => downloadPdf(contract) });
    if (isAdmin) items.push(...adminItems(contract));
    if (canManage) {
      const icon = contract.archived ? <ArchiveRestore /> : <Archive />;
      items.push({ label: contract.archived ? 'Desarchivar' : 'Archivar', icon, onSelect: () => toggleArchive(contract), separatorBefore: true });
    }
    if (isAdmin && CANCELLABLE.has(contract.status)) {
      items.push({ label: 'Cancelar contrato…', icon: <Ban />, danger: true, onSelect: () => setTarget({ kind: 'cancel', contract }) });
    }
    if (canManage && contract.status === 'draft') {
      items.push({ label: 'Eliminar borrador…', icon: <Trash2 />, danger: true, onSelect: () => removeDraft(contract) });
    }
    return items;
  }

  const contract = target?.contract;
  const dialogs = (
    <>
      <CancelContractDialog
        open={target?.kind === 'cancel'}
        onClose={() => setTarget(null)}
        loading={rowAction.isPending}
        onConfirm={(body) => contract && closeAfter(() => rowAction.mutateAsync({ id: contract.id, action: 'cancel', body }), `Se canceló ${contract.code}.`)}
      />
      <OverrideStatusDialog
        open={target?.kind === 'override'}
        current={contract?.status ?? 'draft'}
        onClose={() => setTarget(null)}
        loading={rowAction.isPending}
        onConfirm={(body) =>
          contract && closeAfter(() => rowAction.mutateAsync({ id: contract.id, action: 'override-status', body }), `Se cambió el estado de ${contract.code}.`)
        }
      />
      <ReassignDialog
        contract={target?.kind === 'reassign' ? target.contract : null}
        onClose={() => setTarget(null)}
        loading={reassign.isPending}
        onConfirm={(body) => contract && closeAfter(() => reassign.mutateAsync({ id: contract.id, ...body }), `Se reasignó ${contract.code}.`)}
      />
    </>
  );

  return { menuFor, dialogs };
}
