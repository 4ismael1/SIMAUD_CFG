import { useState, type FormEvent } from 'react';
import { Button, Dialog, Field, Input, useAction, revealFirstError } from '../../ui';
import { useUpdateUser } from '../../lib/api/hooks/users';
import type { User, UserPatch } from '../../lib/api/core-types';
import { formatCedula, validateCedula, validatePersonName, validatePhoneDo } from '../../lib/validation';

interface EditForm {
  name: string;
  cedula: string;
  phone: string;
}

type EditErrors = Partial<Record<keyof EditForm, string>>;

function formOf(user: User): EditForm {
  return { name: user.name, cedula: user.cedula ? formatCedula(user.cedula) : '', phone: user.phone ?? '' };
}

function validate(form: EditForm): EditErrors {
  const errors: EditErrors = {};
  const name = validatePersonName(form.name);
  const cedula = validateCedula(form.cedula);
  if (!name.ok) errors.name = name.message;
  if (!cedula.ok) errors.cedula = cedula.message;
  if (form.phone.trim()) {
    const phone = validatePhoneDo(form.phone);
    if (!phone.ok) errors.phone = phone.message;
  }
  return errors;
}

/** Only what changed is sent, so an untouched field is never rewritten. */
function changesOf(user: User, form: EditForm): UserPatch {
  const initial = formOf(user);
  const patch: UserPatch = {};
  if (form.name.trim() !== initial.name) patch.name = form.name.trim();
  if (form.cedula !== initial.cedula) patch.cedula = form.cedula;
  if (form.phone.trim() !== initial.phone) patch.phone = form.phone.trim();
  return patch;
}

interface EditUserDialogProps {
  user: User;
  open: boolean;
  onClose: () => void;
}

/** Admin only: corrects a person's identity data. Role and access are changed from the row menu. */
export function EditUserDialog({ user, open, onClose }: EditUserDialogProps) {
  const update = useUpdateUser(user.id);
  const { runAction, running } = useAction();
  const [form, setForm] = useState<EditForm>(() => formOf(user));
  const [errors, setErrors] = useState<EditErrors>({});
  const formId = `edit-user-${user.id}`;
  const patch = changesOf(user, form);
  const dirty = Object.keys(patch).length > 0;

  function set<K extends keyof EditForm>(key: K, value: EditForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      revealFirstError();
      return;
    }
    const result = await runAction({ run: () => update.mutateAsync(patch), success: `Se actualizaron los datos de ${form.name.trim()}.` });
    if (result.ok) onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      variant="drawer"
      title="Editar usuario"
      description={user.email}
      footer={
        <>
          <Button onClick={onClose} disabled={running}>Cancelar</Button>
          <Button variant="primary" type="submit" form={formId} loading={running} disabled={!dirty}>Guardar cambios</Button>
        </>
      }
    >
      <form id={formId} className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        <Field label="Nombre completo" error={errors.name}>
          <Input value={form.name} onChange={(event) => set('name', event.target.value)} autoComplete="off" />
        </Field>
        <Field label="Cédula" error={errors.cedula} hint="Es la que aparece en los contratos que firma.">
          <Input
            className="font-mono"
            inputMode="numeric"
            placeholder="000-0000000-0"
            value={form.cedula}
            onChange={(event) => set('cedula', event.target.value)}
            onBlur={() => {
              const check = validateCedula(form.cedula);
              if (check.ok) set('cedula', formatCedula(check.value));
            }}
          />
        </Field>
        <Field label="Teléfono" optional error={errors.phone}>
          <Input inputMode="tel" placeholder="809-000-0000" value={form.phone} onChange={(event) => set('phone', event.target.value)} />
        </Field>
        <Field label="Correo electrónico" hint="El correo identifica la cuenta; la persona lo cambia desde su perfil.">
          <Input value={user.email} readOnly disabled />
        </Field>
      </form>
    </Dialog>
  );
}
