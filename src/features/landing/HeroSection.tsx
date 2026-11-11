import { ArrowRight, Check, History, ShieldCheck, Smartphone } from 'lucide-react';
import { Avatar, ButtonLink, cn } from '../../ui';
import { HeroDocument } from './HeroDocument';
import { CONTAINER, scrollToSection } from './scroll';

const TRUST_POINTS = [
  { icon: ShieldCheck, text: 'Firma electrónica · Ley 126-02' },
  { icon: Smartphone, text: 'Firma desde el móvil' },
  { icon: History, text: 'Registro inalterable' },
];

export function HeroSection() {
  return (
    <section id="inicio" className="relative isolate">
      <DotGrid className="[mask-image:radial-gradient(ellipse_70%_60%_at_65%_35%,black,transparent)]" />
      <div className={cn(CONTAINER, 'grid items-center gap-16 pt-10 pb-20 sm:pt-16 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-12 lg:pt-20 lg:pb-28')}>
        <div className="stagger flex min-w-0 flex-col gap-6 [--stagger-delay:60ms] [--stagger-step:90ms]">
          <h1 className="max-w-[13ch] text-[42px] leading-[1.04] font-semibold tracking-tight sm:text-6xl lg:text-[68px]">
            Contratos que se firman <span className="text-vino-600">sin papel.</span>
          </h1>
          <p className="max-w-[46ch] text-[17px] leading-relaxed text-slate-600 sm:text-lg">
            SIMAUD redacta cada contrato desde una plantilla aprobada, lo envía a revisión y recoge las firmas electrónicas de todas las
            partes, con constancia de quién hizo qué y cuándo.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <ButtonLink to="/auth/login" variant="dark" size="lg" className="group shadow-[0_8px_20px_rgb(15_23_42/0.18)]">
              Entrar a SIMAUD
              <ArrowRight className="transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
            </ButtonLink>
            <a
              href="#recorrido"
              onClick={(event) => {
                event.preventDefault();
                scrollToSection('recorrido');
              }}
              className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-5 text-[15px] font-medium transition-colors hover:border-slate-400 hover:bg-slate-50"
            >
              Cómo funciona
            </a>
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-2 pt-1 text-[13px] text-slate-500">
            {TRUST_POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-1.5">
                <Icon className="size-4 text-vino-600" aria-hidden="true" />
                {text}
              </li>
            ))}
          </ul>
        </div>

        <HeroVisual />
      </div>
    </section>
  );
}

function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-[470px] lg:mr-0" aria-hidden="true">
      <div className="pointer-events-none absolute top-1/2 left-1/2 -z-10 size-[440px] -translate-1/2 rounded-full bg-vino-200/45 blur-3xl" />
      <div className="animate-hero-doc">
        <HeroDocument />
      </div>

      {/* Floating status cards; hidden on phones where they would cover the document. */}
      <div className="absolute -top-6 -left-10 hidden animate-rise-in [animation-delay:1.3s] sm:block lg:-left-16">
        <div className="flex animate-float items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-pop [animation-delay:2s]">
          <span className="grid size-8 place-items-center rounded-full bg-green-50 text-green-700">
            <Check className="size-4" />
          </span>
          <span className="text-[13px] leading-tight">
            <b className="block font-semibold">José Rodríguez firmó</b>
            <span className="text-slate-500">CT-2026-0039 · hace 2 min</span>
          </span>
        </div>
      </div>

      <div className="absolute -right-4 -bottom-20 hidden animate-rise-in [animation-delay:1.6s] sm:block lg:-right-12">
        <div className="flex w-56 animate-float flex-col gap-2.5 rounded-xl border border-slate-200 bg-white p-3.5 shadow-pop [animation-delay:3s]">
          <div className="flex items-center justify-between text-[13px]">
            <span className="font-semibold">Firmas</span>
            <span className="font-mono text-xs text-slate-500">2 de 3</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full w-2/3 origin-left animate-[grow-x_1.2s_1.9s_var(--ease-out-expo)_both] rounded-full bg-vino-600" />
          </div>
          <div className="flex items-center">
            <Avatar name="José Rodríguez" size="sm" className="ring-2 ring-white" />
            <Avatar name="Carlos Méndez" size="sm" className="-ml-2 ring-2 ring-white" />
            <Avatar name="Laura Santos" size="sm" tone="muted" className="-ml-2 ring-2 ring-white" />
            <span className="ml-2 text-xs text-slate-500">Falta Laura</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Faint dot grid used as a section backdrop. */
export function DotGrid({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-0 -z-20 [background-image:radial-gradient(rgb(15_23_42/0.09)_1px,transparent_1px)] [background-size:22px_22px]',
        className,
      )}
    />
  );
}
