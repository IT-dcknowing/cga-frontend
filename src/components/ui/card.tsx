import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/*
 * Carte (maquette v4.1 & 04-UX-UI §6) :
 * - Carte bordée sans ombre, rayon 10px (rounded-card).
 * - En-tête 12×16 (px-4 py-3) avec titre 14px / 800 et actions à droite, séparateur border.
 * - Corps de 16px (p-4), ou flush (p-0) pour tableaux intégrés.
 */
export function Card({ className, ...props }: ComponentProps<'section'>) {
  return (
    <section
      data-slot="card"
      className={cn('overflow-hidden rounded-card border border-border bg-card', className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        'flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3',
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: ComponentProps<'h2'>) {
  return (
    <h2
      data-slot="card-title"
      className={cn('text-[14px] font-extrabold text-ink', className)}
      {...props}
    />
  );
}

export function CardActions({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-actions"
      className={cn('flex flex-wrap items-center gap-2', className)}
      {...props}
    />
  );
}

type CardContentProps = ComponentProps<'div'> & {
  /** Sans marge intérieure, pour un tableau qui touche les bords de la carte. */
  flush?: boolean;
};

export function CardContent({ className, flush = false, ...props }: CardContentProps) {
  return <div data-slot="card-content" className={cn(!flush && 'p-4', className)} {...props} />;
}
