import { useState } from 'react';
import type { Column } from '../../../ui';

const CHECKBOX_CLASS = 'size-4 cursor-pointer rounded border-slate-300 accent-vino-600';

interface RowSelection<Row> {
  selectedIds: string[];
  selectedKeys: ReadonlySet<string>;
  clear: () => void;
  /** Leading checkbox column; add it only for roles that can act in bulk. */
  column: Column<Row>;
}

/** Selection of the rows visible on the current page of a table. */
export function useRowSelection<Row>(rows: Row[] | undefined, rowKey: (row: Row) => string, rowLabel: (row: Row) => string): RowSelection<Row> {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const visibleKeys = (rows ?? []).map(rowKey);
  // Rows that left the page (filter, pagination, an action) silently drop out of the selection.
  const selectedIds = visibleKeys.filter((key) => selected.has(key));
  const allSelected = visibleKeys.length > 0 && selectedIds.length === visibleKeys.length;

  function toggle(key: string) {
    const next = new Set(selectedIds);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  }

  const column: Column<Row> = {
    key: 'select',
    className: 'w-10 pr-0',
    header: (
      <input
        type="checkbox"
        aria-label="Seleccionar todos los de esta página"
        className={CHECKBOX_CLASS}
        checked={allSelected}
        ref={(element) => {
          if (element) element.indeterminate = selectedIds.length > 0 && !allSelected;
        }}
        onChange={() => setSelected(allSelected ? new Set() : new Set(visibleKeys))}
      />
    ),
    cell: (row) => (
      <span className="flex" onClick={(event) => event.stopPropagation()}>
        <input
          type="checkbox"
          aria-label={`Seleccionar ${rowLabel(row)}`}
          className={CHECKBOX_CLASS}
          checked={selected.has(rowKey(row))}
          onChange={() => toggle(rowKey(row))}
        />
      </span>
    ),
  };

  return { selectedIds, selectedKeys: new Set(selectedIds), clear: () => setSelected(new Set()), column };
}
