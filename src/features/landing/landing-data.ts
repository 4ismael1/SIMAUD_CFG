import {
  Bell,
  BellRing,
  CircleCheck,
  ClipboardCheck,
  FilePenLine,
  FileText,
  Layers,
  ListOrdered,
  PenLine,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import type { Tone } from '../../ui';

/** Copy and sample data for the public landing page. All names and codes are fictitious examples. */

export const NAV_LINKS = [
  { id: 'recorrido', label: 'Recorrido' },
  { id: 'perfiles', label: 'Perfiles' },
  { id: 'constancia', label: 'Constancia' },
  { id: 'preguntas', label: 'Preguntas' },
] as const;

export const VALUE_POINTS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: FileText, title: 'Plantillas oficiales', text: 'Cada contrato parte de un modelo aprobado por la Unidad Legal.' },
  { icon: ClipboardCheck, title: 'Revisión obligatoria', text: 'Nada se firma sin el visto bueno de un supervisor.' },
  { icon: ListOrdered, title: 'Firmas en orden', text: 'Cada parte firma cuando le toca, desde cualquier dispositivo.' },
  { icon: BellRing, title: 'Vencimientos bajo control', text: 'Avisos automáticos y renovación en pocos pasos.' },
];

export interface Step {
  numeral: string;
  icon: LucideIcon;
  title: string;
  text: string;
  /** Small status chip that illustrates the step. */
  chip: { tone: Tone; label: string };
}

export const STEPS: Step[] = [
  {
    numeral: 'I',
    icon: FilePenLine,
    title: 'Redacción',
    text: 'El gestor elige una plantilla oficial, completa los datos y agrega a los firmantes por su cédula.',
    chip: { tone: 'neutral', label: 'Borrador guardado' },
  },
  {
    numeral: 'II',
    icon: ClipboardCheck,
    title: 'Aprobación',
    text: 'Un supervisor revisa el documento y lo aprueba o lo devuelve con observaciones.',
    chip: { tone: 'success', label: 'Aprobado' },
  },
  {
    numeral: 'III',
    icon: PenLine,
    title: 'Firma',
    text: 'Cada parte firma desde el móvil o el ordenador, en el orden establecido.',
    chip: { tone: 'info', label: '2 de 3 firmas' },
  },
  {
    numeral: 'IV',
    icon: Bell,
    title: 'Vigencia',
    text: 'Avisos 30, 15, 7 y 1 día antes del vencimiento, y renovación con un clic.',
    chip: { tone: 'warning', label: 'Vence en 15 días' },
  },
];

export interface RolePreviewRow {
  title: string;
  meta: string;
  badge: { tone: Tone; label: string };
}

export interface Role {
  id: string;
  icon: LucideIcon;
  title: string;
  summary: string;
  abilities: string[];
  preview: { heading: string; rows: RolePreviewRow[] };
}

