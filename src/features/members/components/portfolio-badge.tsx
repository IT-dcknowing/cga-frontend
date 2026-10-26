import { Handshake } from 'lucide-react';
import type { Portfolio } from '@/features/members/api/members-api';
import { fr } from '@/lib/i18n/fr';
import { cn } from '@/lib/utils';

/*
 * 04-UX-UI §2.2. PortfolioBadge : contour sans fond plein (ce n'est pas un statut), « CGA » en
 * `primary`, « Cabinet » en `info`, toujours à côté du numéro du dossier. Étiquette « Accessoire n » :
 * pastille grise à bordure pointillée, sur un dossier du portefeuille CGA, quand le serveur l'a
 * renvoyée (droit « Voir les apporteurs ») ; jamais imprimée sur un document.
 */
const PORTFOLIO_CLASSES: Record<Portfolio, string> = {
  cga: 'border-primary text-primary-dark',
  cabinet: 'border-info text-info',
};

const labels = fr.members.portfolio.badge;

export function PortfolioBadge({ portfolio }: { portfolio: string }) {
  const known = portfolio === 'cga' || portfolio === 'cabinet';

  return (
    <span
      data-portfolio={portfolio}
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-badge border bg-card px-2 py-0.5 text-badge font-bold',
        known ? PORTFOLIO_CLASSES[portfolio] : 'border-border text-muted',
      )}
    >
      {known ? labels[portfolio] : portfolio}
    </span>
  );
}

export function ReferrerTag({ label }: { label: string }) {
  return (
    <span
      title={fr.members.referrerTag(label)}
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-badge border border-dashed border-border bg-neutral-soft px-2 py-0.5 text-badge font-bold text-muted"
    >
      <Handshake aria-hidden="true" className="size-3.5" />
      {label}
    </span>
  );
}
