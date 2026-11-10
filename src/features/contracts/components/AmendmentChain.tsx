import { Link } from 'react-router-dom';
import { FilePen, History } from 'lucide-react';
import type { ContractDetail } from '../../../lib/api/types';
import { StatusBadge } from './ContractBits';

/**
 * Original ↔ amendments (T17): tells whether this contract amends another or was replaced by one, and
 * links every version of the family. Hidden for contracts without amendments.
 */
export function AmendmentChain({ contract }: { contract: ContractDetail }) {
  const chain = contract.amendmentChain ?? [];
  if (chain.length < 2) return null;
  const amends = chain.find((link) => link.id === contract.amendsContractId);
  const replacedBy = chain.find((link) => link.id === contract.amendedByContractId);

  return (
    <div className="flex animate-pop-in flex-col gap-3 rounded-xl border border-violet-200 bg-violet-50/60 p-4 text-sm text-violet-950">
      <p className="flex items-start gap-2">
        {replacedBy ? <History className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <FilePen className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
        <span>
          {replacedBy && (
            <>
              Este contrato fue <b>sustituido</b> por la enmienda{' '}
              <Link to={`/app/contratos/${replacedBy.id}`} viewTransition className="font-mono font-medium underline">
                {replacedBy.code}
              </Link>
              . Conserva su PDF firmado y su verificación.
            </>
          )}
          {!replacedBy && amends && (
            <>
              Enmienda <b>E{contract.amendmentNumber}</b> de{' '}
              <Link to={`/app/contratos/${amends.id}`} viewTransition className="font-mono font-medium underline">
                {amends.code}
              </Link>
              {contract.amendmentReason ? <> · Motivo: «{contract.amendmentReason}»</> : null}
            </>
          )}
          {!replacedBy && !amends && <>Este contrato tiene enmiendas.</>}
        </span>
      </p>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
        {chain.map((link, index) => (
          <li key={link.id} className="flex items-center gap-2">
            {index > 0 && <span className="text-violet-300" aria-hidden="true">→</span>}
            {link.id === contract.id ? (
              <span className="flex items-center gap-1.5 rounded-md bg-white px-2 py-1 font-mono font-semibold shadow-sm">
                {link.code} <StatusBadge status={link.status} />
              </span>
            ) : (
              <Link to={`/app/contratos/${link.id}`} viewTransition className="flex items-center gap-1.5 rounded-md px-2 py-1 font-mono hover:bg-white">
                {link.code} <StatusBadge status={link.status} />
              </Link>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
