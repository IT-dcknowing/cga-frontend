import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// 04-UX-UI §6 (Form fields) : champ de 40 px (44 px sous 768 px pour la cible tactile, §4),
// rayon 6 px, bordure `danger` quand le champ est en erreur.
export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      data-slot="input"
      className={cn(
        'h-11 w-full rounded-control border border-border bg-card px-3 text-body text-ink',
        'placeholder:text-muted md:h-10',
        'aria-[invalid=true]:border-danger',
        className,
      )}
      {...props}
    />
  );
}
