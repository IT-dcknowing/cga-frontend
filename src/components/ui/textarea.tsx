import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/*
 * Zone de texte (maquette v4.1 & 04-UX-UI §6) :
 * - Rayon 8px (rounded-[8px]), padding 9×11, texte 13px
 * - Au focus : bordure primary et anneau 2px primary-soft
 */
export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'min-h-24 w-full rounded-[8px] border border-border bg-card px-3 py-2 text-[13px] text-ink',
        'placeholder:text-muted',
        'focus:border-primary focus:outline-2 focus:outline-primary-soft',
        'aria-[invalid=true]:border-danger',
        className,
      )}
      {...props}
    />
  );
}
