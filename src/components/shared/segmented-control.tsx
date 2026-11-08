import { cn } from '@/lib/utils';

/*
 * Groupe segmenté (04-UX-UI §2.2 et §6 « PeriodSelector ») : un choix parmi quelques valeurs, l'actif
 * sur fond `primary-soft`. Ce n'est pas un bouton principal : il ne concurrence pas l'action de l'écran.
 */
export function SegmentedControl<T extends string>({
  label,
  value,
  choices,
  onChange,
}: {
  /** Nom du groupe pour les lecteurs d'écran. */
  label: string;
  value: T;
  choices: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex overflow-hidden rounded-control border border-border bg-card"
    >
      {choices.map((choice) => {
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
