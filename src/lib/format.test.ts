import { describe, expect, it } from 'vitest';
import {
  formatAmount,
  formatDate,
  formatNumber,
  formatTimestamp,
  formatTimestampDate,
} from '@/lib/format';

// Intl sépare les milliers par des espaces fines insécables : on les compare à des espaces simples.
const withPlainSpaces = (value: string) => value.replace(/\s/g, ' ');
const NO_BREAK_SPACE = String.fromCharCode(0x00a0);

describe('formatAmount (RG-GEN-02)', () => {
  it('affiche des FCFA entiers, séparés par milliers, suivis de « F »', () => {
    expect(withPlainSpaces(formatAmount(1234567))).toBe('1 234 567 F');
  });

  it('ne coupe jamais le montant de son « F »', () => {
    expect(formatAmount(25000).endsWith(`${NO_BREAK_SPACE}F`)).toBe(true);
  });

  it('arrondit à l’unité', () => {
    expect(withPlainSpaces(formatAmount(1500.6))).toBe('1 501 F');
  });
});

describe('formatNumber', () => {
  it('sépare les milliers', () => {
    expect(withPlainSpaces(formatNumber(1142))).toBe('1 142');
  });
});

describe('formatDate (RG-GEN-02)', () => {
  it('affiche une date de l’API au format jj/mm/aaaa', () => {
    expect(formatDate('2026-01-14')).toBe('14/01/2026');
  });

  it('ne décale pas la date au 31 décembre', () => {
    expect(formatDate('2026-12-31')).toBe('31/12/2026');
  });
});

describe('formatTimestampDate (RG-GEN-02)', () => {
  it('donne le jour à Abidjan d’une date et heure de l’API', () => {
    expect(formatTimestampDate('2026-10-01T08:00:00.000000Z')).toBe('01/10/2026');
    expect(formatTimestampDate('2026-12-31T23:59:59Z')).toBe('31/12/2026');
  });

  it('donne la date et l’heure à Abidjan d’un moment de l’API (journal)', () => {
    expect(formatTimestamp('2026-01-14T09:05:00Z')).toBe('14/01/2026 à 09:05');
  });
});
