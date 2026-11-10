import {
  Braces,
  ChartColumn,
  CircleCheck,
  FileText,
  House,
  Layers,
  PenLine,
  RefreshCw,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '../lib/api/types';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
  /** Key of the badge counter shown next to the label. */
  badge?: 'pendingSignatures' | 'pendingApprovals' | 'urgentRenewals';
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

const STAFF: Role[] = ['admin', 'supervisor', 'gestor'];

export const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { to: '/app', label: 'Panel general', icon: House, roles: ['admin', 'supervisor', 'gestor'] },
      { to: '/app/firmas', label: 'Por firmar', icon: PenLine, roles: ['admin', 'supervisor', 'gestor', 'user'], badge: 'pendingSignatures' },
    ],
  },
  {
    label: 'Contratos',
    items: [
      { to: '/app/contratos', label: 'Contratos', icon: FileText, roles: STAFF },
      { to: '/app/aprobaciones', label: 'Aprobaciones', icon: CircleCheck, roles: ['admin', 'supervisor'], badge: 'pendingApprovals' },
      { to: '/app/renovaciones', label: 'Renovaciones', icon: RefreshCw, roles: STAFF, badge: 'urgentRenewals' },
      { to: '/app/plantillas', label: 'Plantillas', icon: Layers, roles: STAFF },
      { to: '/app/variables', label: 'Variables', icon: Braces, roles: ['admin', 'supervisor'] },
    ],
  },
  {
    label: 'Administración',
    items: [
      { to: '/app/reportes', label: 'Reportes', icon: ChartColumn, roles: STAFF },
      { to: '/app/usuarios', label: 'Usuarios', icon: Users, roles: ['admin'] },
      { to: '/app/configuracion', label: 'Configuración', icon: Settings, roles: ['admin'] },
    ],
  },
];

/** Navigation groups filtered to what the given role may see; empty groups are dropped. */
export function navigationFor(role: Role): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.roles.includes(role)),
  })).filter((group) => group.items.length > 0);
}

/** Where each role lands after signing in. */
export function homePathFor(role: Role): string {
  return role === 'user' ? '/app/firmas' : '/app';
}
