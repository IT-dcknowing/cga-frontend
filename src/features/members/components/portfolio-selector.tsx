import { SegmentedControl } from '@/components/shared/segmented-control';
import type { PortfolioChoice } from '@/features/members/api/members-api';
import { fr } from '@/lib/i18n/fr';

/*
 * Sélecteur de portefeuille (04-UX-UI §2.2) : groupe segmenté « Portefeuille CGA · Portefeuille
 * Cabinet · Tous ». Sans le droit de voir le Cabinet, seul le portefeuille CGA est proposé
 * (RG-PTF-02) et le sélecteur disparaît.
 */
const labels = fr.members.portfolio;

const CHOICES: { value: PortfolioChoice; label: string }[] = [
  { value: 'cga', label: labels.cga },
  { value: 'cabinet', label: labels.cabinet },
  { value: 'all', label: labels.all },
];

export function PortfolioSelector({
  value,
  onChange,
}: {
  value: PortfolioChoice;
  onChange: (portfolio: PortfolioChoice) => void;
}) {
  return (
    <SegmentedControl label={labels.selector} value={value} choices={CHOICES} onChange={onChange} />
  );
}
