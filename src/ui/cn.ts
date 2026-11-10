import { extendTailwindMerge } from 'tailwind-merge';

type ClassValue = string | false | null | undefined;

/*
 * Joins class names and resolves Tailwind conflicts: the LAST class wins.
 * So `cn('bg-white', 'bg-red-600')` → 'bg-red-600' and `cn('inline-flex', 'hidden')` → 'hidden'.
 * Without this, the winner depended on CSS order and caused invisible buttons and misplaced icons.
 */
const merge = extendTailwindMerge({
  extend: {
    // Custom design tokens (see @theme in index.css) so they merge with the standard ones.
    theme: {
      color: ['vino-50', 'vino-100', 'vino-200', 'vino-300', 'vino-400', 'vino-500', 'vino-600', 'vino-700', 'vino-800', 'vino-900', 'paper'],
      shadow: ['card', 'pop', 'doc'],
    },
  },
});

export function cn(...classes: ClassValue[]): string {
  return merge(classes.filter(Boolean).join(' '));
}
