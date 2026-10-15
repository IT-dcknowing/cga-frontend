import { describe, expect, it } from 'vitest';
import { formatAmount, formatDate, formatNumber } from '@/lib/format';

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
