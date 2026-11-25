import { describeStatus, type StatusCode, type StatusDomain, type Tone } from '@/lib/status';
import { cn } from '@/lib/utils';

/*
 * Badges de statut & tags de flux (maquette v4.1 & 04-UX-UI §2.1) :
 * - 11.5px / 700, rayon 5px (rounded-badge), padding 2x8 (px-2 py-0.5)
 * - Tons vert / orange / rouge / gris / info déduits du statut via describeStatus
 * - PlatformTag : « ⇄ e-impôts » en info-soft / info
 */
const TONE_CLASSES: Record<Tone, string> = {
  success: 'bg-primary-soft text-primary-dark',
  warning: 'bg-accent-soft text-accent-text',
  danger: 'bg-danger-soft text-danger',
  neutral: 'bg-neutral-soft text-muted',
  info: 'bg-info-soft text-info',
};

type StatusBadgeProps<D extends StatusDomain> = {
  domain: D;
  /** Code renvoyé par l'API (ex. « radiation_pending ») ; un code inconnu s'affiche tel quel, en gris. */
  status: StatusCode<D> | (string & {});
  className?: string;
};

export function StatusBadge<D extends StatusDomain>({
  domain,
  status,
  className,
}: StatusBadgeProps<D>) {
  const { tone, label } = describeStatus(domain, status);

  return (
    <span
      data-tone={tone}
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-badge px-2 py-0.5 text-[11.5px] font-bold',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}

/** Tag de flux / passerelle (« ⇄ e-impôts », « ⇄ compta-flow ») conforme maquette (.flow). */
export function PlatformTag({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-badge bg-info-soft px-2 py-0.5 text-[11.5px] font-bold text-info',
        className,
      )}
    >
      ⇄ {name}
    </span>
  );
}
