import type { ReactNode } from 'react';
import { fr } from '@/lib/i18n/fr';

export type KeyValueItem = {
  label: string;
  /** `null` : la valeur n'est pas renseignée. */
  value: ReactNode | null;
};

/**
 * Contenu d'une fiche (04-UX-UI §7) : grille de 2 colonnes clé / valeur, étiquette `muted` à gauche,
 * valeur en 600 à droite, séparateur `border` ; une seule colonne sur mobile.
 */
export function KeyValueList({ items }: { items: KeyValueItem[] }) {
  return (
    <dl className="grid md:grid-cols-2 md:gap-x-8">
      {items.map(({ label, value }) => (
        <div
          key={label}
          className="flex items-baseline justify-between gap-4 border-b border-border py-2.5"
        >
          <dt className="text-label text-muted">{label}</dt>
          <dd className="text-right font-semibold">
            {value === null || value === '' ? (
              <span className="font-normal text-muted">{fr.common.notProvided}</span>
            ) : (
              value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
