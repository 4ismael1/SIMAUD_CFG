import { AnimatePresence, m } from 'motion/react';
import { Archive, ArchiveRestore, Ban, X } from 'lucide-react';
import { Button, IconButton, useAction } from '../../../ui';
import { useBulkContracts } from '../../../lib/api/hooks/contract-admin';
import type { BulkContractAction, BulkContractResult } from '../../../lib/api/types';

interface BulkBarProps {
  selectedIds: string[];
  /** True while looking at the archive, where the only bulk move is to bring contracts back. */
  archivedView: boolean;
  onDone: () => void;
}

const PAST: Record<BulkContractAction, string> = { cancel: 'cancelaron', archive: 'archivaron', unarchive: 'desarchivaron' };

function summary(action: BulkContractAction, result: BulkContractResult): string {
  const done = `Se ${PAST[action]} ${result.succeeded} ${result.succeeded === 1 ? 'contrato' : 'contratos'}.`;
  if (result.failed === 0) return done;
  const firstFailure = result.results.find((item) => !item.ok);
  const example = firstFailure?.error ? ` (${firstFailure.code}: ${firstFailure.error.message})` : '';
  return `${done} ${result.failed} no se pudieron${example}.`;
}

/** Floating bar that appears while contracts are selected. Admin only. */
export function BulkBar({ selectedIds, archivedView, onDone }: BulkBarProps) {
  const { runAction, running } = useAction();
  const bulk = useBulkContracts();
  const count = selectedIds.length;
  const noun = count === 1 ? 'contrato' : 'contratos';

  async function run(action: BulkContractAction, reason?: string) {
    const result = await bulk.mutateAsync({ action, ids: selectedIds, reason });
    onDone();
    return result;
  }

  function archive(action: 'archive' | 'unarchive') {
    const opposite = action === 'archive' ? 'unarchive' : 'archive';
    void runAction({
      run: () => run(action),
      success: (result) => summary(action, result),
      undo: { run: () => bulk.mutateAsync({ action: opposite, ids: selectedIds }), success: 'Se deshizo el cambio.' },
    });
  }

  function cancel() {
    void runAction({
      confirm: {
        title: `¿Cancelar ${count} ${noun}?`,
        description: 'Dejarán de estar vigentes y se avisará a sus gestores y firmantes. Los que no admitan cancelación se omiten.',
        confirmLabel: `Cancelar ${count} ${noun}`,
        reasonLabel: 'Motivo de la cancelación',
        tone: 'danger',
      },
      run: (reason) => run('cancel', reason),
      success: (result) => summary('cancel', result),
    });
  }

  return (
    <AnimatePresence>
      {count > 0 && (
        <m.div
          role="region"
          aria-label="Acciones en lote"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="fixed inset-x-4 bottom-5 z-30 mx-auto flex max-w-2xl flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-pop"
        >
          <span className="tabular grid h-7 min-w-7 place-items-center rounded-md bg-vino-600 px-1.5 text-[13px] font-semibold text-white">{count}</span>
          <span className="mr-auto text-sm font-medium text-slate-800">{count === 1 ? 'seleccionado' : 'seleccionados'}</span>
          {archivedView ? (
            <Button size="sm" icon={<ArchiveRestore />} disabled={running} onClick={() => archive('unarchive')}>Desarchivar</Button>
          ) : (
            <>
              <Button size="sm" icon={<Archive />} disabled={running} onClick={() => archive('archive')}>Archivar</Button>
              <Button size="sm" variant="danger" icon={<Ban />} disabled={running} onClick={cancel}>Cancelar</Button>
            </>
          )}
          <IconButton label="Quitar la selección" size="sm" onClick={onDone}>
            <X />
          </IconButton>
        </m.div>
      )}
    </AnimatePresence>
  );
}
