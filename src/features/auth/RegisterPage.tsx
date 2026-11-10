import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Button, Checkbox, Field, Input } from '../../ui';
import { useRegister } from '../../lib/api/hooks/auth';
import { formatCedula, isValidCedula } from '../../lib/format';
import { errorField, errorMessage } from '../../lib/errors';
import { AuthLayout } from './AuthLayout';
import { PasswordInput, PasswordStrength, isStrongEnough } from './PasswordInput';

interface RegisterForm {
  name: string;
  cedula: string;
  phone: string;
  email: string;
  password: string;
  acceptedTerms: boolean;
}

type FormErrors = Partial<Record<keyof RegisterForm, string>>;

const EMPTY_FORM: RegisterForm = { name: '', cedula: '', phone: '', email: '', password: '', acceptedTerms: false };
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validate(form: RegisterForm): FormErrors {
  const errors: FormErrors = {};
  if (form.name.trim().length < 3) errors.name = 'Escribe tu nombre completo.';
  if (!isValidCedula(form.cedula)) errors.cedula = 'Revisa la cédula: debe tener 11 dígitos válidos (000-0000000-0).';
  if (!EMAIL_PATTERN.test(form.email.trim())) errors.email = 'Escribe un correo válido, por ejemplo nombre@institucion.edu.do.';
  if (!isStrongEnough(form.password)) errors.password = 'La contraseña no cumple los requisitos.';
  if (!form.acceptedTerms) errors.acceptedTerms = 'Debes aceptar los términos para continuar.';
  return errors;
}

export function RegisterPage() {
  const navigate = useNavigate();
  const registerMutation = useRegister();
  const [form, setForm] = useState<RegisterForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [showErrors, setShowErrors] = useState(false);

  function update<K extends keyof RegisterForm>(key: K, value: RegisterForm[K]) {
    const next = { ...form, [key]: value };
    setForm(next);
    if (showErrors) setErrors(validate(next));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const validationErrors = validate(form);
    setErrors(validationErrors);
    setShowErrors(true);
    if (Object.keys(validationErrors).length > 0) return;

    try {
      await registerMutation.mutateAsync({
        name: form.name.trim(),
        cedula: form.cedula,
        phone: form.phone.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });
      navigate(`/auth/verifica?email=${encodeURIComponent(form.email.trim().toLowerCase())}`, { replace: true });
    } catch (registerError) {
      const field = errorField(registerError);
      if (field === 'email' || field === 'cedula') {
        setErrors({ [field]: errorMessage(registerError) });
      }
    }
  }

  const apiError = registerMutation.error;
  const apiErrorHandledInline = errorField(apiError) === 'email' || errorField(apiError) === 'cedula';

  return (
    <AuthLayout
      title="Crear cuenta"
      description="Para revisar y firmar los contratos en los que participas."
      footer={
        <>
          ¿Ya tienes cuenta?{' '}
          <Link to="/auth/login" className="font-semibold text-vino-600 hover:text-vino-700">
            Inicia sesión
          </Link>
        </>
      }
    >
      {apiError && !apiErrorHandledInline && <Alert tone="danger">{errorMessage(apiError)}</Alert>}
      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        <Field label="Nombre completo" error={errors.name}>
          <Input autoComplete="name" value={form.name} onChange={(event) => update('name', event.target.value)} autoFocus />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Cédula" error={errors.cedula}>
            <Input
              inputMode="numeric"
              className="font-mono"
              placeholder="000-0000000-0"
              value={form.cedula}
              onChange={(event) => update('cedula', formatCedula(event.target.value))}
            />
          </Field>
          <Field label="Teléfono" optional>
            <Input type="tel" autoComplete="tel" placeholder="809-000-0000" value={form.phone} onChange={(event) => update('phone', event.target.value)} />
          </Field>
        </div>
        <Field label="Correo electrónico" error={errors.email}>
          <Input type="email" autoComplete="email" value={form.email} onChange={(event) => update('email', event.target.value)} />
        </Field>
        <Field label="Contraseña" error={errors.password}>
          <PasswordInput autoComplete="new-password" value={form.password} onChange={(event) => update('password', event.target.value)} />
        </Field>
        {form.password && <PasswordStrength password={form.password} />}
        <div className="flex flex-col gap-1">
          <Checkbox
            checked={form.acceptedTerms}
            onChange={(event) => update('acceptedTerms', event.target.checked)}
            label="Acepto los términos de uso y el tratamiento de mis datos para la gestión de contratos."
          />
          {errors.acceptedTerms && <p className="text-xs text-red-600">{errors.acceptedTerms}</p>}
        </div>
        <Button type="submit" variant="primary" size="lg" block loading={registerMutation.isPending}>
          Crear cuenta
        </Button>
      </form>
    </AuthLayout>
  );
}
