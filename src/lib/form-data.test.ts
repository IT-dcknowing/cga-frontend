import { describe, expect, it } from 'vitest';
import { toFormData } from '@/lib/form-data';

/* Corps multipart des envois avec fichier, au format lu par Laravel. */
describe('toFormData', () => {
  it('aplatit les objets en champ[clé], booléens en 1 / 0, null en chaîne vide, omet undefined', () => {
    const file = new File(['%PDF-1.4'], 'piece.pdf', { type: 'application/pdf' });
    const body = toFormData({
      company_name: 'Ets Kouamé',
      share_capital: 1000000,
      confirmed: true,
      blocked: false,
      sigle: null,
      skipped: undefined,
      reference_revenue: { year: 2025, amount: 5000, kind: 'actual' },
      justification: file,
    });

    expect(Object.fromEntries(body.entries())).toEqual({
      company_name: 'Ets Kouamé',
      share_capital: '1000000',
      confirmed: '1',
      blocked: '0',
      sigle: '',
      'reference_revenue[year]': '2025',
      'reference_revenue[amount]': '5000',
      'reference_revenue[kind]': 'actual',
      justification: file,
    });
  });

  it('PUT avec fichier : POST et `_method=PUT` (method spoofing)', () => {
    expect(toFormData({ name: 'x' }, 'PUT').get('_method')).toBe('PUT');
    expect(toFormData({ name: 'x' }).has('_method')).toBe(false);
  });
});
