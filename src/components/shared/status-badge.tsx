import { describeStatus, type StatusCode, type StatusDomain, type Tone } from '@/lib/status';
import { cn } from '@/lib/utils';

// 04-UX-UI §2.1 : fond doux et texte foncé de la même famille ; le statut est toujours écrit en toutes lettres.
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
        'inline-flex items-center whitespace-nowrap rounded-badge px-2 py-0.5 text-badge font-bold',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}
