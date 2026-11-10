import { useState, type FormEvent } from 'react';
import { Ellipsis, KeyRound, MailPlus, Pencil, ShieldCheck, UserPlus, Users as UsersIcon } from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  DataTable,
  Dialog,
  EmptyState,
  Field,
  IconButton,
  Input,
  Menu,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  useAction,
  type Column,
  type MenuItem,
} from '../../ui';
import { useCreateUser, useDeleteUser, useResendInvite, useSendPasswordReset, useUpdateUser, useUsers } from '../../lib/api/hooks/users';
import type { Role, User, UserStatus } from '../../lib/api/core-types';
import { roleStatus } from '../../lib/api/status';
import { useAuth } from '../../lib/auth';
import { EditUserDialog } from './EditUserDialog';
import { formatDate } from '../../lib/format';
import { formatCedula, validateCedula, validateEmail, validatePersonName, validatePhoneDo } from '../../lib/validation';

const PAGE_SIZE = 20;
const ROLES: Role[] = ['admin', 'supervisor', 'gestor', 'user'];

export function UsersPage() {
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [status, setStatus] = useState<UserStatus | ''>('');
  const [page, setPage] = useState(1);
  const [inviting, setInviting] = useState(false);
  const users = useUsers({ q: search || undefined, role: role || undefined, status: status || undefined, page, pageSize: PAGE_SIZE });

  const columns: Column<User>[] = [
    {
      key: 'name',
      header: 'Usuario',
      cell: (user) => (
        <span className="flex min-w-0 items-center gap-3">
          <Avatar name={user.name} size="sm" tone={user.isActive ? 'dark' : 'muted'} />
          <span className="min-w-0">
            <span className="block truncate font-medium">{user.name}</span>
            <span className="block truncate text-xs text-slate-500">{user.email}</span>
          </span>
        </span>
      ),
    },
    { key: 'role', header: 'Rol', cell: (user) => <Badge tone={roleStatus[user.role].tone}>{roleStatus[user.role].label}</Badge> },
    {
      key: 'status',
      header: 'Estado',
      cell: (user) => <UserStatusBadge user={user} />,
    },
    { key: 'last', header: 'Último acceso', hideOnMobile: true, cell: (user) => (user.lastLoginAt ? formatDate(user.lastLoginAt) : '—') },
    { key: 'actions', header: <span className="sr-only">Acciones</span>, align: 'right', cell: (user) => <UserActions user={user} /> },
  ];

  return (
    <>
      <PageHeader
        title="Usuarios"
        description="Quién accede a SIMAUD y con qué permisos."
        actions={<Button variant="primary" icon={<UserPlus />} onClick={() => setInviting(true)}>Invitar usuario</Button>}
      />
      <div className="flex flex-col gap-3 sm:flex-row">
        <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Buscar por nombre, correo o cédula…" className="flex-1" />
        <Select value={role} onChange={(event) => { setRole(event.target.value as Role | ''); setPage(1); }} className="sm:w-48" aria-label="Filtrar por rol">
          <option value="">Todos los roles</option>
          {ROLES.map((value) => <option key={value} value={value}>{roleStatus[value].label}</option>)}
        </Select>
        <Select value={status} onChange={(event) => { setStatus(event.target.value as UserStatus | ''); setPage(1); }} className="sm:w-48" aria-label="Filtrar por estado">
          <option value="">Todos los estados</option>
          <option value="active">Activos</option>
          <option value="invited">Invitación pendiente</option>
          <option value="inactive">Desactivados</option>
        </Select>
      </div>
      <Card>
        <DataTable
          caption="Usuarios"
          columns={columns}
          rows={users.data?.data}
          rowKey={(user) => user.id}
          loading={users.isPending}
          empty={<EmptyState icon={<UsersIcon />} title="Sin resultados" description="Prueba con otra búsqueda o invita a alguien." />}
          footer={users.data && users.data.meta.total > PAGE_SIZE ? <Pagination page={page} pageSize={PAGE_SIZE} total={users.data.meta.total} onPageChange={setPage} /> : undefined}
        />
      </Card>
      <InviteUserDialog open={inviting} onClose={() => setInviting(false)} />
    </>
  );
}

