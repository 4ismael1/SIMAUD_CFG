import { X } from 'lucide-react';
import { Button, SearchInput, Select } from '../../ui';
import type { ReportFilterOptions } from '../../lib/api/types';

export const SORT_OPTIONS = [
  { value: '-updatedAt', label: 'Actividad reciente' },
  { value: '-createdAt', label: 'Más nuevos' },
  { value: 'createdAt', label: 'Más antiguos' },
  { value: 'endDate', label: 'Vencen antes' },
  { value: 'title', label: 'Título (A–Z)' },
  { value: 'code', label: 'Código' },
] as const;

export type ContractSort = (typeof SORT_OPTIONS)[number]['value'];

export const DEFAULT_SORT: ContractSort = '-updatedAt';

export function isContractSort(value: string | null): value is ContractSort {
  return SORT_OPTIONS.some((option) => option.value === value);
}

interface ContractListFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  templateId: string;
  managerId: string;
  sort: ContractSort;
  /** Undefined while loading or when the role has no access to the catalogue of filters. */
  options: ReportFilterOptions | undefined;
  showManager: boolean;
  onChange: (changes: { plantilla?: string; gestor?: string; orden?: string }) => void;
  onClear: () => void;
}

const SELECT_CLASS = 'w-full sm:w-48';

/** Search, template, manager and order of the contract list. Everything lives in the URL so a view can be shared. */
export function ContractListFilters(props: ContractListFiltersProps) {
  const { search, onSearchChange, templateId, managerId, sort, options, showManager, onChange, onClear } = props;
  const hasFilters = Boolean(search || templateId || managerId) || sort !== DEFAULT_SORT;

  return (
    <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
      <SearchInput value={search} onChange={onSearchChange} placeholder="Buscar por título, cliente o código" className="w-full sm:max-w-xs sm:flex-1" />
      {options && (
        <Select aria-label="Plantilla" className={SELECT_CLASS} value={templateId} onChange={(event) => onChange({ plantilla: event.target.value })}>
          <option value="">Todas las plantillas</option>
          {options.templates.map((template) => (
            <option key={template.id} value={template.id}>{template.title}</option>
          ))}
        </Select>
      )}
      {options && showManager && (
        <Select aria-label="Gestor" className={SELECT_CLASS} value={managerId} onChange={(event) => onChange({ gestor: event.target.value })}>
          <option value="">Todos los gestores</option>
          {options.managers.map((manager) => (
            <option key={manager.id} value={manager.id}>{manager.name}</option>
          ))}
        </Select>
      )}
      <Select aria-label="Orden" className={SELECT_CLASS} value={sort} onChange={(event) => onChange({ orden: event.target.value === DEFAULT_SORT ? '' : event.target.value })}>
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </Select>
      {hasFilters && (
        <Button size="sm" variant="ghost" icon={<X />} onClick={onClear}>
          Limpiar
        </Button>
      )}
    </div>
  );
}
