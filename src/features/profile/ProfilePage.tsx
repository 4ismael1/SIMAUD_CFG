import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Camera, KeyRound, Mail, Trash2 } from 'lucide-react';
import { Avatar, Badge, Button, Card, CardHeader, Checkbox, Field, Input, PageHeader, Skeleton, useAction, useToast } from '../../ui';
import {
  useChangeEmail,
  useChangePassword,
  useDeleteAvatar,
  useNotificationPreferences,
  useUpdateMe,
  useUpdateNotificationPreferences,
  useUploadAvatar,
} from '../../lib/api/hooks/me';
import { useDeleteSignatureStyle, useSignatureStyle } from '../../lib/api/hooks/signature-style';
import type { NotificationPreferences } from '../../lib/api/lifecycle-types';
import { roleStatus } from '../../lib/api/status';
import { useAuth } from '../../lib/auth';
import { formatCedula, validateEmail, validatePersonName, validatePhoneDo } from '../../lib/validation';
import { avatarUrlFor } from '../../app/avatar';
import { PasswordInput, PasswordStrength, isStrongEnough } from '../auth/PasswordInput';
import { FittedSignatureText } from '../signatures/FittedSignatureText';
import { styleById } from '../signatures/signature-styles';

/** Same limit the API enforces; checked here to fail fast. */
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export function ProfilePage() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <>
      <PageHeader title="Mi perfil" description="Tus datos, tu seguridad y cómo te avisamos." />
      <div className="stagger grid items-start gap-5 lg:grid-cols-2">
        <PersonalSection />
        <SecuritySection />
        <NotificationsSection />
        <SavedSignatureSection />
      </div>
    </>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <div className="flex flex-col gap-4 p-5">{children}</div>
    </Card>
  );
}

function PersonalSection() {
  const { user, refreshUser } = useAuth();
  const { runAction, running } = useAction();
  const toast = useToast();
  const updateMe = useUpdateMe();
  const upload = useUploadAvatar();
  const removeAvatar = useDeleteAvatar();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  if (!user) return null;

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    const next: typeof errors = {};
    const nameCheck = validatePersonName(name);
    if (!nameCheck.ok) next.name = nameCheck.message;
    if (phone.trim()) {
      const phoneCheck = validatePhoneDo(phone);
      if (!phoneCheck.ok) next.phone = phoneCheck.message;
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    const result = await runAction({ run: () => updateMe.mutateAsync({ name: name.trim(), phone }), success: 'Datos actualizados.' });
    if (result.ok) await refreshUser();
  }

  async function handleFile(file: File | undefined) {
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    if (file.type !== 'image/png') {
      toast.error('La foto debe ser una imagen PNG.');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error('La foto supera 2 MB.');
      return;
    }
    const result = await runAction({ run: () => upload.mutateAsync(file), pending: 'Subiendo la foto…', success: 'Foto actualizada.' });
    if (result.ok) await refreshUser();
  }

  async function handleRemovePhoto() {
    const result = await runAction({
      confirm: { title: '¿Quitar tu foto?', description: 'Se mostrarán tus iniciales en su lugar.', confirmLabel: 'Quitar foto' },
      run: () => removeAvatar.mutateAsync(),
      success: 'Foto eliminada.',
    });
    if (result.ok) await refreshUser();
  }

  const avatarUrl = avatarUrlFor(user);

  return (
    <Section title="Datos personales">
      <div className="flex items-center gap-4">
        <Avatar name={user.name} src={avatarUrl} size="lg" />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={<Camera />} onClick={() => fileRef.current?.click()}>
            {avatarUrl ? 'Cambiar foto' : 'Subir foto'}
          </Button>
          {avatarUrl && (
            <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => void handleRemovePhoto()}>
              Quitar
            </Button>
          )}
          <input ref={fileRef} type="file" accept="image/png" className="sr-only" onChange={(event) => void handleFile(event.target.files?.[0])} />
        </div>
      </div>
      <form className="flex flex-col gap-4" onSubmit={handleSave} noValidate>
        <Field label="Nombre completo" error={errors.name}>
          <Input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Teléfono" optional error={errors.phone}>
            <Input inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" />
          </Field>
          <Field label="Cédula" hint="Para cambiarla, contacta con administración.">
            <Input value={user.cedula ? formatCedula(user.cedula) : '—'} disabled className="font-mono" />
          </Field>
        </div>
        <div className="flex items-center justify-between gap-3">
          <Badge tone={roleStatus[user.role].tone}>{roleStatus[user.role].label}</Badge>
          <Button type="submit" variant="primary" loading={running && updateMe.isPending}>Guardar cambios</Button>
        </div>
      </form>
    </Section>
  );
}