function UserActions({ user }: { user: User }) {
  const { user: me } = useAuth();
  const { runAction } = useAction();
  const update = useUpdateUser(user.id);
  const remove = useDeleteUser(user.id);
  const sendReset = useSendPasswordReset(user.id);
  const resendInvite = useResendInvite(user.id);
  const isMe = me?.id === user.id;
  const [editing, setEditing] = useState(false);

  const roleItems: MenuItem[] = ROLES.filter((value) => value !== user.role).map((value, index) => ({
    label: `Cambiar a ${roleStatus[value].label.toLowerCase()}`,
    icon: <ShieldCheck />,
    separatorBefore: index === 0,
    // The API also refuses to remove the last administrator or your own admin role.
    disabled: isMe,
    onSelect: () =>
      void runAction({
        confirm: {
          title: `¿Cambiar el rol de ${user.name}?`,
          description: `Pasará de ${roleStatus[user.role].label.toLowerCase()} a ${roleStatus[value].label.toLowerCase()}. Sus permisos cambian al instante.`,
          confirmLabel: 'Cambiar rol',
        },
        run: () => update.mutateAsync({ role: value }),
        success: `${user.name} ahora es ${roleStatus[value].label.toLowerCase()}.`,
      }),
  }));

  const invited = statusOf(user) === 'invited';
  // Access links: the admin never sees or chooses passwords; the user receives a one-hour link (T12b).
  const accessItems: MenuItem[] = [
    invited
      ? {
          label: 'Reenviar invitación',
          icon: <MailPlus />,
          onSelect: () =>
            void runAction({
              confirm: {
                title: `¿Reenviar la invitación a ${user.name}?`,
                description: `Se enviará un enlace nuevo a ${user.email}; el anterior deja de funcionar.`,
                confirmLabel: 'Reenviar',
              },
              pending: 'Enviando invitación…',
              run: () => resendInvite.mutateAsync(),
              success: `Invitación reenviada a ${user.email}.`,
            }),
        }
      : {
          label: 'Enviar enlace para nueva contraseña',
          icon: <KeyRound />,
          disabled: !user.isActive,
          onSelect: () =>
            void runAction({
              confirm: {
                title: `¿Enviar a ${user.name} un enlace para cambiar su contraseña?`,
                description: `Llegará a ${user.email} y caduca en una hora. Se cerrarán sus sesiones abiertas en todos los dispositivos.`,
                confirmLabel: 'Enviar enlace',
              },
              pending: 'Enviando enlace…',
              run: () => sendReset.mutateAsync(),
              success: `Enlace enviado a ${user.email}.`,
            }),
        },
  ];

  const items: MenuItem[] = [{ label: 'Editar datos…', icon: <Pencil />, onSelect: () => setEditing(true) }, ...accessItems, ...roleItems];
  items.push(
    user.isActive
      ? {
          label: 'Desactivar acceso',
          danger: true,
          separatorBefore: true,
          disabled: isMe,
          onSelect: () =>
            void runAction({
              confirm: {
                title: `¿Desactivar a ${user.name}?`,
                description: 'No podrá entrar ni firmar. Sus contratos y su historial se conservan.',
                confirmLabel: 'Desactivar',
                tone: 'danger',
              },
              run: () => update.mutateAsync({ isActive: false }),
              success: `Acceso de ${user.name} desactivado.`,
              undo: { run: () => update.mutateAsync({ isActive: true }), success: `Acceso de ${user.name} reactivado.` },
            }),
        }
      : {
          label: 'Reactivar acceso',
          separatorBefore: true,
          onSelect: () => void runAction({ run: () => update.mutateAsync({ isActive: true }), success: `Acceso de ${user.name} reactivado.` }),
        },
    {
      label: 'Eliminar usuario',
      danger: true,
      disabled: isMe,
      onSelect: () =>
        void runAction({
          confirm: {
            title: `¿Eliminar a ${user.name}?`,
            description: 'Se retira la cuenta. Los contratos y firmas en los que participó se conservan en el historial.',
            confirmLabel: 'Eliminar',
            tone: 'danger',
          },
          run: () => remove.mutateAsync(),
          success: `${user.name} fue eliminado.`,
        }),
    },
  );

  return (
    <>
      <Menu
        items={items}
        trigger={(props) => (
          <IconButton label={`Acciones de ${user.name}`} size="sm" {...props}>
            <Ellipsis />
          </IconButton>
        )}
      />
      {/* Mounted only while open, so it always starts from the user's current data. */}
      {editing && <EditUserDialog user={user} open onClose={() => setEditing(false)} />}
    </>
  );
}

