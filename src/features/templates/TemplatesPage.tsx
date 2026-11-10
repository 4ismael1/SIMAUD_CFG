import { useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Braces, Copy, Ellipsis, FileText, Pencil, Plus, Power, SearchX, Trash2, X } from 'lucide-react';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  Checkbox,
  DataTable,
  Dialog,
  EmptyState,
  Field,
  IconButton,
  Input,
  Menu,
  PageHeader,
  SearchInput,
  Select,
  Skeleton,
  Tabs,
  Textarea,
  useAction,
  type Column,
} from '../../ui';
import { useDeleteTemplate, useDuplicateTemplate, useSetTemplateStatus, useTemplates } from '../../lib/api/hooks/templates';
import { useCreateVariable, useDeleteVariable, useUpdateVariable, useVariables } from '../../lib/api/hooks/variables';
import type { Template, Variable, VariableInput } from '../../lib/api/catalog-types';
import type { VariableType } from '../../lib/api/core-types';
import { useAuth } from '../../lib/auth';
import {
  DEFAULT_TEMPLATE_SORT,
  TEMPLATE_SORTS,
  filterTemplates,
  filterVariables,
  isTemplateSort,
  templateCategories,
  type TemplateFilters,
  type VariableFilters,
} from './catalog-filters';

type Tab = 'templates' | 'variables';

export const VARIABLE_TYPE_LABELS: Record<VariableType, string> = {
  text: 'Texto',
  textarea: 'Texto largo',
  number: 'Número',
  date: 'Fecha',
  select: 'Lista de opciones',
};

/** Filters live in the URL (replace, not push) so a filtered view can be shared or reloaded. */
function useUrlParams() {
  const [params, setParams] = useSearchParams();
  function update(changes: Record<string, string>) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      },
      { replace: true },
    );
  }
  return { params, update };
}

const FILTER_SELECT_CLASS = 'w-full sm:w-48';

export function TemplatesPage() {
  const { hasRole } = useAuth();
  const canManage = hasRole('admin', 'supervisor');
  const { params, update } = useUrlParams();
  const tab: Tab = params.get('seccion') === 'variables' ? 'variables' : 'templates';
  // Each tab has its own filters; switching tabs starts the other one clean.
  const setTab = (value: Tab) => update({ seccion: value === 'variables' ? 'variables' : '', q: '', estado: '', categoria: '', orden: '', tipo: '', obligatoria: '' });

  return (
    <>
      <PageHeader
        title="Plantillas"
        description="Modelos oficiales desde los que se redacta cada contrato."
        actions={canManage && tab === 'templates' ? <ButtonLink to="/app/plantillas/nueva" variant="primary" icon={<Plus />}>Nueva plantilla</ButtonLink> : undefined}
      />
      <Tabs
        label="Secciones de plantillas"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'templates', label: 'Plantillas' },
          { value: 'variables', label: 'Variables' },
        ]}
      />
      {tab === 'templates' ? <TemplatesGrid canManage={canManage} /> : <VariablesTable canManage={canManage} />}
    </>
  );
}

