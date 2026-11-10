import type { Template, Variable } from '../../lib/api/catalog-types';
import type { TemplateStatus, VariableType } from '../../lib/api/core-types';

/**
 * Client-side filtering for the template and variable catalogues.
 * Both lists are small (an institution has tens of templates), so the page loads them once
 * and filters in memory: the category list stays complete while the user types.
 */

export const TEMPLATE_SORTS = [
  { value: 'recientes', label: 'Modificadas recientemente' },
  { value: 'nombre', label: 'Nombre (A–Z)' },
  { value: 'uso', label: 'Más usadas' },
] as const;

export type TemplateSort = (typeof TEMPLATE_SORTS)[number]['value'];

export const DEFAULT_TEMPLATE_SORT: TemplateSort = 'recientes';

export function isTemplateSort(value: string | null): value is TemplateSort {
  return TEMPLATE_SORTS.some((option) => option.value === value);
}

export interface TemplateFilters {
  search: string;
  status: TemplateStatus | '';
  category: string;
  sort: TemplateSort;
}

/** Lower-case and strip accents so «garantia» finds «Garantía». */
export function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function matchesSearch(search: string, fields: (string | null | undefined)[]): boolean {
  const needle = normalizeText(search);
  if (!needle) return true;
  return fields.some((field) => field && normalizeText(field).includes(needle));
}

export function templateCategories(templates: Template[]): string[] {
  const unique = new Set(templates.map((template) => template.category).filter(Boolean));
  return [...unique].sort((a, b) => a.localeCompare(b, 'es'));
}

export function filterTemplates(templates: Template[], filters: TemplateFilters): Template[] {
  const rows = templates.filter(
    (template) =>
      (!filters.status || template.status === filters.status) &&
      (!filters.category || template.category === filters.category) &&
      matchesSearch(filters.search, [template.title, template.description, template.category]),
  );
  return rows.sort(TEMPLATE_COMPARATORS[filters.sort]);
}

const TEMPLATE_COMPARATORS: Record<TemplateSort, (a: Template, b: Template) => number> = {
  recientes: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
  nombre: (a, b) => a.title.localeCompare(b.title, 'es'),
  uso: (a, b) => (b.usageCount ?? 0) - (a.usageCount ?? 0) || a.title.localeCompare(b.title, 'es'),
};

export interface VariableFilters {
  search: string;
  type: VariableType | '';
  /** '' = all, 'si' = only required, 'no' = only optional. */
  required: '' | 'si' | 'no';
}

export function filterVariables(variables: Variable[], filters: VariableFilters): Variable[] {
  return variables
    .filter(
      (variable) =>
        (!filters.type || variable.type === filters.type) &&
        (!filters.required || variable.required === (filters.required === 'si')) &&
        matchesSearch(filters.search, [variable.name, variable.label, variable.description]),
    )
    .sort((a, b) => a.label.localeCompare(b.label, 'es'));
}
