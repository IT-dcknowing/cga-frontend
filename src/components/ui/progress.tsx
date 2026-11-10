import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/*
 * Barre de progression (maquette v4.1 & 04-UX-UI §6) :
 * - Hauteur 6px (.bar), pilule (rounded-full), fond track (#EDEFEA)
 * - Jauge en primary (#1E6A4E), ou accent/orange (#E5732A) si alert (.warn)
 */
type ProgressProps = ComponentProps<'div'> & {
  value: number;
  max?: number;
  alert?: boolean;
};

export function Progress({ value, max = 100, alert = false, className, ...props }: ProgressProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-track', className)}
      {...props}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-300',
          alert ? 'bg-accent' : 'bg-primary',
        )}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}

