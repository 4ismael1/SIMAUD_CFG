import { useEffect, type RefObject } from 'react';

const REVEAL_SELECTOR = '.reveal, .reveal-stagger';

/**
 * Marks `.reveal` / `.reveal-stagger` elements inside `rootRef` as `.is-visible`
 * the first time they scroll into view (CSS in index.css does the animation).
 */
export function useScrollReveal(rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const targets = Array.from(root.querySelectorAll<HTMLElement>(REVEAL_SELECTOR));
    const showAll = () => targets.forEach((target) => target.classList.add('is-visible'));

    if (typeof IntersectionObserver === 'undefined') {
      showAll();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.12 },
    );

    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, [rootRef]);
}
