import type { PortfolioChoice } from '@/features/members/api/members-api';
import { fr } from '@/lib/i18n/fr';
import { cn } from '@/lib/utils';

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
    <div
      role="radiogroup"
      aria-label={labels.selector}
      className="inline-flex overflow-hidden rounded-control border border-border bg-card"
    >
      {CHOICES.map((choice) => {
        const checked = choice.value === value;

        return (
          <button
            key={choice.value}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => {
              onChange(choice.value);
            }}
            className={cn(
              'h-11 border-l border-border px-4 text-table font-semibold first:border-l-0 md:h-10',
              checked ? 'bg-primary-soft text-primary-dark' : 'text-muted hover:bg-neutral-soft',
            )}
          >
            {choice.label}
          </button>
        );
      })}
    </div>
  );
}
