import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bell,
  CircleCheck,
  FileText,
  History,
  Layers,
  Menu as MenuIcon,
  PenLine,
  ShieldCheck,
  Smartphone,
  X,
} from 'lucide-react';
import { ButtonLink, IconButton, Logo, cn, useScrollReveal } from '../../ui';
import { HeroDocument } from './HeroDocument';

const STEPS = [
  { numeral: 'I', title: 'Redacción', text: 'El gestor elige una plantilla oficial, completa los datos y agrega a los firmantes por su cédula.' },
  { numeral: 'II', title: 'Aprobación', text: 'Un supervisor revisa el documento y lo aprueba o lo devuelve con observaciones.' },
  { numeral: 'III', title: 'Firma', text: 'Cada parte firma desde el móvil o el ordenador, en el orden establecido.' },
  { numeral: 'IV', title: 'Vigencia', text: 'Avisos 30, 15, 7 y 1 día antes del vencimiento, y renovación con un clic.' },
];

const ROLES = [
  { icon: FileText, title: 'Gestores', text: 'Crean contratos desde plantillas y siguen sus firmas y renovaciones.' },
  { icon: CircleCheck, title: 'Supervisores', text: 'Aprueban o devuelven contratos y mantienen las plantillas oficiales.' },
  { icon: PenLine, title: 'Firmantes', text: 'Revisan y firman, desde cualquier dispositivo, los contratos en los que participan.' },
  { icon: Layers, title: 'Administración', text: 'Gestiona usuarios, configuración y reportes de toda la institución.' },
];

const TRUST_POINTS = [
  { icon: ShieldCheck, text: 'Firma electrónica · Ley 126-02' },
  { icon: Smartphone, text: 'Firma desde el móvil' },
  { icon: History, text: 'Registro inalterable' },
];

const AUDIT_LOG = [
  { at: '07/11/2026 10:42', event: 'FIRMA', tone: 'text-green-300', detail: 'José Rodríguez Peña · CT-2026-0039 v2' },
  { at: '04/11/2026 16:05', event: 'APROBADO', tone: 'text-green-300', detail: 'Carlos Méndez · CT-2026-0039 v2' },
  { at: '04/11/2026 09:12', event: 'DEVUELTO', tone: 'text-vino-300', detail: 'Carlos Méndez · «Ajustar anexo A»' },
  { at: '02/11/2026 14:30', event: 'CREADO', tone: 'text-slate-300', detail: 'María Fernández · plantilla Suministro' },
];

const NAV_LINKS = [
  { href: '#recorrido', label: 'Recorrido' },
  { href: '#perfiles', label: 'Perfiles' },
  { href: '#constancia', label: 'Constancia' },
];

/** Shared horizontal frame so every section lines up and stops growing on wide screens. */
const CONTAINER = 'mx-auto w-full max-w-[1200px] px-5 sm:px-8';

export function LandingPage() {
  const pageRef = useRef<HTMLDivElement>(null);
  useScrollReveal(pageRef);

  return (
    <div ref={pageRef} className="overflow-x-clip bg-white text-slate-900">
      <LandingHeader />

      <main>
        <Hero />
        <StepsSection />
        <RolesSection />
        <AuditSection />
        <ClosingCta />
      </main>

      <footer className="border-t border-slate-200">
        <div className={cn(CONTAINER, 'flex flex-col items-center gap-4 py-8 text-sm text-slate-500 sm:flex-row sm:justify-between')}>
          <Logo className="h-7" />
          <span className="text-center">Módulo de Gestión Legal Digital · © {new Date().getFullYear()}</span>
          <nav aria-label="Pie de página" className="flex gap-5">
            <Link to="/auth/login" className="hover:text-slate-900">Iniciar sesión</Link>
            <Link to="/auth/registro" className="hover:text-slate-900">Crear cuenta</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function LandingHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-30 animate-fade-in border-b transition-[background-color,border-color,box-shadow] duration-300',
        scrolled || menuOpen ? 'border-slate-200 bg-white/90 shadow-card backdrop-blur-md' : 'border-transparent bg-white/0',
      )}
    >
      <div className={cn(CONTAINER, 'flex h-16 items-center gap-6 sm:h-[72px]')}>
        <Link to="/" aria-label="SIMAUD, inicio" className="shrink-0">
          <Logo className="h-8 sm:h-9" />
        </Link>

        <nav aria-label="Secciones" className="ml-auto hidden items-center gap-7 text-[15px] font-medium text-slate-500 md:flex">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="transition-colors hover:text-slate-900">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-2">
          {/* Visibility lives on wrappers: the buttons' own display class would override `hidden`. */}
          <div className="hidden items-center gap-2 sm:flex">
            <ButtonLink to="/auth/login" variant="ghost" className="text-slate-900">
              Iniciar sesión
            </ButtonLink>
            <ButtonLink to="/auth/registro" variant="dark">
              Crear cuenta
            </ButtonLink>
          </div>
          <div className="sm:hidden">
            <ButtonLink to="/auth/login" variant="dark">
              Entrar
            </ButtonLink>
          </div>
          <div className="md:hidden">
            <IconButton
              label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={menuOpen}
              aria-controls="landing-menu"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X /> : <MenuIcon />}
            </IconButton>
          </div>
        </div>
      </div>

      {menuOpen && (
        <nav id="landing-menu" aria-label="Secciones" className="animate-pop-in border-t border-slate-200 md:hidden">
          <div className={cn(CONTAINER, 'flex flex-col py-2')}>
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-2 py-3 text-[15px] font-medium text-slate-700 hover:bg-slate-50"
              >
                {link.label}
              </a>
            ))}
            <Link
              to="/auth/registro"
              className="rounded-lg px-2 py-3 text-[15px] font-medium text-vino-600 hover:bg-slate-50 sm:hidden"
            >
              Crear cuenta
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}