function SecuritySection() {
  const { user } = useAuth();
  const { runAction } = useAction();
  const changePassword = useChangePassword();
  const changeEmail = useChangeEmail();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);

  const canChangePassword = current.length > 0 && isStrongEnough(next) && next === confirmation && next !== current;

  async function handlePassword(event: FormEvent) {
    event.preventDefault();
    if (!canChangePassword) return;
    const result = await runAction({
      run: () => changePassword.mutateAsync({ currentPassword: current, newPassword: next }),
      success: 'Contraseña actualizada. Cerramos tus sesiones en otros equipos.',
    });
    if (result.ok) {
      setCurrent('');
      setNext('');
      setConfirmation('');
    }
  }

  async function handleEmail(event: FormEvent) {
    event.preventDefault();
    const check = validateEmail(newEmail);
    setEmailError(check.ok ? null : check.message);
    if (!check.ok || !emailPassword) return;
    const result = await runAction({
      run: () => changeEmail.mutateAsync({ newEmail: check.value, password: emailPassword }),
      success: `Te enviamos un enlace a ${check.value} para confirmar el cambio.`,
    });
    if (result.ok) {
      setNewEmail('');
      setEmailPassword('');
    }
  }

  return (
    <Section title="Seguridad" description={user ? `Entras con ${user.email}.` : undefined}>
      <form className="flex flex-col gap-3" onSubmit={handlePassword} noValidate>
        <h3 className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="size-4 text-slate-400" aria-hidden="true" />Cambiar contraseña</h3>
        <Field label="Contraseña actual">
          <PasswordInput autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} />
        </Field>
        <Field label="Contraseña nueva" error={next && next === current ? 'Debe ser distinta de la actual.' : null}>
          <PasswordInput autoComplete="new-password" value={next} onChange={(event) => setNext(event.target.value)} />
        </Field>
        {next && <PasswordStrength password={next} />}
        <Field label="Confirmar contraseña" error={confirmation && confirmation !== next ? 'Las contraseñas no coinciden.' : null}>
          <PasswordInput autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
        </Field>
        <Button type="submit" variant="primary" disabled={!canChangePassword} loading={changePassword.isPending} className="self-end">
          Cambiar contraseña
        </Button>
      </form>

      <form className="flex flex-col gap-3 border-t border-slate-100 pt-4" onSubmit={handleEmail} noValidate>
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Mail className="size-4 text-slate-400" aria-hidden="true" />Cambiar correo</h3>
        <Field label="Correo nuevo" error={emailError}>
          <Input type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} autoComplete="email" />
        </Field>
        <Field label="Tu contraseña" hint="La pedimos para confirmar que eres tú.">
          <PasswordInput autoComplete="current-password" value={emailPassword} onChange={(event) => setEmailPassword(event.target.value)} />
        </Field>
        <Button type="submit" disabled={!newEmail || !emailPassword} loading={changeEmail.isPending} className="self-end">
          Enviar enlace de confirmación
        </Button>
      </form>
    </Section>
  );
}

const PREFERENCE_LABELS: Record<keyof NotificationPreferences, { label: string; hint: string }> = {
  emailOnSignatureRequired: { label: 'Cuando me toca firmar', hint: 'Un correo cuando un contrato espera tu firma.' },
  emailOnApprovalResult: { label: 'Resultados de aprobación', hint: 'Cuando aprueban o devuelven un contrato tuyo.' },
  emailOnExpiry: { label: 'Vencimientos', hint: 'Avisos 30, 15, 7 y 1 día antes del vencimiento.' },
};

function NotificationsSection() {
  const preferences = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();
  const { runAction } = useAction();

  function toggle(key: keyof NotificationPreferences, value: boolean) {
    void runAction({
      run: () => update.mutateAsync({ [key]: value }),
      success: value ? `Activado: ${PREFERENCE_LABELS[key].label.toLowerCase()}.` : `Desactivado: ${PREFERENCE_LABELS[key].label.toLowerCase()}.`,
    });
  }

  return (
    <Section title="Avisos por correo" description="Los avisos de seguridad (confirmaciones, recuperación) llegan siempre.">
      {preferences.isPending ? (
        <Skeleton className="h-28" />
      ) : (
        (Object.keys(PREFERENCE_LABELS) as (keyof NotificationPreferences)[]).map((key) => (
          <Checkbox
            key={key}
            checked={preferences.data?.[key] ?? true}
            disabled={update.isPending}
            onChange={(event) => toggle(key, event.target.checked)}
            label={
              <span className="flex flex-col">
                <span className="font-medium">{PREFERENCE_LABELS[key].label}</span>
                <span className="text-xs text-slate-500">{PREFERENCE_LABELS[key].hint}</span>
              </span>
            }
          />
        ))
      )}
    </Section>
  );
}

function SavedSignatureSection() {
  const saved = useSignatureStyle();
  const remove = useDeleteSignatureStyle();
  const { runAction } = useAction();
  const style = saved.data ? styleById(saved.data.fontId) : null;

  return (
    <Section title="Firma guardada" description="Solo se guarda la firma escrita, si eliges recordarla al firmar.">
      {saved.isPending ? (
        <Skeleton className="h-20" />
      ) : saved.data && style ? (
        <>
          <div className="flex h-24 items-end justify-center rounded-xl border border-slate-200 bg-white px-6 pb-5">
            <FittedSignatureText text={saved.data.text} family={style.family} baseSize={Math.round(40 * style.scale)} className="w-full text-slate-900" />
          </div>
          <Button
            variant="ghost"
            icon={<Trash2 />}
            className="self-end"
            onClick={() =>
              void runAction({
                confirm: { title: '¿Olvidar tu firma guardada?', description: 'La próxima vez tendrás que elegir el estilo de nuevo.', confirmLabel: 'Olvidar firma' },
                run: () => remove.mutateAsync(),
                success: 'Firma guardada eliminada.',
              })
            }
          >
            Olvidar firma
          </Button>
        </>
      ) : (
        <p className="text-sm text-slate-500">No tienes una firma guardada. Al firmar con «Escribir», marca «Recordar esta firma».</p>
      )}
    </Section>
  );
}
