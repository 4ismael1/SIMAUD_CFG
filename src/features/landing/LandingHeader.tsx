import { useEffect, useState, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { Menu as MenuIcon, X } from 'lucide-react';
import { ButtonLink, IconButton, Logo, cn } from '../../ui';
import { NAV_LINKS } from './landing-data';
import { CONTAINER, scrollToSection, scrollToTop } from './scroll';

export function LandingHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const activeId = useActiveSection(NAV_LINKS.map((link) => link.id));

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function handleLogoClick(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    setMenuOpen(false);
    scrollToTop();
  }

  function handleSectionClick(event: MouseEvent<HTMLAnchorElement>, id: string) {
    event.preventDefault();
    setMenuOpen(false);
    scrollToSection(id);
  }

  return (
    <header
      className={cn(
        'sticky top-0 z-30 border-b transition-[background-color,border-color,box-shadow] duration-300',
        scrolled || menuOpen ? 'border-slate-200/80 bg-white/85 shadow-card backdrop-blur-md' : 'border-transparent bg-transparent',
      )}
    >
      <div className={cn(CONTAINER, 'flex h-16 items-center gap-6 sm:h-[72px]')}>
        <a href="#inicio" onClick={handleLogoClick} aria-label="SIMAUD, volver al inicio" className="shrink-0 rounded-md transition-opacity hover:opacity-80">
          <Logo className="h-8 sm:h-9" />
        </a>

        <nav aria-label="Secciones" className="ml-auto hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => {
            const active = activeId === link.id;
            return (
              <a
                key={link.id}
                href={`#${link.id}`}
                onClick={(event) => handleSectionClick(event, link.id)}
                aria-current={active ? 'location' : undefined}
                className={cn(
                  'relative rounded-lg px-3 py-2 text-[15px] font-medium transition-colors',
                  active ? 'text-slate-900' : 'text-slate-500 hover:text-slate-900',
                )}
              >
                {link.label}
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute inset-x-3 -bottom-0.5 h-0.5 origin-left rounded-full bg-vino-600 transition-transform duration-300',
                    active ? 'scale-x-100' : 'scale-x-0',
                  )}
                />
              </a>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-3">
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

      <div
        id="landing-menu"
        className={cn(
          'grid overflow-hidden transition-[grid-template-rows,opacity] duration-300 ease-out md:hidden',
          menuOpen ? 'grid-rows-[1fr] opacity-100' : 'pointer-events-none grid-rows-[0fr] opacity-0',
        )}
      >
        <nav aria-label="Secciones" className="min-h-0">
          <div className={cn(CONTAINER, 'flex flex-col border-t border-slate-200 py-2')}>
            {NAV_LINKS.map((link) => (
              <a
                key={link.id}
                href={`#${link.id}`}
                tabIndex={menuOpen ? 0 : -1}
                onClick={(event) => handleSectionClick(event, link.id)}
                className={cn(
                  'rounded-lg px-2 py-3 text-[15px] font-medium hover:bg-slate-50',
                  activeId === link.id ? 'text-vino-600' : 'text-slate-700',
                )}
              >
                {link.label}
              </a>
            ))}
            <Link
              to="/auth/registro"
              tabIndex={menuOpen ? 0 : -1}
              className="mt-1 rounded-lg border-t border-slate-100 px-2 py-3 text-[15px] font-semibold text-vino-600 hover:bg-slate-50 sm:hidden"
            >
              Crear cuenta
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}

/** Returns the id of the section currently under the header (scroll-spy). */
function useActiveSection(ids: readonly string[]) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const key = ids.join(',');

  useEffect(() => {
    const sections = key
      .split(',')
      .map((id) => document.getElementById(id))
      .filter((section): section is HTMLElement => section !== null);

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length > 0) setActiveId(visible[0].target.id);
      },
      // A thin band near the top of the viewport decides which section is "current".
      { rootMargin: '-35% 0px -60% 0px' },
    );
    sections.forEach((section) => observer.observe(section));

    const clearAtTop = () => {
      if (window.scrollY < 200) setActiveId(null);
    };
    window.addEventListener('scroll', clearAtTop, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', clearAtTop);
    };
  }, [key]);

  return activeId;
}
