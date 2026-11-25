import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/*
 * Champ de saisie (maquette v4.1 & 04-UX-UI §6) :
 * - Rayon 8px (rounded-[8px]), padding 9×11, texte 13px
 * - Au focus : bordure primary (#1E6A4E) et anneau de 2px primary-soft (#E7F0EB)
 * - En erreur : bordure danger (#B42318)
 */
export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      data-slot="input"
      className={cn(
        'w-full rounded-[8px] border border-border bg-card px-3 py-2 text-[13px] text-ink transition-colors',
        'placeholder:text-muted',
        'focus:border-primary focus:outline-2 focus:outline-primary-soft',
        'aria-[invalid=true]:border-danger',
        className,
      )}
      {...props}
    />
  );
}
