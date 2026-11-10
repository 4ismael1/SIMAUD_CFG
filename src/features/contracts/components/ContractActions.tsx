import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Archive, ArchiveRestore, Ban, Download, Ellipsis, PenLine, Pencil, RotateCcw, Send, ShieldAlert, Trash2, UserRoundCog } from 'lucide-react';
import { Button, ButtonLink, ConfirmDialog, IconButton, Menu, useAction, useToast, type MenuItem } from '../../../ui';
import {
  useArchiveContract,
  useCancelContract,
  useDeleteContract,
  useOverrideContractStatus,
  useSubmitContract,
  useUnarchiveContract,
  useUncancelContract,
} from '../../../lib/api/hooks/contracts';
import type { ContractDetail } from '../../../lib/api/types';
import { errorMessage } from '../../../lib/errors';
import { downloadFromApi } from '../../../lib/download';
import { useReassignContract } from '../../../lib/api/hooks/contract-admin';
import { ReassignDialog } from '../admin/ReassignDialog';
import { CancelContractDialog, OverrideStatusDialog } from './ContractDialogs';

type OpenDialog = 'submit' | 'cancel' | 'delete' | 'override' | 'reassign' | null;

/** Primary and secondary actions for a contract, shown only when the API says the user may perform them. */
export function ContractActions({ contract }: { contract: ContractDetail }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { runAction } = useAction();
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const { can } = contract;

  const submit = useSubmitContract(contract.id);
  const cancel = useCancelContract(contract.id);
  const uncancel = useUncancelContract(contract.id);
  const archive = useArchiveContract(contract.id);
  const unarchive = useUnarchiveContract(contract.id);
  const remove = useDeleteContract(contract.id);
  const override = useOverrideContractStatus(contract.id);
  const reassign = useReassignContract();

  async function run(action: () => Promise<unknown>, successMessage: string) {
    try {
      await action();
      toast.success(successMessage);
      setDialog(null);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function downloadPdf() {
    await runAction({
      run: () => downloadFromApi(`/contracts/${contract.id}/pdf`, `${contract.code}.pdf`, { final: contract.status === 'active' || undefined }),
      pending: 'Preparando el PDF…',
      success: 'PDF descargado.',
      error: 'No se pudo descargar el PDF.',
    });
  }

  function toggleArchive() {
    if (contract.archived) {
      void runAction({
        run: () => unarchive.mutateAsync(),
        success: 'Contrato desarchivado.',
        undo: { run: () => archive.mutateAsync(), success: 'Contrato archivado de nuevo.' },
      });
      return;
    }
    void runAction({
      run: () => archive.mutateAsync(),
      success: 'Contrato archivado.',
      undo: { run: () => unarchive.mutateAsync(), success: 'Contrato desarchivado.' },
    });
  }

  const secondary: MenuItem[] = [];
  if (can.archive) {
    secondary.push(
      contract.archived
        ? { label: 'Desarchivar', icon: <ArchiveRestore />, onSelect: toggleArchive }
        : { label: 'Archivar', icon: <Archive />, onSelect: toggleArchive },
    );
  }
  if (can.override && contract.status === 'cancelled') {
    secondary.push({
      label: 'Reactivar contrato',
      icon: <RotateCcw />,
      onSelect: () =>
        void runAction({
          confirm: {
            title: '¿Reactivar este contrato?',
            description: 'Volverá al estado que tenía antes de cancelarse y quedará registrado en el historial.',
            confirmLabel: 'Reactivar',
          },
          run: () => uncancel.mutateAsync(),
          success: 'Contrato reactivado.',
        }),
    });
  }
  if (can.reassign) {
    secondary.push({ label: 'Reasignar gestor…', icon: <UserRoundCog />, onSelect: () => setDialog('reassign'), separatorBefore: true });
  }
  if (can.override) {
    secondary.push({ label: 'Forzar estado…', icon: <ShieldAlert />, onSelect: () => setDialog('override'), separatorBefore: !can.reassign });
  }
  if (can.cancel) {
    secondary.push({ label: 'Cancelar contrato…', icon: <Ban />, danger: true, onSelect: () => setDialog('cancel'), separatorBefore: !can.override });
  }
  if (can.delete) {
    secondary.push({ label: 'Eliminar borrador…', icon: <Trash2 />, danger: true, onSelect: () => setDialog('delete') });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button icon={<Download />} onClick={() => void downloadPdf()}>PDF</Button>
      {can.edit && (
        <ButtonLink to={`/app/contratos/${contract.id}/editar`} icon={<Pencil />}>
          {contract.status === 'rejected' ? 'Corregir' : 'Editar'}
        </ButtonLink>
      )}
      {can.submit && (
        <Button variant="primary" icon={<Send />} onClick={() => setDialog('submit')}>
          Enviar a aprobación
        </Button>
      )}
      {can.approve && (
        <ButtonLink to="/app/aprobaciones" variant="primary">Revisar en aprobaciones</ButtonLink>
      )}
      {can.sign && (
        <ButtonLink to={`/app/contratos/${contract.id}/firmar`} viewTransition variant="primary" icon={<PenLine />}>
          Firmar
        </ButtonLink>
      )}
      {secondary.length > 0 && (
        <Menu
          items={secondary}
          trigger={(props) => (
            <IconButton label="Más acciones" className="border border-slate-300 bg-white" {...props}>
              <Ellipsis />
            </IconButton>
          )}
        />
      )}

      <ConfirmDialog
        open={dialog === 'submit'}
        onClose={() => setDialog(null)}
        title="Enviar a aprobación"
        description="Un supervisor revisará el contrato. Mientras tanto no podrás editarlo."
        confirmLabel="Enviar"
        loading={submit.isPending}
        onConfirm={() => void run(() => submit.mutateAsync(), 'Contrato enviado a aprobación.')}
      />
      <CancelContractDialog
        open={dialog === 'cancel'}
        onClose={() => setDialog(null)}
        loading={cancel.isPending}
        onConfirm={(input) => void run(() => cancel.mutateAsync(input), 'Contrato cancelado.')}
      />
      <OverrideStatusDialog
        open={dialog === 'override'}
        current={contract.status}
        onClose={() => setDialog(null)}
        loading={override.isPending}
        onConfirm={(input) => void run(() => override.mutateAsync(input), 'Estado actualizado.')}
      />
      <ConfirmDialog
        open={dialog === 'delete'}
        onClose={() => setDialog(null)}
        tone="danger"
        title="¿Eliminar este borrador?"
        description={`Se borrará ${contract.code} con sus versiones. No se puede deshacer; la eliminación queda en la auditoría.`}
        confirmLabel="Eliminar borrador"
        loading={remove.isPending}
        onConfirm={() =>
          void run(async () => {
            await remove.mutateAsync();
            navigate('/app/contratos', { replace: true });
          }, 'Se eliminó el borrador.')
        }
      />
      <ReassignDialog
        contract={dialog === 'reassign' ? contract : null}
        onClose={() => setDialog(null)}
        loading={reassign.isPending}
        onConfirm={(body) => void run(() => reassign.mutateAsync({ id: contract.id, ...body }), `Se reasignó ${contract.code}.`)}
      />
    </div>
  );
}
