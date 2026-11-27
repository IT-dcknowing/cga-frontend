/** Période proposée à l'ouverture de « Exporter », d'après la liste (année des cotisations, dates…). */
export type ExportPeriodDefault =
  | { kind: 'month'; month: string }
  | { kind: 'year'; year: string }
  | { kind: 'custom'; from: string; to: string };

/** Date du jour (aaaa-mm-jj), à l'heure du poste. */
export function todayIso(): string {
  const now = new Date();

  return [
    String(now.getFullYear()),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}
