import { useEffect, useState } from 'react';
import { Bell, Check, RefreshCcw, X } from 'lucide-react';
import { Avatar, Button, Card, CardHeader, ConfirmDialog, useAction, useToast } from '../../../ui';
import { useRemindSignatory, useResetSignature } from '../../../lib/api/hooks/contracts';
import { errorMessage } from '../../../lib/errors';
import { downloadSignature } from '../../../lib/api/hooks/signatures';
import type { ContractDetail, Signatory, SignatoryRole } from '../../../lib/api/types';
import { formatDateTime } from '../../../lib/format';

export const SIGNATORY_ROLE_LABELS: Record<SignatoryRole, string> = {
  client: 'Cliente',
  witness: 'Testigo',
  // Shown as the institution's side (the API value stays «contractor»).
  contractor: 'Por la institución',
};

/** Role to show: the template's box label (T19) when the API sends it, otherwise the fixed role. */
export function signatoryRoleLabel(signatory: { role: SignatoryRole; roleLabel?: string | null }): string {
  return signatory.roleLabel?.trim() || SIGNATORY_ROLE_LABELS[signatory.role];
}

/** The first pending signatory in signing order is the one whose turn it is. */
export function currentSignatory(signatories: Signatory[]): Signatory | undefined {
  return [...signatories].sort((a, b) => a.signingOrder - b.signingOrder).find((signatory) => signatory.status === 'pending');
}

export function SignatoriesPanel({ contract, canRemind }: { contract: ContractDetail; canRemind: boolean }) {
  const { runAction } = useAction();
  const toast = useToast();
  const remind = useRemindSignatory(contract.id);
  const resetSignature = useResetSignature(contract.id);
  const [resetting, setResetting] = useState<Signatory | null>(null);
  const ordered = [...contract.signatories].sort((a, b) => a.signingOrder - b.signingOrder);
  const turn = contract.status === 'pending_signatures' ? currentSignatory(ordered) : undefined;

  async function handleRemind(signatory: Signatory) {
    await runAction({
      confirm: {
        title: `¿Enviar un recordatorio a ${signatory.name}?`,
        description: `Recibirá un correo en ${signatory.email} recordándole que tiene un contrato por firmar.`,
        confirmLabel: 'Enviar recordatorio',
      },
      run: () => remind.mutateAsync({ signatoryId: signatory.id }),
      success: `Recordatorio enviado a ${signatory.name}.`,
    });
  }

  async function handleReset(reason: string) {
    if (!resetting) return;
    try {
      await resetSignature.mutateAsync({ signatoryId: resetting.id, reason });
      toast.success(`Se pidió a ${resetting.name} que firme de nuevo.`);
      setResetting(null);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <Card>
      <CardHeader title="Firmantes · en orden" />
      <ul className="flex flex-col gap-3 p-5">
        {ordered.map((signatory) => (
          <li key={signatory.id} className="flex flex-col gap-2">
            <div className="flex items-center gap-2.5 text-[13.5px]">
              <Avatar name={String(signatory.signingOrder)} size="sm" tone={signatory.id === turn?.id ? 'brand' : 'dark'} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{signatory.name}</span>
                <span className="block truncate text-xs text-slate-500">
                  {signatoryRoleLabel(signatory)} · {signatory.email}
                </span>
              </span>
              <SignatoryState signatory={signatory} isTurn={signatory.id === turn?.id} />
            </div>
            {signatory.status === 'signed' && signatory.signatureFileId && <SignatureImage fileId={signatory.signatureFileId} name={signatory.name} />}
            {signatory.signedAt && <p className="pl-9 text-xs text-slate-500">Firmó el {formatDateTime(signatory.signedAt)}</p>}
            {canRemind && signatory.id === turn?.id && (
              <Button size="sm" icon={<Bell />} className="ml-9 self-start" loading={remind.isPending} onClick={() => void handleRemind(signatory)}>
                Recordar a {signatory.name.split(' ')[0]}
              </Button>
            )}
            {signatory.canResetSignature && (
              <Button size="sm" variant="ghost" icon={<RefreshCcw />} className="ml-9 self-start" onClick={() => setResetting(signatory)}>
                Pedir nueva firma
              </Button>
            )}
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={resetting !== null}
        onClose={() => setResetting(null)}
        tone="danger"
        title={`¿Pedir a ${resetting?.name ?? ''} que firme de nuevo?`}
        description="Su firma actual queda anulada (se conserva en el historial) y recibirá un aviso para volver a firmar. Las demás firmas no cambian."
        reasonLabel="Motivo"
        confirmLabel="Pedir nueva firma"
        loading={resetSignature.isPending}
        onConfirm={(reason) => void handleReset(reason)}
      />
    </Card>
  );
}

function SignatoryState({ signatory, isTurn }: { signatory: Signatory; isTurn: boolean }) {
  if (signatory.status === 'signed') {
    return (
      <span className="flex items-center gap-1 text-xs font-semibold text-green-700">
        <Check className="size-3.5" aria-hidden="true" /> Firmó
      </span>
    );
  }
  if (signatory.status === 'declined') {
    return (
      <span className="flex items-center gap-1 text-xs font-semibold text-red-600">
        <X className="size-3.5" aria-hidden="true" /> Rechazó
      </span>
    );
  }
  return <span className={isTurn ? 'text-xs font-semibold text-blue-700' : 'text-xs text-slate-500'}>{isTurn ? 'Su turno' : 'Pendiente'}</span>;
}

/** Signature images are private: fetched with the session token and shown from a local object URL. */
function SignatureImage({ fileId, name }: { fileId: string; name: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    downloadSignature(fileId)
      .then(({ blob }) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => setUrl(null));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileId]);

  if (!url) return null;
  return <img src={url} alt={`Firma de ${name}`} className="ml-9 h-12 w-auto max-w-[180px] rounded border border-slate-100 bg-white object-contain p-1" />;
}
