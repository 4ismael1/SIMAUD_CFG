import { useId, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown, Search } from 'lucide-react';
import { Badge, ButtonLink, Logo, cn } from '../../ui';
import { ASSURANCES, AUDIT_LOG, FAQ, NAV_LINKS, ROLES, STEPS, VALUE_POINTS } from './landing-data';
import { CONTAINER, scrollToSection } from './scroll';

function Eyebrow({ children, dark }: { children: string; dark?: boolean }) {
  return (
    <span className={cn('text-xs font-semibold tracking-[0.16em] uppercase', dark ? 'text-vino-300' : 'text-vino-600')}>{children}</span>
  );
}

export function ValueStrip() {
  return (
    <section aria-label="Lo esencial" className="border-y border-slate-200 bg-slate-50/70">
      <ul className={cn(CONTAINER, 'reveal-stagger grid gap-px py-2 sm:grid-cols-2 lg:grid-cols-4')}>
        {VALUE_POINTS.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex gap-3.5 px-1 py-5 sm:px-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-vino-600 shadow-card">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="font-semibold">{title}</span>
              <span className="text-[13.5px] leading-snug text-slate-500">{text}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function StepsSection() {
  return (
    <section id="recorrido" className="relative isolate scroll-mt-16 overflow-hidden bg-slate-900 py-20 text-slate-300 sm:scroll-mt-[72px] sm:py-28">
      <div aria-hidden="true" className="pointer-events-none absolute -top-40 right-0 -z-10 size-[520px] rounded-full bg-vino-600/20 blur-3xl" />
      <div className={CONTAINER}>
        <div className="reveal flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-3">
            <Eyebrow dark>Recorrido</Eyebrow>
            <h2 className="max-w-[18ch] text-3xl font-semibold text-white sm:text-[42px] sm:leading-[1.1]">
              Todo contrato recorre los mismos <span className="text-vino-300">cuatro pasos.</span>
            </h2>
          </div>
          <p className="max-w-[40ch] text-[15px] leading-relaxed text-slate-400">
            El sistema no deja saltarse ninguno. Si algo cambia después de aprobado, el contrato vuelve a revisión.
          </p>
        </div>

        <div className="reveal relative mt-14">
          {/* Progress rail that fills once the steps scroll into view (desktop only). */}
          <div aria-hidden="true" className="absolute top-6 right-[12.5%] left-[12.5%] hidden h-px bg-slate-700 lg:block">
            <div className="step-rail h-full origin-left bg-gradient-to-r from-vino-400 to-vino-300" />
          </div>
          <ol className="reveal-stagger grid gap-4 [--stagger-delay:150ms] [--stagger-step:140ms] sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
            {STEPS.map((step) => (
              <li key={step.numeral} className="relative flex flex-col items-start gap-4 lg:items-center lg:text-center">
                <span className="relative grid size-12 place-items-center rounded-full border border-slate-700 bg-slate-900 text-vino-300 shadow-[0_0_0_6px_rgb(15_23_42)]">
                  <step.icon className="size-5" aria-hidden="true" />
                  <span className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-vino-600 font-serif text-[10px] font-bold text-white">
                    {step.numeral}
                  </span>
                </span>
                <div className="flex w-full flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-800/40 p-5 transition-colors hover:border-slate-700 hover:bg-slate-800/70 lg:items-center">
                  <span className="text-lg font-semibold text-white">{step.title}</span>
                  <p className="text-[14.5px] leading-relaxed text-slate-400">{step.text}</p>
                  <Badge tone={step.chip.tone} className="mt-auto">{step.chip.label}</Badge>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

export function RolesSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const baseId = useId();
  const active = ROLES[activeIndex];

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const delta = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0;
    if (delta === 0) return;
    event.preventDefault();
    const next = (activeIndex + delta + ROLES.length) % ROLES.length;
    setActiveIndex(next);
    document.getElementById(`${baseId}-tab-${next}`)?.focus();
  }

  return (
    <section id="perfiles" className="scroll-mt-16 py-20 sm:scroll-mt-[72px] sm:py-28">
      <div className={CONTAINER}>
        <div className="reveal flex flex-col gap-3">
          <Eyebrow>Para quién</Eyebrow>
          <h2 className="max-w-[20ch] text-3xl font-semibold sm:text-[42px] sm:leading-[1.1]">Cada persona ve solo lo que le toca.</h2>
        </div>

        <div className="reveal mt-12 grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-10">
          <div role="tablist" aria-label="Perfiles" aria-orientation="vertical" onKeyDown={handleKeyDown} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0 [&::-webkit-scrollbar]:hidden">
            {ROLES.map((role, index) => {
              const selected = index === activeIndex;
              return (
                <button
                  key={role.id}
                  id={`${baseId}-tab-${index}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`${baseId}-panel`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActiveIndex(index)}
                  className={cn(
                    'group flex shrink-0 items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all duration-200 lg:items-start lg:gap-4 lg:p-5',
                    selected
                      ? 'border-vino-200 bg-white shadow-pop'
                      : 'border-transparent bg-slate-50 hover:border-slate-200 hover:bg-white lg:bg-transparent',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-10 shrink-0 place-items-center rounded-lg transition-colors',
                      selected ? 'bg-vino-600 text-white' : 'bg-vino-50 text-vino-600',
                    )}
                  >
                    <role.icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="font-semibold whitespace-nowrap">{role.title}</span>
                    <span className="hidden text-sm leading-snug text-slate-500 lg:block">{role.summary}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div
            id={`${baseId}-panel`}
            role="tabpanel"
            aria-labelledby={`${baseId}-tab-${activeIndex}`}
            className="relative isolate overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-6"
          >
            <div aria-hidden="true" className="pointer-events-none absolute -right-20 -bottom-24 -z-10 size-72 rounded-full bg-vino-100/70 blur-3xl" />
            {/* Keyed by role so the preview replays its entrance on every switch. */}
            <div key={active.id} className="flex flex-col gap-5">
              <ul className="stagger flex flex-wrap gap-2 [--stagger-step:50ms]">
                {active.abilities.map((ability) => (
                  <li key={ability} className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-[13px] text-slate-700">
                    <Check className="size-3.5 text-vino-600" aria-hidden="true" />
                    {ability}
                  </li>
                ))}
              </ul>

              <div className="animate-rise-in overflow-hidden rounded-xl border border-slate-200 bg-white shadow-pop" aria-hidden="true">
                <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
                  <Logo variant="mark" className="h-6" />
                  <span className="font-semibold">{active.preview.heading}</span>
                  <span className="ml-auto hidden items-center gap-1.5 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-400 sm:flex">
                    <Search className="size-3.5" />
                    Buscar…
                  </span>
                </div>
                <ul className="stagger divide-y divide-slate-100 [--stagger-delay:120ms] [--stagger-step:80ms]">
                  {active.preview.rows.map((row) => (
                    <li key={row.title} className="flex items-center gap-3 px-4 py-3.5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{row.title}</span>
                        <span className="block truncate text-xs text-slate-500">{row.meta}</span>
                      </span>
                      <Badge tone={row.badge.tone}>{row.badge.label}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>

        <ul className="reveal mt-10 flex flex-col gap-3 text-sm text-slate-600 sm:flex-row sm:flex-wrap sm:gap-x-8">
          {ASSURANCES.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-2">
              <Icon className="size-4 text-vino-600" aria-hidden="true" />
              {text}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function AuditSection() {
  return (
    <section id="constancia" className="scroll-mt-20 sm:scroll-mt-24">
      <div className={CONTAINER}>
        <div className="reveal relative isolate grid items-center gap-10 overflow-hidden rounded-3xl bg-slate-900 p-6 text-slate-300 sm:p-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -left-24 -z-10 size-96 rounded-full bg-vino-600/20 blur-3xl" />
          <div className="flex flex-col gap-4">
            <Eyebrow dark>Constancia</Eyebrow>
            <h2 className="text-3xl font-semibold text-white sm:text-4xl">Cada firma deja rastro.</h2>
            <p className="max-w-[42ch] text-[15px] leading-relaxed text-slate-400">
              Fecha, hora, IP, dispositivo y versión exacta del documento firmado. El registro no se puede editar.
            </p>
          </div>

          <div className="min-w-0 overflow-hidden rounded-xl border border-slate-700/80 bg-slate-950/70 shadow-pop">
            <div className="flex items-center gap-1.5 border-b border-slate-800 px-4 py-3" aria-hidden="true">
              <span className="size-2.5 rounded-full bg-slate-700" />
              <span className="size-2.5 rounded-full bg-slate-700" />
              <span className="size-2.5 rounded-full bg-slate-700" />
              <span className="ml-3 truncate font-mono text-xs text-slate-500">registro · CT-2026-0039</span>
            </div>
            {/* No horizontal scroll: on narrow screens each entry wraps onto two lines. */}
            <ol className="audit-log flex flex-col gap-3 px-4 py-4 font-mono text-[12.5px] leading-relaxed sm:gap-2 sm:px-5 sm:text-[13px]">
              {AUDIT_LOG.map((entry) => (
                <li key={entry.at} className="grid grid-cols-[auto_1fr] gap-x-3 sm:grid-cols-[auto_6.5rem_1fr]">
                  <span className="text-slate-500">{entry.at}</span>
                  <span className={cn('font-semibold', entry.tone)}>{entry.event}</span>
                  <span className="col-span-2 text-slate-300 sm:col-span-1">{entry.detail}</span>
                </li>
              ))}
              <li aria-hidden="true" className="flex items-center gap-2 text-slate-500">
                <span className="text-green-300">$</span>
                <span className="audit-cursor inline-block h-4 w-2 bg-slate-400" />
              </li>
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}

export function FaqSection() {
  return (
    <section id="preguntas" className="scroll-mt-16 py-20 sm:scroll-mt-[72px] sm:py-28">
      <div className={cn(CONTAINER, 'grid gap-10 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] lg:gap-16')}>
        <div className="reveal flex flex-col gap-3 lg:sticky lg:top-28 lg:self-start">
          <Eyebrow>Preguntas frecuentes</Eyebrow>
          <h2 className="text-3xl font-semibold sm:text-[42px] sm:leading-[1.1]">Lo que suelen preguntarnos.</h2>
          <p className="max-w-[38ch] text-[15px] leading-relaxed text-slate-500">
            ¿Tienes otra duda? Escribe a la Unidad de Gestión Legal y te ayudamos.
          </p>
        </div>
        <div className="reveal-stagger flex flex-col gap-3 [--stagger-step:70ms]">
          {FAQ.map((item) => (
            <details key={item.question} className="faq-item group rounded-xl border border-slate-200 bg-white transition-colors open:border-slate-300 open:shadow-card hover:border-slate-300">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-semibold [&::-webkit-details-marker]:hidden">
                {item.question}
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500 transition-transform duration-300 group-open:rotate-180 group-open:bg-vino-50 group-open:text-vino-600">
                  <ChevronDown className="size-4" aria-hidden="true" />
                </span>
              </summary>
              <p className="faq-answer px-5 pb-5 text-[15px] leading-relaxed text-slate-600">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ClosingCta() {
  return (
    <section className="pb-20 sm:pb-28">
      <div className={CONTAINER}>
        <div className="reveal relative isolate flex flex-col items-start gap-8 overflow-hidden rounded-3xl border border-vino-100 bg-gradient-to-br from-vino-50 via-white to-vino-50/40 p-8 sm:p-12 md:flex-row md:items-center md:justify-between">
          <svg viewBox="0 0 220 60" aria-hidden="true" className="cta-signature pointer-events-none absolute right-4 -bottom-3 -z-10 h-24 w-auto text-vino-200 sm:right-10 sm:h-28">
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

export function LandingFooter() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50/60">
      <div className={cn(CONTAINER, 'grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]')}>
        <div className="flex flex-col gap-3">
          <Logo className="h-8 w-fit" />
          <p className="max-w-[36ch] text-sm leading-relaxed text-slate-500">
            Módulo de Gestión Legal Digital para redactar, aprobar y firmar los contratos de la institución.
          </p>
        </div>
        <nav aria-label="Secciones del pie" className="flex flex-col gap-2.5 text-sm">
          <span className="font-semibold text-slate-900">Conoce SIMAUD</span>
          {NAV_LINKS.map((link) => (
            <a
              key={link.id}
              href={`#${link.id}`}
              onClick={(event) => {
                event.preventDefault();
                scrollToSection(link.id);
              }}
              className="w-fit text-slate-500 transition-colors hover:text-slate-900"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <nav aria-label="Acceso" className="flex flex-col gap-2.5 text-sm">
          <span className="font-semibold text-slate-900">Acceso</span>
          <Link to="/auth/login" className="w-fit text-slate-500 transition-colors hover:text-slate-900">Iniciar sesión</Link>
          <Link to="/auth/registro" className="w-fit text-slate-500 transition-colors hover:text-slate-900">Crear cuenta</Link>
          <Link to="/auth/recuperar" className="w-fit text-slate-500 transition-colors hover:text-slate-900">Recuperar contraseña</Link>
        </nav>
      </div>
      <div className="border-t border-slate-200">
        <div className={cn(CONTAINER, 'flex flex-col gap-2 py-5 text-xs text-slate-400 sm:flex-row sm:justify-between')}>
          <span>© {new Date().getFullYear()} SIMAUD-LEX · Unidad de Gestión Legal</span>
          <span>Firma electrónica conforme a la Ley 126-02</span>
        </div>
      </div>
    </footer>
  );
}
