import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Jetons de index.css : sans eux, `text-body` (taille) et `text-ink` (couleur) passeraient pour deux
// couleurs en conflit et l'une serait supprimée.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: [
        'primary',
        'primary-dark',
        'primary-soft',
        'accent',
        'accent-text',
        'accent-soft',
        'danger',
        'danger-soft',
        'info',
        'info-soft',
        'ink',
        'muted',
        'border',
        'bg',
        'card',
        'neutral-soft',
      ],
      text: [
        'page-title',
        'card-title',
        'overline',
        'body',
        'table',
        'label',
        'note',
        'kpi',
        'badge',
      ],
      radius: ['control', 'card', 'badge'],
      shadow: ['card'],
    },
  },
});

/** Combine des classes Tailwind ; en cas de conflit, la dernière l'emporte. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
