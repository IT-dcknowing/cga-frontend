// Monnaie FCFA sans décimales, dates jj/mm/aaaa, fuseau Africa/Abidjan (01-PRD RG-GEN-02, 04-UX-UI §3).
const amountFormatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Africa/Abidjan',
});

const timeFormatter = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Africa/Abidjan',
});

const NO_BREAK_SPACE = String.fromCharCode(0x00a0);

/** 1234567 → « 1 234 567 » (espaces insécables). */
export function formatNumber(value: number): string {
  return amountFormatter.format(value);
}

/** 1234567 → « 1 234 567 F » (espaces insécables). */
export function formatAmount(amount: number): string {
  return `${formatNumber(amount)}${NO_BREAK_SPACE}F`;
}

/** « 2026-01-14 » (date de l'API) → « 14/01/2026 ». */
export function formatDate(isoDate: string): string {
  return dateFormatter.format(new Date(`${isoDate}T00:00:00Z`));
}

/** « 2026-01-14T09:30:00Z » (date et heure de l'API) → « 14/01/2026 », jour à Abidjan. */
export function formatTimestampDate(timestamp: string): string {
  return dateFormatter.format(new Date(timestamp));
}

/** « 2026-01-14T09:30:00Z » → « 14/01/2026 à 09:30 », heure d'Abidjan (journal, historique). */
export function formatTimestamp(timestamp: string): string {
  const moment = new Date(timestamp);

  return `${dateFormatter.format(moment)} à ${timeFormatter.format(moment)}`;
}