/** Status from the API (T12b) or, on older APIs, derived from the account fields. */
function statusOf(user: User): UserStatus {
  if (user.status) return user.status;
  if (!user.isActive) return 'inactive';
  return user.emailConfirmedAt ? 'active' : 'invited';
}

function UserStatusBadge({ user }: { user: User }) {
  const status = statusOf(user);
  if (status === 'inactive') return <Badge tone="danger">Desactivado</Badge>;
  if (status === 'invited') {
    return (
      <span className="flex flex-col items-start gap-0.5">
        <Badge tone="warning">Invitación pendiente</Badge>
        {user.invitedAt && <span className="text-[11px] text-slate-500">Enviada {formatDate(user.invitedAt)}</span>}
      </span>
    );
  }
  return <Badge tone="success">Activo</Badge>;
}

interface InviteForm {
  name: string;
  email: string;
  cedula: string;
  phone: string;
  role: Role;
}

const EMPTY_FORM: InviteForm = { name: '', email: '', cedula: '', phone: '', role: 'gestor' };

function InviteUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateUser();
  const { runAction, running } = useAction();
  const [form, setForm] = useState<InviteForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof InviteForm, string>>>({});

  function set<K extends keyof InviteForm>(key: K, value: InviteForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function validate() {
    const next: Partial<Record<keyof InviteForm, string>> = {};
    const name = validatePersonName(form.name);
    const email = validateEmail(form.email);
    const cedula = validateCedula(form.cedula);
    if (!name.ok) next.name = name.message;
    if (!email.ok) next.email = email.message;
    if (!cedula.ok) next.cedula = cedula.message;
    if (form.phone.trim()) {
      const phone = validatePhoneDo(form.phone);
      if (!phone.ok) next.phone = phone.message;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!validate()) return;
    const result = await runAction({
      run: () => create.mutateAsync({ name: form.name.trim(), email: form.email.trim(), cedula: form.cedula, phone: form.phone, role: form.role }),
      success: `Invitación enviada a ${form.email.trim()}.`,
    });
    if (result.ok) {
      setForm(EMPTY_FORM);
      onClose();
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      variant="drawer"
      title="Invitar usuario"
      description="Recibirá un correo para crear su propia contraseña. Nadie más la conoce."
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="invite-user" loading={running} icon={<UserPlus />}>Enviar invitación</Button>
        </>
      }
    >
      <form id="invite-user" className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        <Field label="Nombre completo" error={errors.name}>
          <Input value={form.name} onChange={(event) => set('name', event.target.value)} autoComplete="off" />
        </Field>
        <Field label="Correo electrónico" error={errors.email}>
          <Input type="email" value={form.email} onChange={(event) => set('email', event.target.value)} autoComplete="off" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Cédula" error={errors.cedula}>
            <Input
              className="font-mono"
              inputMode="numeric"
              placeholder="000-0000000-0"
              value={form.cedula}
              onChange={(event) => set('cedula', event.target.value)}
              onBlur={() => { const check = validateCedula(form.cedula); if (check.ok) set('cedula', formatCedula(check.value)); }}
            />
          </Field>
          <Field label="Teléfono" optional error={errors.phone}>
            <Input inputMode="tel" placeholder="809-000-0000" value={form.phone} onChange={(event) => set('phone', event.target.value)} />
          </Field>
        </div>
        <Field label="Rol" hint="Puedes cambiarlo después.">
          <Select value={form.role} onChange={(event) => set('role', event.target.value as Role)}>
            {ROLES.map((value) => <option key={value} value={value}>{roleStatus[value].label}</option>)}
          </Select>
        </Field>
      </form>
    </Dialog>
  );
}
