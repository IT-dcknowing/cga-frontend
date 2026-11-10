import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/*
 * Sélecteur (maquette v4.1 & 04-UX-UI §6) :
 * - Rayon 8px (rounded-[8px]), padding 9×11, texte 13px (ou variante mini 12px/700 rayon 6px)
 * - Au focus : bordure primary et anneau 2px primary-soft
 */
export function Select({
  className,
  mini = false,
  ...props
}: ComponentProps<'select'> & { mini?: boolean }) {
  return (
    <select
      data-slot="select"
      className={cn(
        mini
          ? 'w-auto rounded-[6px] border border-border bg-card px-2 py-1 text-[12px] font-bold text-ink'
          : 'w-full rounded-[8px] border border-border bg-card px-3 py-2 text-[13px] text-ink',
        'focus:border-primary focus:outline-2 focus:outline-primary-soft',
        'aria-[invalid=true]:border-danger disabled:opacity-50 cursor-pointer',
        className,
      )}
      {...props}
    />
  );
}
