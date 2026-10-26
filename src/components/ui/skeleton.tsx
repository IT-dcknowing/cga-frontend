import { cn } from '@/lib/utils';

// 04-UX-UI §6 (Skeleton) : blocs gris animés à la forme du contenu, jamais d'écran blanc (03-APPFLOW §7).
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      data-slot="skeleton"
      className={cn('block h-4 w-3/4 animate-pulse rounded bg-neutral-soft', className)}
    />
  );
}