function Hero() {
  return (
    <section className="relative isolate">
      <HeroBackdrop />
      <div className={cn(CONTAINER, 'grid items-center gap-14 pt-10 pb-20 sm:pt-16 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:pt-20 lg:pb-28')}>
        <div className="stagger flex min-w-0 flex-col gap-6 [--stagger-delay:80ms] [--stagger-step:90ms]">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-vino-100 bg-vino-50/70 px-3 py-1 text-xs font-semibold tracking-[0.12em] text-vino-700 uppercase">
            <span className="size-1.5 rounded-full bg-vino-600" aria-hidden="true" />
            Gestión legal digital
          </span>
          <h1 className="max-w-[13ch] text-[42px] leading-[1.04] font-semibold tracking-tight sm:text-6xl lg:text-[68px]">
            Contratos que se firman <span className="text-vino-600">sin papel.</span>
          </h1>
          <p className="max-w-[46ch] text-[17px] leading-relaxed text-slate-600 sm:text-lg">
            SIMAUD redacta cada contrato desde una plantilla aprobada, lo envía a revisión y recoge las firmas electrónicas de todas las
            partes, con constancia de quién hizo qué y cuándo.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <ButtonLink to="/auth/login" variant="dark" size="lg" className="group">
              Entrar a SIMAUD
              <ArrowRight className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </ButtonLink>
            <a
              href="#recorrido"
              className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-5 text-[15px] font-medium transition-colors hover:bg-slate-50"
            >
              Cómo funciona
            </a>
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-2 pt-2 text-[13px] text-slate-500">
            {TRUST_POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-2">
                <Icon className="size-4 text-vino-600" aria-hidden="true" />
                {text}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex min-w-0 justify-center lg:justify-end">
          <div className="pointer-events-none absolute top-1/2 left-1/2 -z-10 size-[420px] -translate-1/2 rounded-full bg-vino-200/40 blur-3xl" aria-hidden="true" />
          <div className="w-full max-w-[470px] animate-hero-doc">
            <HeroDocument />
          </div>
        </div>
      </div>
    </section>
  );
}

/** Faint dot grid that fades out towards the edges; replaces the old logo watermark. */
function HeroBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-20 [background-image:radial-gradient(rgb(15_23_42/0.09)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_70%_60%_at_60%_40%,black,transparent)]"
    />
  );
}

