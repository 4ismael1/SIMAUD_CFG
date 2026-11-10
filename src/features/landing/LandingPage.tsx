import { Link } from 'react-router-dom';
import { ArrowRight, Bell, CircleCheck, FileText, Layers, PenLine, ShieldCheck } from 'lucide-react';
import { ButtonLink, Logo } from '../../ui';
import logoMark from '../../assets/logo-columna.png';
import { HeroDocument } from './HeroDocument';

const STEPS = [
  { numeral: 'I', title: 'Redacción', text: 'El gestor elige una plantilla oficial, completa los datos y agrega a los firmantes por su cédula.' },
  { numeral: 'II', title: 'Aprobación', text: 'Un supervisor revisa el documento y lo aprueba o lo devuelve con observaciones.' },
  { numeral: 'III', title: 'Firma', text: 'Cada parte firma desde el móvil o el ordenador, en el orden establecido.' },
  { numeral: 'IV', title: 'Vigencia', text: 'Avisos 30, 15, 7 y 1 día antes del vencimiento, y renovación con un clic.' },
];

const ROLES = [
  { icon: FileText, title: 'Gestores', text: 'Crean contratos y siguen sus firmas y renovaciones.' },
  { icon: CircleCheck, title: 'Supervisores', text: 'Aprueban o devuelven contratos y mantienen las plantillas.' },
  { icon: PenLine, title: 'Firmantes', text: 'Revisan y firman los contratos en los que participan.' },
  { icon: Layers, title: 'Administración', text: 'Gestiona usuarios, configuración y reportes de toda la institución.' },
];

const AUDIT_LOG = [
  { at: '07/11/2026 10:42', event: 'FIRMA', tone: 'text-green-300', detail: 'José Rodríguez Peña · CT-2026-0039 v2' },
  { at: '04/11/2026 16:05', event: 'APROBADO', tone: 'text-green-300', detail: 'Carlos Méndez · CT-2026-0039 v2' },
  { at: '04/11/2026 09:12', event: 'DEVUELTO', tone: 'text-vino-300', detail: 'Carlos Méndez · «Ajustar anexo A»' },
  { at: '02/11/2026 14:30', event: 'CREADO', tone: 'text-slate-300', detail: 'María Fernández · plantilla Suministro' },
];

const SECTION_X = 'px-5 sm:px-10 lg:px-20';

