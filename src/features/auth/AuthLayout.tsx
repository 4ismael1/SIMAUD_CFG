import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Check, ShieldCheck } from 'lucide-react';
import { Badge, Logo } from '../../ui';
import logoMark from '../../assets/logo-columna.png';

interface AuthLayoutProps {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

/** Split layout for sign-in and sign-up: form on the left, product preview on the right (desktop only). */
export function AuthLayout({ title, description, children, footer }: AuthLayoutProps) {
  return (
    <div className="flex min-h-dvh bg-white">
      <div className="flex min-w-0 flex-1 flex-col px-5 py-6 sm:px-12 lg:px-20">
        <Link to="/" className="self-start" aria-label="Ir al inicio">
          <Logo />
        </Link>
        <div className="my-auto flex w-full max-w-[420px] flex-col gap-6 py-10">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-[28px] font-semibold">{title}</h1>
            {description && <p className="text-slate-500">{description}</p>}
          </div>
          {children}
          {footer && <div className="text-center text-sm text-slate-500">{footer}</div>}
        </div>
        <div className="flex flex-wrap justify-between gap-3 text-xs text-slate-400">
          <span>© {new Date().getFullYear()} SIMAUD · Gestión Legal Digital</span>
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            Conexión cifrada
          </span>
        </div>
      </div>
      <ProductPreview />
    </div>
  );
}

function ProductPreview() {
  return (
    <aside
      aria-hidden="true"
      className="relative hidden w-[46%] max-w-[720px] flex-col justify-center gap-7 overflow-hidden border-l border-slate-200 bg-slate-100 px-14 py-12 lg:flex"
    >
      <img src={logoMark} alt="" className="pointer-events-none absolute -top-10 -right-16 h-[520px] w-auto opacity-[0.05]" />
      <div className="relative flex max-w-lg flex-col gap-2.5">
        <span className="text-xs font-semibold tracking-wider text-vino-600 uppercase">Contratos institucionales</span>
        <p className="text-3xl leading-tight font-semibold text-slate-900">Redacta, aprueba y firma contratos en un solo lugar.</p>
      </div>
      <div className="relative flex max-w-lg flex-col gap-3.5 rounded-2xl border border-slate-200 bg-white p-5 shadow-pop">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold">Suministro de Material Gastable</p>
            <p className="font-mono text-xs text-slate-500">CT-2026-0039 · RD$ 87.500,00</p>
          </div>
          <Badge tone="info">Por firmar</Badge>
        </div>
        <p className="rounded-md border border-slate-200 bg-paper px-5 py-4 font-serif text-[13px] leading-relaxed text-slate-800">
          Entre <span className="doc-var">Distribuidora Nacional SRL</span> y la institución, se conviene el suministro de
          material gastable a partir del <span className="doc-var">3 de noviembre de 2026</span>…
        </p>
        <div className="flex items-center justify-between text-[13px]">
          <span>José Rodríguez Peña</span>
          <span className="flex items-center gap-1 font-medium text-green-700">
            <Check className="size-4" /> Firmó
          </span>
        </div>
        <div className="flex items-center justify-between text-[13px]">
          <span>Laura Santos</span>
          <span className="font-medium text-blue-700">Su turno</span>
        </div>
      </div>
      <ul className="relative flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
        {['Plantillas oficiales', 'Firma electrónica (Ley 126-02)', 'Avisos de vencimiento'].map((feature) => (
          <li key={feature} className="flex items-center gap-1.5">
            <Check className="size-4 text-vino-600" />
            {feature}
          </li>
        ))}
      </ul>
    </aside>
  );
}

/** Centered single-card layout for short flows (recover, reset, confirm). */
export function AuthCardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center gap-7 bg-slate-50 px-5 py-12">
      <Link to="/" aria-label="Ir al inicio">
        <Logo className="h-10" />
      </Link>
      <div className="w-full max-w-[440px] animate-pop-in rounded-2xl border border-slate-200 bg-white p-7 shadow-card sm:p-8">
        {children}
      </div>
      <p className="text-xs text-slate-400">¿Problemas para entrar? Escribe a la Unidad de Gestión Legal.</p>
    </div>
  );
}