function TemplatesGrid({ canManage }: { canManage: boolean }) {
  const { params, update } = useUrlParams();
  const templates = useTemplates();
  const sortParam = params.get('orden');
  const statusParam = params.get('estado');
  const filters: TemplateFilters = {
    search: params.get('q') ?? '',
    status: canManage && (statusParam === 'active' || statusParam === 'inactive') ? statusParam : '',
    category: params.get('categoria') ?? '',
    sort: isTemplateSort(sortParam) ? sortParam : DEFAULT_TEMPLATE_SORT,
  };
  const all = useMemo(() => templates.data ?? [], [templates.data]);
  const categories = useMemo(() => templateCategories(all), [all]);
  const rows = useMemo(() => filterTemplates(all, filters), [all, filters.search, filters.status, filters.category, filters.sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const hasFilters = Boolean(filters.search || filters.status || filters.category) || filters.sort !== DEFAULT_TEMPLATE_SORT;
  const clear = () => update({ q: '', estado: '', categoria: '', orden: '' });

  return (
    <>
      <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchInput value={filters.search} onChange={(value) => update({ q: value })} placeholder="Buscar por nombre, descripción o categoría" className="w-full sm:max-w-xs sm:flex-1" />
        {categories.length > 1 && (
          <Select aria-label="Categoría" className={FILTER_SELECT_CLASS} value={filters.category} onChange={(event) => update({ categoria: event.target.value })}>
            <option value="">Todas las categorías</option>
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </Select>
        )}
        {canManage && (
          <Select aria-label="Estado" className={FILTER_SELECT_CLASS} value={filters.status} onChange={(event) => update({ estado: event.target.value })}>
            <option value="">Activas e inactivas</option>
            <option value="active">Solo activas</option>
            <option value="inactive">Solo inactivas</option>
          </Select>
        )}
        <Select aria-label="Orden" className={FILTER_SELECT_CLASS} value={filters.sort} onChange={(event) => update({ orden: event.target.value === DEFAULT_TEMPLATE_SORT ? '' : event.target.value })}>
          {TEMPLATE_SORTS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </Select>
        {hasFilters && <Button size="sm" variant="ghost" icon={<X />} onClick={clear}>Limpiar</Button>}
      </div>
      {templates.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-40 rounded-xl" />)}
        </div>
      ) : all.length === 0 ? (
        <Card><EmptyState icon={<FileText />} title="Sin plantillas" description={canManage ? 'Crea la primera con «Nueva plantilla».' : 'Aún no hay plantillas.'} /></Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<SearchX />}
            title="Ninguna plantilla coincide"
            description="Prueba con otras palabras o quita algún filtro."
            action={<Button onClick={clear}>Quitar filtros</Button>}
          />
        </Card>
      ) : (
        <ul className="stagger grid gap-4 [--stagger-step:40ms] sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((template) => (
            <li key={template.id}>
              <TemplateCard template={template} canManage={canManage} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function TemplateCard({ template, canManage }: { template: Template; canManage: boolean }) {
  const { runAction } = useAction();
  const duplicate = useDuplicateTemplate(template.id);
  const setStatus = useSetTemplateStatus(template.id);
  const remove = useDeleteTemplate(template.id);
  const active = template.status === 'active';

  return (
    <Card className="lift flex h-full flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-vino-50 text-vino-600"><FileText className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <Link to={canManage ? `/app/plantillas/${template.id}` : '#'} className="block truncate font-semibold hover:text-vino-700">{template.title}</Link>
          <p className="text-xs text-slate-500">{template.category}</p>
        </div>
        {canManage && (
          <Menu
            items={[
              { label: 'Editar', icon: <Pencil />, to: `/app/plantillas/${template.id}` },
              {
                label: 'Duplicar',
                icon: <Copy />,
                onSelect: () => void runAction({ run: () => duplicate.mutateAsync(), success: `Se creó una copia de «${template.title}».` }),
              },
              {
                label: active ? 'Desactivar' : 'Activar',
                icon: <Power />,
                onSelect: () =>
                  void runAction({
                    run: () => setStatus.mutateAsync(active ? 'inactive' : 'active'),
                    success: active ? 'Plantilla desactivada: ya no se puede elegir para contratos nuevos.' : 'Plantilla activada.',
                    undo: { run: () => setStatus.mutateAsync(active ? 'active' : 'inactive'), success: 'Cambio deshecho.' },
                  }),
              },
              {
                label: 'Eliminar',
                icon: <Trash2 />,
                danger: true,
                separatorBefore: true,
                onSelect: () =>
                  void runAction({
                    confirm: {
                      title: `¿Eliminar «${template.title}»?`,
                      description: 'Los contratos ya creados con ella no cambian. Si hay contratos que dependen de ella, el sistema no lo permitirá: desactívala en su lugar.',
                      confirmLabel: 'Eliminar plantilla',
                      tone: 'danger',
                    },
                    run: () => remove.mutateAsync(),
                    success: 'Plantilla eliminada.',
                  }),
              },
            ]}
            trigger={(props) => <IconButton label={`Acciones de ${template.title}`} size="sm" {...props}><Ellipsis /></IconButton>}
          />
        )}
      </div>
      {template.description && <p className="line-clamp-2 text-[13px] text-slate-500">{template.description}</p>}
      <div className="mt-auto flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <Badge tone={active ? 'success' : 'neutral'}>{active ? 'Activa' : 'Inactiva'}</Badge>
        <span>{template.variables.length} variables</span>
        {template.usageCount !== undefined && <span>· {template.usageCount} contratos</span>}
      </div>
    </Card>
  );
}

function VariablesTable({ canManage }: { canManage: boolean }) {
  const variables = useVariables();
  const [editing, setEditing] = useState<Variable | 'new' | null>(null);
  const { params, update } = useUrlParams();
  const typeParam = params.get('tipo') as VariableType | null;
  const requiredParam = params.get('obligatoria');
  const filters: VariableFilters = {
    search: params.get('q') ?? '',
    type: typeParam && typeParam in VARIABLE_TYPE_LABELS ? typeParam : '',
    required: requiredParam === 'si' || requiredParam === 'no' ? requiredParam : '',
  };
  const rows = useMemo(() => filterVariables(variables.data ?? [], filters), [variables.data, filters.search, filters.type, filters.required]); // eslint-disable-line react-hooks/exhaustive-deps
  const hasFilters = Boolean(filters.search || filters.type || filters.required);
  const clear = () => update({ q: '', tipo: '', obligatoria: '' });
  const total = variables.data?.length ?? 0;

  const columns: Column<Variable>[] = [
    { key: 'name', header: 'Nombre', cell: (variable) => <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">{`{{${variable.name}}}`}</code> },
    { key: 'label', header: 'Etiqueta', cell: (variable) => variable.label },
    { key: 'type', header: 'Tipo', cell: (variable) => VARIABLE_TYPE_LABELS[variable.type] },
    { key: 'required', header: 'Obligatoria', hideOnMobile: true, cell: (variable) => (variable.required ? 'Sí' : 'No') },
  ];
  if (canManage) {
    columns.push({
      key: 'edit',
      header: <span className="sr-only">Editar</span>,
      align: 'right',
      cell: (variable) => <IconButton size="sm" label={`Editar ${variable.label}`} onClick={() => setEditing(variable)}><Pencil /></IconButton>,
    });
  }

  return (
    <>
      <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchInput value={filters.search} onChange={(value) => update({ q: value })} placeholder="Buscar por nombre o etiqueta" className="w-full sm:max-w-xs sm:flex-1" />
        <Select aria-label="Tipo de dato" className={FILTER_SELECT_CLASS} value={filters.type} onChange={(event) => update({ tipo: event.target.value })}>
          <option value="">Todos los tipos</option>
          {(Object.keys(VARIABLE_TYPE_LABELS) as VariableType[]).map((type) => <option key={type} value={type}>{VARIABLE_TYPE_LABELS[type]}</option>)}
        </Select>
        <Select aria-label="Obligatoriedad" className={FILTER_SELECT_CLASS} value={filters.required} onChange={(event) => update({ obligatoria: event.target.value })}>
          <option value="">Obligatorias y opcionales</option>
          <option value="si">Solo obligatorias</option>
          <option value="no">Solo opcionales</option>
        </Select>
        {hasFilters && <Button size="sm" variant="ghost" icon={<X />} onClick={clear}>Limpiar</Button>}
        {canManage && <Button icon={<Plus />} className="sm:ml-auto" onClick={() => setEditing('new')}>Nueva variable</Button>}
      </div>
      <Card>
        <DataTable
          caption={hasFilters ? `Variables de plantilla: ${rows.length} de ${total}` : 'Variables de plantilla'}
          columns={columns}
          rows={variables.data ? rows : undefined}
          rowKey={(variable) => variable.id}
          loading={variables.isPending}
          empty={
            hasFilters && total > 0 ? (
              <EmptyState icon={<SearchX />} title="Ninguna variable coincide" description="Prueba con otras palabras o quita algún filtro." action={<Button onClick={clear}>Quitar filtros</Button>} />
            ) : (
              <EmptyState icon={<Braces />} title="Sin variables" description="Las variables son los datos que se completan en cada contrato." />
            )
          }
        />
      </Card>
      {editing && <VariableDialog variable={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

/** Name in snake_case → readable label: "ciudad_cliente" → "Ciudad cliente". */
function labelFromName(name: string): string {
  const words = name.replace(/_/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : '';
}

interface VariableDialogProps {
  variable: Variable | null;
  /** Prefilled technical name when creating (e.g. from an unknown {{name}} in the template editor). */
  initialName?: string;
  onClose: () => void;
}

export function VariableDialog({ variable, initialName = '', onClose }: VariableDialogProps) {
  const create = useCreateVariable();
  const update = useUpdateVariable(variable?.id ?? '');
  const remove = useDeleteVariable(variable?.id ?? '');
  const { runAction, running } = useAction();
  const [form, setForm] = useState<VariableInput>({
    name: variable?.name ?? initialName,
    label: variable?.label ?? labelFromName(initialName),
    type: variable?.type ?? 'text',
    required: variable?.required ?? true,
    options: variable?.options ?? [],
    description: variable?.description ?? '',
  });
  const [optionsText, setOptionsText] = useState((variable?.options ?? []).join('\n'));
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const options = optionsText.split('\n').map((line) => line.trim()).filter(Boolean);
    if (!/^[a-z][a-z0-9_]{1,49}$/.test(form.name)) {
      setError('Usa minúsculas, números y guiones bajos (p. ej. cliente_nombre).');
      return;
    }
    if (form.type === 'select' && options.length < 2) {
      setError('Una lista necesita al menos dos opciones.');
      return;
    }
    setError(null);
    const body: VariableInput = { ...form, label: form.label.trim(), description: form.description?.trim() || null, options: form.type === 'select' ? options : null };
    const result = await runAction({
      run: () => (variable ? update.mutateAsync(body) : create.mutateAsync(body)),
      success: variable ? 'Variable actualizada.' : 'Variable creada.',
    });
    if (result.ok) onClose();
  }

  async function handleDelete() {
    if (!variable) return;
    const result = await runAction({
      confirm: {
        title: `¿Eliminar la variable «${variable.label}»?`,
        description: 'Si alguna plantilla o contrato la usa, el sistema no lo permitirá.',
        confirmLabel: 'Eliminar variable',
        tone: 'danger',
      },
      run: () => remove.mutateAsync(),
      success: 'Variable eliminada.',
    });
    if (result.ok) onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      variant="drawer"
      title={variable ? 'Editar variable' : 'Nueva variable'}
      footer={
        <>
          {variable && <Button variant="danger" icon={<Trash2 />} onClick={() => void handleDelete()} className="mr-auto">Eliminar</Button>}
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="variable-form" loading={running}>Guardar</Button>
        </>
      }
    >
      <form id="variable-form" className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        <Field label="Nombre técnico" hint="Se escribe en la plantilla como {{nombre}}." error={error}>
          <Input className="font-mono" value={form.name} disabled={Boolean(variable)} onChange={(event) => setForm({ ...form, name: event.target.value.toLowerCase() })} />
        </Field>
        <Field label="Etiqueta visible">
          <Input value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} />
        </Field>
        <Field label="Tipo de dato">
          <Select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as VariableType })}>
            {(Object.keys(VARIABLE_TYPE_LABELS) as VariableType[]).map((type) => <option key={type} value={type}>{VARIABLE_TYPE_LABELS[type]}</option>)}
          </Select>
        </Field>
        {form.type === 'select' && (
          <Field label="Opciones" hint="Una por línea.">
            <Textarea rows={4} value={optionsText} onChange={(event) => setOptionsText(event.target.value)} />
          </Field>
        )}
        <Field label="Ayuda para quien completa" optional>
          <Input value={form.description ?? ''} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        </Field>
        <Checkbox checked={form.required ?? true} onChange={(event) => setForm({ ...form, required: event.target.checked })} label="Obligatoria" />
      </form>
    </Dialog>
  );
}