export function LandingPage() {
  return (
    <div className="bg-white text-slate-900">
      <header className={`flex flex-wrap items-center gap-x-8 gap-y-3 py-5 ${SECTION_X}`}>
        <Logo className="h-10" />
        <nav aria-label="Secciones" className="order-3 flex w-full gap-6 text-[15px] font-medium text-slate-500 md:order-none md:ml-auto md:w-auto">
          <a href="#recorrido" className="hover:text-slate-900">Recorrido</a>
          <a href="#expediente" className="hover:text-slate-900">Expediente</a>
          <a href="#constancia" className="hover:text-slate-900">Constancia</a>
        </nav>
        <div className="ml-auto flex gap-2 md:ml-0">
          <ButtonLink to="/auth/login" variant="ghost" className="text-slate-900">Iniciar sesión</ButtonLink>
          <ButtonLink to="/auth/registro" variant="dark">Crear cuenta</ButtonLink>
        </div>
      </header>

      <section className={`relative flex flex-wrap items-center gap-12 overflow-hidden pt-8 pb-20 ${SECTION_X}`}>
        <div className="relative z-10 flex min-w-0 flex-[1_1_480px] flex-col gap-6">
          <span className="text-xs font-semibold tracking-[0.16em] text-vino-600 uppercase">Módulo de gestión legal digital</span>
          <h1 className="max-w-[13ch] text-[44px] leading-[1.03] font-semibold tracking-tight sm:text-6xl lg:text-7xl">
            Contratos que se firman <span className="text-vino-600">sin papel.</span>
          </h1>
          <p className="max-w-[46ch] text-lg text-slate-500">
            SIMAUD redacta cada contrato desde una plantilla aprobada, lo envía a revisión y recoge las firmas electrónicas de todas las
            partes, con constancia de quién hizo qué y cuándo.
          </p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink to="/auth/login" variant="dark" size="lg">
              Entrar a SIMAUD <ArrowRight aria-hidden="true" />
            </ButtonLink>
            <a href="#recorrido" className="inline-flex h-11 items-center rounded-lg border border-slate-300 px-5 text-[15px] font-medium hover:bg-slate-50">
              Cómo funciona
            </a>
          </div>
        </div>
        <div className="relative flex min-w-0 flex-[1_1_440px] justify-center py-6">
          <img src={logoMark} alt="" aria-hidden="true" className="pointer-events-none absolute -top-8 -right-10 h-[540px] w-auto opacity-[0.06]" />
          <HeroDocument />
        </div>
      </section>

      <section id="recorrido" className={`relative overflow-hidden bg-slate-900 py-16 text-slate-300 ${SECTION_X}`}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="max-w-[18ch] text-3xl font-semibold text-white sm:text-4xl">
            Todo contrato recorre los mismos <span className="text-vino-300">cuatro pasos.</span>
          </h2>
          <p className="max-w-[40ch]">El sistema no deja saltarse ninguno. Si algo cambia después de aprobado, el contrato vuelve a revisión.</p>
        </div>
        <ol className="mt-10 grid gap-0 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <li
              key={step.numeral}
              className={`flex flex-col gap-3 border-t border-slate-700 py-6 sm:pr-6 ${index > 0 ? 'lg:border-l lg:pl-6' : ''} ${index % 2 === 1 ? 'sm:border-l sm:pl-6 lg:border-l' : ''}`}
            >
              <span className="text-4xl font-medium text-vino-300">{step.numeral}</span>
              <span className="text-lg font-medium text-white">{step.title}</span>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="expediente" className={`py-20 ${SECTION_X}`}>
        <div className="flex flex-col gap-3">
          <span className="text-xs font-semibold tracking-[0.16em] text-vino-600 uppercase">Para quién</span>
          <h2 className="max-w-[20ch] text-3xl font-semibold sm:text-4xl">Cada persona ve solo lo que le toca.</h2>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {ROLES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-6">
              <span className="grid size-11 place-items-center rounded-xl bg-vino-50 text-vino-600">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <h3 className="text-lg font-semibold">{title}</h3>
              <p className="text-sm text-slate-500">{text}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-sm text-slate-600">
          <span className="flex items-center gap-2"><ShieldCheck className="size-4 text-vino-600" aria-hidden="true" />Permisos comprobados en el servidor</span>
          <span className="flex items-center gap-2"><Bell className="size-4 text-vino-600" aria-hidden="true" />Avisos por correo y en la aplicación</span>
          <span className="flex items-center gap-2"><FileText className="size-4 text-vino-600" aria-hidden="true" />PDF firmado descargable</span>
        </div>
      </section>

      <section id="constancia" className="px-5 sm:px-10 lg:px-20">
        <div className="relative flex flex-wrap items-center gap-10 overflow-hidden rounded-3xl bg-slate-900 p-7 text-slate-300 sm:p-12">
          <div className="flex flex-[1_1_320px] flex-col gap-4">
            <span className="text-xs font-semibold tracking-[0.16em] text-vino-300 uppercase">Constancia</span>
            <h2 className="text-3xl font-semibold text-white sm:text-4xl">Cada firma deja rastro.</h2>
            <p className="max-w-[42ch]">Fecha, hora, IP, dispositivo y versión exacta del documento firmado. El registro no se puede editar.</p>
          </div>
          <div className="min-w-0 flex-[1_1_480px] overflow-x-auto rounded-xl border border-slate-700 bg-slate-800 px-5 py-4 font-mono text-[13px] leading-8">
            {AUDIT_LOG.map((entry) => (
              <div key={entry.at} className="whitespace-nowrap">
                <span className="text-slate-500">{entry.at}</span>{'  '}
                <span className={`inline-block w-24 ${entry.tone}`}>{entry.event}</span>
                {entry.detail}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={`flex flex-wrap items-center justify-between gap-8 py-24 ${SECTION_X}`}>
        <div className="flex items-center gap-6">
          <img src={logoMark} alt="" aria-hidden="true" className="hidden h-24 w-auto sm:block" />
          <h2 className="max-w-[15ch] text-4xl font-semibold sm:text-5xl">
            ¿Un contrato espera <span className="text-vino-600">tu firma?</span>
          </h2>
        </div>
        <div className="flex flex-wrap gap-3">
          <ButtonLink to="/auth/login" variant="dark" size="lg">Iniciar sesión</ButtonLink>
          <ButtonLink to="/auth/registro" size="lg">Crear cuenta</ButtonLink>
        </div>
      </section>

      <footer className={`flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 py-7 text-sm text-slate-500 ${SECTION_X}`}>
        <Logo className="h-7" />
        <span>Módulo de Gestión Legal Digital · © {new Date().getFullYear()}</span>
        <Link to="/auth/login" className="hover:text-slate-900">Acceso</Link>
      </footer>
    </div>
  );
}
