import type { ReactNode } from 'react';
import { cn } from './cn';
import { Skeleton } from './display';

export interface Column<Row> {
  key: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  align?: 'left' | 'right';
  className?: string;
  /** Hide this column in the mobile card layout. */
  hideOnMobile?: boolean;
}

interface DataTableProps<Row> {
  columns: Column<Row>[];
  rows: Row[] | undefined;
  rowKey: (row: Row) => string;
  loading?: boolean;
  empty?: ReactNode;
  footer?: ReactNode;
  onRowClick?: (row: Row) => void;
  caption: string;
  /** Primary content of the mobile card (title line). Defaults to the first column. */
  mobileTitle?: (row: Row) => ReactNode;
}

const SKELETON_ROWS = 5;

/**
 * Table on wide screens, stacked cards on phones.
 * Rows are clickable through the first cell's link; onRowClick adds a pointer affordance for the whole row.
 */
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  loading,
  empty,
  footer,
  onRowClick,
  caption,
  mobileTitle,
}: DataTableProps<Row>) {
  const showSkeleton = loading && !rows;
  const isEmpty = !loading && rows !== undefined && rows.length === 0;
  const [firstColumn, ...otherColumns] = columns;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="bg-slate-50">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    'border-b border-slate-200 px-4 py-2.5 text-[11px] font-semibold tracking-wider whitespace-nowrap text-slate-500 uppercase',
                    column.align === 'right' ? 'text-right' : 'text-left',
                    column.className,
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {showSkeleton &&
              Array.from({ length: SKELETON_ROWS }, (_, index) => (
                <tr key={index}>
                  {columns.map((column) => (
                    <td key={column.key} className="border-b border-slate-100 px-4 py-3.5">
                      <Skeleton className="h-4 w-3/4" />
                    </td>
                  ))}
                </tr>
              ))}
            {rows?.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn('border-b border-slate-100 last:border-b-0', onRowClick && 'cursor-pointer hover:bg-slate-50')}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn('px-4 py-3 align-middle', column.align === 'right' && 'tabular text-right', column.className)}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-slate-100 md:hidden" aria-label={caption}>
        {showSkeleton &&
          Array.from({ length: 3 }, (_, index) => (
            <li key={index} className="flex flex-col gap-2 p-4">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </li>
          ))}
        {rows?.map((row) => (
          <li
            key={rowKey(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={cn('flex flex-col gap-2 p-4', onRowClick && 'cursor-pointer active:bg-slate-50')}
          >
            <div>{mobileTitle ? mobileTitle(row) : firstColumn.cell(row)}</div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
              {otherColumns
                .filter((column) => !column.hideOnMobile && typeof column.header === 'string' && column.header !== '')
                .map((column) => (
                  <div key={column.key} className="min-w-0">
                    <dt className="text-xs text-slate-500">{column.header}</dt>
                    <dd className="min-w-0 truncate">{column.cell(row)}</dd>
                  </div>
                ))}
            </dl>
          </li>
        ))}
      </ul>

      {isEmpty && empty}
      {footer}
    </div>
  );
}