export const ROLES: Role[] = [
  {
    id: 'gestor',
    icon: FileText,
    title: 'Gestores',
    summary: 'Crean contratos y siguen cada firma hasta el final.',
    abilities: ['Redactan desde plantillas', 'Agregan firmantes por cédula', 'Solicitan renovaciones'],
    preview: {
      heading: 'Mis contratos',
      rows: [
        { title: 'Suministro de material gastable', meta: 'CT-2026-0039 · RD$ 87.500,00', badge: { tone: 'info', label: 'Por firmar' } },
        { title: 'Mantenimiento de climatización', meta: 'CT-2026-0041 · RD$ 142.000,00', badge: { tone: 'warning', label: 'Devuelto' } },
        { title: 'Servicio de vigilancia', meta: 'CT-2026-0028 · RD$ 310.000,00', badge: { tone: 'success', label: 'Vigente' } },
      ],
    },
  },
  {
    id: 'supervisor',
    icon: CircleCheck,
    title: 'Supervisores',
    summary: 'Revisan, aprueban o devuelven con observaciones.',
    abilities: ['Cola de aprobación', 'Comentarios obligatorios al devolver', 'Mantienen las plantillas'],
    preview: {
      heading: 'Pendientes de revisión',
      rows: [
        { title: 'Arrendamiento de local', meta: 'Enviado hace 2 días · María Fernández', badge: { tone: 'warning', label: 'En revisión' } },
        { title: 'Consultoría de procesos', meta: 'Enviado hoy · Pedro Almonte', badge: { tone: 'warning', label: 'En revisión' } },
        { title: 'Suministro de material gastable', meta: 'Aprobado ayer', badge: { tone: 'success', label: 'Aprobado' } },
      ],
    },
  },
  {
    id: 'firmante',
    icon: PenLine,
    title: 'Firmantes',
    summary: 'Leen y firman los contratos en los que participan.',
    abilities: ['Bandeja «Es tu turno»', 'Firma con el dedo, ratón o lápiz', 'Descargan el PDF firmado'],
    preview: {
      heading: 'Por firmar',
      rows: [
        { title: 'Suministro de material gastable', meta: 'Testigo · te toca firmar', badge: { tone: 'brand', label: 'Es tu turno' } },
        { title: 'Servicio de transporte', meta: 'Esperando a Ana Pérez', badge: { tone: 'neutral', label: 'En espera' } },
        { title: 'Servicio de vigilancia', meta: 'Firmado el 2 nov 2026', badge: { tone: 'success', label: 'Firmado' } },
      ],
    },
  },
  {
    id: 'admin',
    icon: Layers,
    title: 'Administración',
    summary: 'Gestiona usuarios, configuración y reportes.',
    abilities: ['Roles y accesos', 'Reportes exportables', 'Días de aviso y tareas automáticas'],
    preview: {
      heading: 'Resumen institucional',
      rows: [
        { title: 'Contratos vigentes', meta: 'Valor total RD$ 12,4 M', badge: { tone: 'success', label: '48' } },
        { title: 'Vencen en 30 días', meta: '3 con renovación solicitada', badge: { tone: 'warning', label: '5' } },
        { title: 'Esperando aprobación', meta: 'El más antiguo, hace 3 días', badge: { tone: 'info', label: '4' } },
      ],
    },
  },
];

export const ASSURANCES = [
  { icon: ShieldCheck, text: 'Permisos comprobados en el servidor' },
  { icon: Bell, text: 'Avisos por correo y en la aplicación' },
  { icon: FileText, text: 'PDF firmado descargable' },
];

export const AUDIT_LOG = [
  { at: '07/11/2026 10:42', event: 'FIRMA', tone: 'text-green-300', detail: 'José Rodríguez Peña · CT-2026-0039 v2' },
  { at: '04/11/2026 16:05', event: 'APROBADO', tone: 'text-green-300', detail: 'Carlos Méndez · CT-2026-0039 v2' },
  { at: '04/11/2026 09:12', event: 'DEVUELTO', tone: 'text-vino-300', detail: 'Carlos Méndez · «Ajustar anexo A»' },
  { at: '02/11/2026 14:30', event: 'CREADO', tone: 'text-slate-300', detail: 'María Fernández · plantilla Suministro' },
];

export const FAQ = [
  {
    question: '¿La firma electrónica tiene validez legal?',
    answer:
      'Sí. La Ley 126-02 sobre Comercio Electrónico, Documentos y Firmas Digitales reconoce la firma electrónica. SIMAUD registra quién firmó, cuándo, desde qué dispositivo y sobre qué versión exacta del documento.',
  },
  {
    question: '¿Tengo que instalar algo para firmar?',
    answer: 'No. Basta con un navegador actualizado en el ordenador, la tableta o el móvil. Puedes firmar con el ratón, el dedo o un lápiz digital.',
  },
  {
    question: '¿Qué pasa si el contrato cambia después de aprobado?',
    answer: 'Se crea una versión nueva y el contrato vuelve a revisión. Las firmas siempre quedan ligadas a la versión que se leyó.',
  },
  {
    question: '¿Quién puede ver mis contratos?',
    answer:
      'Solo las personas que participan en ellos y el personal autorizado de la Unidad Legal. Los permisos se comprueban en el servidor en cada solicitud.',
  },
  {
    question: 'No encuentro el contrato que debo firmar',
    answer:
      'Entra con el correo con el que te registraron y revisa la bandeja «Por firmar». Si todavía no es tu turno, aparecerá en «Esperando a otro».',
  },
];
