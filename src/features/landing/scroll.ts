/** Shared horizontal frame so every landing section lines up and stops growing on wide screens. */
export const CONTAINER = 'mx-auto w-full max-w-[1200px] px-5 sm:px-8';

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function scrollToTop() {
  window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  history.replaceState(null, '', window.location.pathname);
}

/** Smooth-scrolls to a section; the sticky header offset comes from `scroll-margin-top` on the section. */
export function scrollToSection(id: string) {
  const section = document.getElementById(id);
  if (!section) return;
  section.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  history.replaceState(null, '', `#${id}`);
}
