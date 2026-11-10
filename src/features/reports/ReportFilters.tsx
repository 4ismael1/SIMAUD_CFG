import { RotateCcw } from 'lucide-react';
import { Button, Card, Field, Input, Segmented, Select } from '../../ui';
import { contractStatus } from '../../lib/api/status';
import type { ContractStatus, ReportFilterOptions } from '../../lib/api/types';
import { GRANULARITIES, PRESETS, activeFilterCount, defaultFilters, rangeForPreset, type PresetId, type ReportFilterState } from './report-utils';

const STATUS_OPTIONS = Object.keys(contractStatus) as ContractStatus[];

interface ReportFiltersProps {
  filters: ReportFilterState;
  onChange: (filters: ReportFilterState) => void;
  options: ReportFilterOptions | undefined;
  /** Managers only see their own contracts, so the manager filter is hidden for them. */
  showManager: boolean;
  rangeInvalid: boolean;
}

/** One row of filters above every chart: period first, then what to narrow down. */
export function ReportFilters({ filters, onChange, options, showManager, rangeInvalid }: ReportFiltersProps) {
  function patch(changes: Partial<ReportFilterState>) {
    onChange({ ...filters, ...changes });
  }

  function choosePreset(preset: PresetId) {
    if (preset === 'custom') patch({ preset });
    else patch({ preset, ...rangeForPreset(preset) });
  }

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-full overflow-x-auto">
          <Segmented label="Período" value={filters.preset} onChange={choosePreset} items={PRESETS} />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">Agrupar por</span>
          <Segmented label="Agrupar la evolución por" value={filters.granularity} onChange={(granularity) => patch({ granularity })} items={GRANULARITIES} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Field label="Desde">
          <Input type="date" value={filters.from} max={filters.to || undefined} onChange={(event) => patch({ preset: 'custom', from: event.target.value })} />
        </Field>
        <Field label="Hasta" error={rangeInvalid ? 'Debe ser posterior a «Desde».' : null}>
          <Input type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => patch({ preset: 'custom', to: event.target.value })} />
        </Field>
        <Field label="Estado">
          <Select value={filters.status} onChange={(event) => patch({ status: event.target.value as ContractStatus | '' })}>
            <option value="">Todos los estados</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {contractStatus[status].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Plantilla">
          <Select value={filters.templateId} onChange={(event) => patch({ templateId: event.target.value })}>
            <option value="">Todas las plantillas</option>
            {options?.templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.title}
              </option>
            ))}
          </Select>
        </Field>
        {showManager && (
          <Field label="Gestor">
            <Select value={filters.managerId} onChange={(event) => patch({ managerId: event.target.value })}>
              <option value="">Todos los gestores</option>
              {options?.managers.map((manager) => (
                <option key={manager.id} value={manager.id}>
                  {manager.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>

      {activeFilterCount(filters) > 0 && (
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-[13px] text-slate-500">
          <span>
            {activeFilterCount(filters)} {activeFilterCount(filters) === 1 ? 'filtro aplicado' : 'filtros aplicados'}
          </span>
          <Button size="sm" variant="ghost" icon={<RotateCcw />} onClick={() => onChange({ ...defaultFilters(), granularity: filters.granularity })}>
            Restablecer
          </Button>
        </div>
      )}
    </Card>
  );
}
