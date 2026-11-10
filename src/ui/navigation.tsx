import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { IconButton } from './Button';
import { cn } from './cn';

export interface TabItem<T extends string> {
  value: T;
  label: string;
  count?: number;
}

interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}

/** Underlined tabs that scroll horizontally on narrow screens. */
export function Tabs<T extends string>({ items, value, onChange, label }: TabsProps<T>) {
  return (
    <div role="tablist" aria-label={label} className="-mb-px flex gap-1 overflow-x-auto border-b border-slate-200">
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(item.value)}
            className={cn(
              'flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors',
              selected ? 'border-vino-600 font-semibold text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800',
            )}
          >
            {item.label}
            {item.count !== undefined && (
              <span
                className={cn(
                  'tabular rounded-full px-1.5 py-px text-[11px] font-semibold',
                  selected ? 'bg-vino-600 text-white' : 'bg-slate-100 text-slate-500',
                )}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

interface SegmentedProps<T extends string> {
  items: { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}

export function Segmented<T extends string>({ items, value, onChange, label }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex gap-0.5 rounded-lg bg-slate-100 p-0.5">
      {items.map((item) => {
        const checked = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(item.value)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] whitespace-nowrap [&_svg]:size-3.5',
              checked ? 'bg-white font-semibold text-slate-900 shadow-card' : 'text-slate-500 hover:text-slate-800',
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}

export function SearchInput({ value, onChange, placeholder, className }: SearchInputProps) {
  return (
    <label className={cn('relative flex min-w-0 items-center', className)}>
      <span className="sr-only">{placeholder}</span>
      <Search className="pointer-events-none absolute left-3 size-4 text-slate-400" aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-lg border border-slate-300 bg-white pr-3 pl-9 text-sm placeholder:text-slate-400 hover:border-slate-400 focus:outline-2 focus:outline-offset-0 focus:outline-vino-600"
      />
    </label>
  );
}

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-2.5 text-[13px] text-slate-500">
      <span className="tabular">
        Mostrando {first}–{last} de {total}
      </span>
      <div className="flex items-center gap-1">
        <IconButton label="Página anterior" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft />
        </IconButton>
        <span className="tabular px-2">
          Página {page} de {pageCount}
        </span>
        <IconButton label="Página siguiente" size="sm" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
          <ChevronRight />
        </IconButton>
      </div>
    </div>
  );
}
