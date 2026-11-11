import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Archive, ArchiveRestore, Ban, Download, Ellipsis, FilePen, PenLine, Pencil, RefreshCcw, RotateCcw, Send, ShieldAlert, Trash2, UserRoundCog } from 'lucide-react';
import { Button, ButtonLink, ConfirmDialog, IconButton, Menu, useAction, useToast, type MenuItem } from '../../../ui';
import {
  useArchiveContract,
  useCancelContract,
  useCreateAmendment,
  useResetSignatures,
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
import { CancelContractDialog, OverrideStatusDialog, overrideTargets } from './ContractDialogs';

type OpenDialog = 'submit' | 'cancel' | 'delete' | 'override' | 'reassign' | 'amend' | 'reset-all' | null;

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
  const amend = useCreateAmendment(contract.id);
  const resetAll = useResetSignatures(contract.id);

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
  if (can.resetSignatures) {
    secondary.push({ label: 'Reiniciar firmas…', icon: <RefreshCcw />, onSelect: () => setDialog('reset-all'), separatorBefore: secondary.length > 0 });
  }
  if (can.reassign) {
    secondary.push({ label: 'Reasignar gestor…', icon: <UserRoundCog />, onSelect: () => setDialog('reassign'), separatorBefore: true });
  }
  if (can.override && overrideTargets(contract.status, Boolean(contract.amendsContractId)).length > 0) {
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
      {can.amend && (
        <Button icon={<FilePen />} onClick={() => setDialog('amend')}>
          Crear enmienda
        </Button>
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
        isAmendment={Boolean(contract.amendsContractId)}
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
      <ConfirmDialog
        open={dialog === 'amend'}
        onClose={() => setDialog(null)}
        title="Crear una enmienda"
        description={`Se crea un borrador enlazado a ${contract.code} con el mismo contenido y firmantes. Podrás corregirlo; después pasa por aprobación y todos firman de nuevo. Cuando se active, este contrato quedará como «Enmendado», con su PDF y su verificación intactos.`}
        reasonLabel="Motivo de la enmienda"
        confirmLabel="Crear enmienda"
        loading={amend.isPending}
        onConfirm={(reason) =>
          void run(async () => {
            const created = await amend.mutateAsync(reason);
            navigate(`/app/contratos/${created.id}/editar`, { viewTransition: true });
          }, 'Enmienda creada. Revisa y corrige lo necesario.')
        }
      />
      <ConfirmDialog
        open={dialog === 'reset-all'}
        onClose={() => setDialog(null)}
        tone="danger"
        title="¿Reiniciar todas las firmas?"
        description="Las firmas registradas quedan anuladas (se conservan en el historial) y todos vuelven a firmar en su orden. Se avisa al primero. El contenido y la aprobación no cambian."
        reasonLabel="Motivo"
        confirmLabel="Reiniciar firmas"
        loading={resetAll.isPending}
        onConfirm={(reason) => void run(() => resetAll.mutateAsync(reason), 'Firmas reiniciadas.')}
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
