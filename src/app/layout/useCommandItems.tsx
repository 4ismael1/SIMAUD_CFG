import type { ReactNode } from 'react';
import { FilePlus2, FileText, LayoutTemplate, Search, UserRound } from 'lucide-react';
import { Badge } from '../../ui';
import { useContractSearch } from '../../lib/api/hooks/contracts';
import { contractStatus } from '../../lib/api/status';
import type { Role } from '../../lib/api/types';
import { navigationFor } from '../navigation';

export interface CommandItem {
  id: string;
  label: string;
  /** Secondary text under or beside the label (a code, a section name). */
  detail?: string;
  icon: ReactNode;
  to: string;
  trailing?: ReactNode;
}

export interface CommandSection {
  title: string;
  items: CommandItem[];
}

interface QuickAction {
  label: string;
  to: string;
  icon: ReactNode;
  roles: Role[];
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: 'Crear contrato nuevo', to: '/app/contratos/nuevo', icon: <FilePlus2 />, roles: ['admin', 'gestor'] },
  { label: 'Crear plantilla nueva', to: '/app/plantillas/nueva', icon: <LayoutTemplate />, roles: ['admin', 'supervisor'] },
  { label: 'Ver mi perfil', to: '/app/perfil', icon: <UserRound />, roles: ['admin', 'supervisor', 'gestor', 'user'] },
];

/** Lower-cases and strips accents so "configuracion" finds "Configuración". */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function matches(label: string, search: string): boolean {
  return normalize(label).includes(normalize(search));
}

/** Everything the palette can offer for the typed text: contracts found, pages and quick actions. */
export function useCommandItems(role: Role, search: string, debouncedSearch: string) {
  const isStaff = role !== 'user';
  const contracts = useContractSearch(isStaff ? debouncedSearch : '');
  const sections: CommandSection[] = [];

  const contractItems: CommandItem[] = (debouncedSearch.length >= 2 ? (contracts.data?.data ?? []) : []).map((contract) => ({
    id: `contract-${contract.id}`,
    label: contract.title,
    detail: contract.code,
    icon: <FileText />,
    to: `/app/contratos/${contract.id}`,
    trailing: <Badge tone={contractStatus[contract.status].tone}>{contractStatus[contract.status].label}</Badge>,
  }));
  if (isStaff && search.length >= 2) {
    contractItems.push({
      id: 'contract-search-all',
      label: `Buscar «${search}» en todos los contratos`,
      icon: <Search />,
      to: `/app/contratos?q=${encodeURIComponent(search)}`,
    });
  }
  if (contractItems.length > 0) sections.push({ title: 'Contratos', items: contractItems });

  const pageItems: CommandItem[] = navigationFor(role)
    .flatMap((group) => group.items.map((item) => ({ item, group: group.label })))
    .filter(({ item }) => matches(item.label, search))
    .map(({ item, group }) => ({
      id: `page-${item.to}`,
      label: item.label,
      detail: group,
      icon: <item.icon />,
      to: item.to,
    }));
  if (pageItems.length > 0) sections.push({ title: 'Ir a', items: pageItems });

  const actionItems: CommandItem[] = QUICK_ACTIONS.filter((action) => action.roles.includes(role) && matches(action.label, search)).map(
    (action) => ({ id: `action-${action.to}`, label: action.label, icon: action.icon, to: action.to }),
  );
  if (actionItems.length > 0) sections.push({ title: 'Acciones rápidas', items: actionItems });

  const searching = isStaff && debouncedSearch.length >= 2 && contracts.isFetching;
  return { sections, searching };
}
