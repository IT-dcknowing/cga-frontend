import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// 04-UX-UI §6 (Form fields) : même bordure, rayon et état d'erreur que `Input`.
export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'min-h-24 w-full rounded-control border border-border bg-card px-3 py-2 text-body text-ink',
        'placeholder:text-muted aria-[invalid=true]:border-danger',
        className,
      )}
      {...props}
    />
  );
}
