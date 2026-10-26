import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// 04-UX-UI §6 : liste déroulante native, à la hauteur et à la bordure de `Input` ; le navigateur
// fournit le clavier et le sélecteur adapté au téléphone.
export function Select({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      data-slot="select"
      className={cn(
        'h-11 w-full rounded-control border border-border bg-card px-3 text-body text-ink md:h-10',
        'aria-[invalid=true]:border-danger disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
