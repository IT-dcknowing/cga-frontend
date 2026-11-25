import { useState } from 'react';
import type { PeriodQuery, StatPeriod, Variation } from '@/features/statistics/api/statistics-api';
import { formatDate, formatNumber, formatRate } from '@/lib/format';
import { fr } from '@/lib/i18n/fr';

/*
 * Présentation des chiffres des tableaux de bord et statistiques (04-UX-UI §3 et §6 « PeriodSelector ») :
 * libellé de la période (« octobre 2026 »), évolution sur un an, période demandée.
 */
const labels = fr.statistics;

const dayFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const monthFormatter = new Intl.DateTimeFormat('fr-FR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** Période renvoyée par le serveur → « 14 janvier 2026 », « octobre 2026 », « 2026 », « du … au … ». */
export function periodLabel(period: StatPeriod): string {
  const from = new Date(`${period.from}T00:00:00Z`);

  switch (period.type) {
    case 'day':
      return dayFormatter.format(from);
    case 'month':
      return monthFormatter.format(from);
    case 'year':
      return String(from.getUTCFullYear());
    default:
      return labels.period.custom(formatDate(period.from), formatDate(period.to));
  }
}

/** Évolution sur un an : « +12 % sur un an », « Stable », ou rien à comparer. */
export function variationLabel(variation: Variation): string {
  if (variation.change_pct === null) {
    return labels.variation.none;
  }
  if (variation.change_pct === 0) {
    return labels.variation.same;
  }
  // Une décimale au plus : « +12,7 % ».
  const value = formatRate(Math.abs(variation.change_pct) / 100);

  return variation.change_pct > 0 ? labels.variation.up(value) : labels.variation.down(`-${value}`);
}

/** Période affichée par un écran : le mois en cours par défaut (F-DSH-04). */
export function usePeriodQuery() {
  return useState<PeriodQuery>({ period: 'month' });
}

/** Nombre entier ou tiret quand la valeur manque. */
export function countOf(value: number | null | undefined): string {
  return value === null || value === undefined ? labels.position.none : formatNumber(value);
}
