import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Check, ShieldCheck } from 'lucide-react';
import { Badge, Logo } from '../../ui';

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
      <div className="flex min-w-0 flex-1 flex-col px-5 py-6 sm:px-12 lg:px-16 xl:px-20">
        <Link to="/" className="animate-fade-in self-start" aria-label="Ir al inicio">
          <Logo />
        </Link>
        <div className="stagger mx-auto my-auto flex w-full max-w-[420px] flex-col gap-6 py-10 [--stagger-step:60ms]">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-[28px] font-semibold">{title}</h1>
            {description && <p className="text-slate-500">{description}</p>}
          </div>
          {children}
          {footer && <div className="text-center text-sm text-slate-500">{footer}</div>}
        </div>
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-slate-400 sm:justify-between">
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
      className="relative isolate hidden w-[46%] max-w-[720px] flex-col justify-center gap-7 overflow-hidden border-l border-slate-200 bg-slate-50 px-12 py-12 lg:flex xl:px-16"
    >
      <div className="pointer-events-none absolute inset-0 -z-10 [background-image:radial-gradient(rgb(15_23_42/0.08)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_80%_70%_at_50%_45%,black,transparent)]" />
      <div className="pointer-events-none absolute top-1/2 left-1/2 -z-10 size-[380px] -translate-1/2 rounded-full bg-vino-200/40 blur-3xl" />
      <div className="relative flex max-w-lg animate-rise-in flex-col gap-2.5 [animation-delay:150ms]">
        <span className="text-xs font-semibold tracking-wider text-vino-600 uppercase">Contratos institucionales</span>
        <p className="text-3xl leading-tight font-semibold text-slate-900">Redacta, aprueba y firma contratos en un solo lugar.</p>
      </div>
      <div className="relative flex max-w-lg animate-rise-in flex-col gap-3.5 rounded-2xl border border-slate-200 bg-white p-5 shadow-pop [animation-delay:280ms]">
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
          <span className="flex items-center gap-1.5 font-medium text-vino-600">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-vino-400 opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-vino-600" />
            </span>
            Su turno
          </span>
        </div>
      </div>
      <ul className="relative flex max-w-lg animate-rise-in flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600 [animation-delay:420ms]">
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
    <div className="relative isolate flex min-h-dvh flex-col items-center justify-center gap-7 bg-slate-50 px-5 py-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 [background-image:radial-gradient(rgb(15_23_42/0.07)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_60%_55%_at_50%_45%,black,transparent)]"
      />
      <Link to="/" aria-label="Ir al inicio" className="animate-fade-in">
        <Logo className="h-10" />
      </Link>
      <div className="w-full max-w-[440px] animate-rise-in rounded-2xl border border-slate-200 bg-white p-7 shadow-pop [animation-delay:80ms] sm:p-8">
        {children}
      </div>
      <p className="animate-fade-in text-center text-xs text-slate-400 [animation-delay:300ms]">
        ¿Problemas para entrar? Escribe a la Unidad de Gestión Legal.
      </p>
    </div>
  );
}
