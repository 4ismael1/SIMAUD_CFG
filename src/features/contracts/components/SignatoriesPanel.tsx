import { useEffect, useState } from 'react';
import { Bell, Check, X } from 'lucide-react';
import { Avatar, Button, Card, CardHeader, useAction } from '../../../ui';
import { useRemindSignatory } from '../../../lib/api/hooks/contracts';
import { downloadSignature } from '../../../lib/api/hooks/signatures';
import type { ContractDetail, Signatory, SignatoryRole } from '../../../lib/api/types';
import { formatDateTime } from '../../../lib/format';

export const SIGNATORY_ROLE_LABELS: Record<SignatoryRole, string> = {
  client: 'Cliente',
  witness: 'Testigo',
  // Shown as the institution's side (the API value stays «contractor»).
  contractor: 'Por la institución',
};

/** The first pending signatory in signing order is the one whose turn it is. */
export function currentSignatory(signatories: Signatory[]): Signatory | undefined {
  return [...signatories].sort((a, b) => a.signingOrder - b.signingOrder).find((signatory) => signatory.status === 'pending');
}

export function SignatoriesPanel({ contract, canRemind }: { contract: ContractDetail; canRemind: boolean }) {
  const { runAction } = useAction();
  const remind = useRemindSignatory(contract.id);
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
                  {SIGNATORY_ROLE_LABELS[signatory.role]} · {signatory.email}
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
          </li>
        ))}
      </ul>
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
