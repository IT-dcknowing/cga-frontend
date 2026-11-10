import { cn } from '@/lib/utils';

/*
 * Groupe segmenté & Sélecteur de période (maquette v4.1 & 04-UX-UI §6 « PeriodSelector ») :
 * - Conteneur sur neutral-soft (#EEF0ED), arrondi 8px, padding 3px, gap 2px (.perbar)
 * - Boutons 11.5px / font-800, padding 4x10, rayon 6px, couleur muted
 * - Bouton actif sur fond blanc (#fff), texte primary-dark, ombre portée légère (0 1px 3px rgba(0,0,0,.08))
 * - « Période » affiche deux champs date (.perrange)
 */
export function SegmentedControl<T extends string>({
  label,
  value,
  choices,
  onChange,
  className,
}: {
  /** Nom du groupe pour les lecteurs d'écran. */
  label: string;
  value: T;
  choices: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'inline-flex items-center gap-[2px] rounded-[8px] bg-neutral-soft p-[3px]',
        className,
      )}
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
              'rounded-[6px] px-2.5 py-1 text-[11.5px] font-extrabold transition-all duration-150 cursor-pointer',
              checked
                ? 'bg-card text-primary-dark shadow-[0_1px_3px_rgba(0,0,0,0.08)]'
                : 'text-muted hover:text-ink',
            )}
          >
            {choice.label}
          </button>
        );
      })}
    </div>
  );
}

export type PeriodSelectorProps<T extends string> = {
  label: string;
  value: T;
  choices: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  customPeriodKey?: T;
  startDate?: string;
  endDate?: string;
  onStartDateChange?: (date: string) => void;
  onEndDateChange?: (date: string) => void;
  className?: string;
};

export function PeriodSelector<T extends string>({
  label,
  value,
  choices,
  onChange,
  customPeriodKey,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  className,
}: PeriodSelectorProps<T>) {
  return (
    <div className={cn('inline-flex flex-wrap items-center gap-2', className)}>
      <SegmentedControl label={label} value={value} choices={choices} onChange={onChange} />
      {customPeriodKey && value === customPeriodKey ? (
        <div className="inline-flex items-center gap-1.5 text-[11.5px] text-muted">
          <span>Du</span>
          <input
            type="date"
            value={startDate ?? ''}
            onChange={(e) => onStartDateChange?.(e.target.value)}
            className="w-[124px] rounded-[6px] border border-border bg-card px-2 py-1 text-[11.5px] text-ink focus:border-primary focus:outline-1 focus:outline-primary-soft"
          />
          <span>au</span>
          <input
            type="date"
            value={endDate ?? ''}
            onChange={(e) => onEndDateChange?.(e.target.value)}
            className="w-[124px] rounded-[6px] border border-border bg-card px-2 py-1 text-[11.5px] text-ink focus:border-primary focus:outline-1 focus:outline-primary-soft"
          />
        </div>
      ) : null}
    </div>
  );
}