function StepsSection() {
  return (
    <section id="recorrido" className="scroll-mt-16 bg-slate-900 py-20 text-slate-300 sm:py-24">
      <div className={CONTAINER}>
        <div className="reveal flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-3">
            <span className="text-xs font-semibold tracking-[0.16em] text-vino-300 uppercase">Recorrido</span>
            <h2 className="max-w-[18ch] text-3xl font-semibold text-white sm:text-4xl">
              Todo contrato recorre los mismos <span className="text-vino-300">cuatro pasos.</span>
            </h2>
          </div>
          <p className="max-w-[40ch] text-[15px] leading-relaxed text-slate-400">
            El sistema no deja saltarse ninguno. Si algo cambia después de aprobado, el contrato vuelve a revisión.
          </p>
        </div>

        <ol className="reveal-stagger mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <li
              key={step.numeral}
              className="group relative flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-800/40 p-6 transition-colors hover:border-slate-700 hover:bg-slate-800/70"
            >
              <div className="flex items-center justify-between">
                <span className="font-serif text-4xl text-vino-300">{step.numeral}</span>
                <span className="font-mono text-xs text-slate-500">0{index + 1}/04</span>
              </div>
              <span className="text-lg font-semibold text-white">{step.title}</span>
              <p className="text-[15px] leading-relaxed text-slate-400">{step.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function RolesSection() {
  return (
    <section id="perfiles" className="scroll-mt-16 py-20 sm:py-24">
      <div className={CONTAINER}>
        <div className="reveal flex flex-col gap-3">
          <span className="text-xs font-semibold tracking-[0.16em] text-vino-600 uppercase">Para quién</span>
          <h2 className="max-w-[20ch] text-3xl font-semibold sm:text-4xl">Cada persona ve solo lo que le toca.</h2>
        </div>

        <div className="reveal-stagger mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ROLES.map(({ icon: Icon, title, text }) => (
            <article key={title} className="lift flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 hover:border-vino-200">
              <span className="grid size-11 place-items-center rounded-xl bg-vino-50 text-vino-600">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <div className="flex flex-col gap-1.5">
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="text-[15px] leading-relaxed text-slate-500">{text}</p>
              </div>
            </article>
          ))}
        </div>

        <ul className="reveal mt-10 flex flex-col gap-3 text-sm text-slate-600 sm:flex-row sm:flex-wrap sm:gap-x-8">
          <li className="flex items-center gap-2"><ShieldCheck className="size-4 text-vino-600" aria-hidden="true" />Permisos comprobados en el servidor</li>
          <li className="flex items-center gap-2"><Bell className="size-4 text-vino-600" aria-hidden="true" />Avisos por correo y en la aplicación</li>
          <li className="flex items-center gap-2"><FileText className="size-4 text-vino-600" aria-hidden="true" />PDF firmado descargable</li>
        </ul>
      </div>
    </section>
  );
}

function AuditSection() {
  return (
    <section id="constancia" className="scroll-mt-16">
      <div className={CONTAINER}>
        <div className="reveal grid items-center gap-10 overflow-hidden rounded-3xl bg-slate-900 p-7 text-slate-300 sm:p-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div className="flex flex-col gap-4">
            <span className="text-xs font-semibold tracking-[0.16em] text-vino-300 uppercase">Constancia</span>
            <h2 className="text-3xl font-semibold text-white sm:text-4xl">Cada firma deja rastro.</h2>
            <p className="max-w-[42ch] text-[15px] leading-relaxed text-slate-400">
              Fecha, hora, IP, dispositivo y versión exacta del documento firmado. El registro no se puede editar.
            </p>
          </div>
          <div className="min-w-0 rounded-xl border border-slate-700 bg-slate-950/60 shadow-pop">
            <div className="flex items-center gap-1.5 border-b border-slate-800 px-4 py-3" aria-hidden="true">
              <span className="size-2.5 rounded-full bg-slate-700" />
              <span className="size-2.5 rounded-full bg-slate-700" />
              <span className="size-2.5 rounded-full bg-slate-700" />
              <span className="ml-3 font-mono text-xs text-slate-500">registro · CT-2026-0039</span>
            </div>
            <div className="reveal-stagger overflow-x-auto px-4 py-3 font-mono text-[12.5px] leading-8 [--stagger-delay:250ms] [--stagger-step:180ms] sm:px-5 sm:text-[13px]">
              {AUDIT_LOG.map((entry) => (
                <div key={entry.at} className="whitespace-nowrap">
                  <span className="text-slate-500">{entry.at}</span>
                  <span className={cn('inline-block w-24 pl-3 font-semibold', entry.tone)}>{entry.event}</span>
                  <span className="text-slate-300">{entry.detail}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ClosingCta() {
  return (
    <section className="py-20 sm:py-24">
      <div className={CONTAINER}>
        <div className="reveal relative isolate flex flex-col items-start gap-8 overflow-hidden rounded-3xl border border-vino-100 bg-vino-50/60 p-8 sm:p-12 md:flex-row md:items-center md:justify-between">
          <svg viewBox="0 0 220 60" aria-hidden="true" className="pointer-events-none absolute right-4 -bottom-3 -z-10 h-24 w-auto text-vino-200/80 sm:right-10 sm:h-28">
            <path
              d="M6 44c12-26 20-30 24-17s-5 23 4 16 13-27 20-23-2 23 7 19 11-16 18-14 4 12 13 9 15-12 22-10 9 7 20 2 19-11 33-7 18 4 30-2"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </svg>
          <div className="flex flex-col gap-3">
            <h2 className="max-w-[16ch] text-3xl font-semibold sm:text-[44px] sm:leading-[1.1]">
              ¿Un contrato espera <span className="text-vino-600">tu firma?</span>
            </h2>
            <p className="max-w-[52ch] text-[15px] text-slate-600">Entra con tu correo o crea tu cuenta con tu cédula en un minuto.</p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <ButtonLink to="/auth/login" variant="dark" size="lg">Iniciar sesión</ButtonLink>
            <ButtonLink to="/auth/registro" size="lg">Crear cuenta</ButtonLink>
          </div>
        </div>
      </div>
    </section>
  );
}
