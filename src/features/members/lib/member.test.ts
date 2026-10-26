import { describe, expect, it } from 'vitest';
import { chargeLabel } from '@/features/members/lib/charges';
import { documentFieldsChanged } from '@/features/members/lib/member';
import { demoMember, demoTaxOffices } from '@/test/demo-members';

/* Champs repris sur le contrat et l'attestation (RG-ADH-07) ; libellé d'une échéance (F-PAY-01). */
describe('documentFieldsChanged', () => {
  const before = demoMember({ company_name: 'BOULANGERIE ADJOUA', ncc: '1000001A' });

  it('RG-ADH-07 · raison sociale, adresse, téléphone, signataire : régénération proposée', () => {
    expect(
      documentFieldsChanged(before, { ...before, company_name: 'BOULANGERIE ADJOUA & FILS' }),
    ).toBe(true);
    expect(documentFieldsChanged(before, { ...before, address: 'Rue 12' })).toBe(true);
    expect(documentFieldsChanged(before, { ...before, phone: '+2250101010101' })).toBe(true);
    expect(documentFieldsChanged(before, { ...before, signatory_name: 'Adjoua' })).toBe(true);
  });

  it('RG-ADH-07 · références : commune, centre des impôts, code d’activité, dirigeant', () => {
    expect(
      documentFieldsChanged(before, { ...before, commune: { id: '01com1', name: 'Cocody' } }),
    ).toBe(true);
    expect(documentFieldsChanged(before, { ...before, tax_office: { ...demoTaxOffices[1] } })).toBe(
      true,
    );
    expect(
      documentFieldsChanged(before, {
        ...before,
        activity_code: { id: '01act1', code: '4711', label: 'Commerce' },
      }),
    ).toBe(true);
    expect(
      documentFieldsChanged(before, {
        ...before,
        owner: { ...before.owner, last_name: 'Kouassi' },
      }),
    ).toBe(true);
  });

  it('RG-ADH-07 · champ absent des documents (honoraires, effectif) : rien n’est proposé', () => {
    expect(documentFieldsChanged(before, { ...before, fees_amount: 20000 })).toBe(false);
    expect(documentFieldsChanged(before, { ...before, employees_count: 12 })).toBe(false);
    expect(documentFieldsChanged(before, { ...before })).toBe(false);
  });
});

describe('chargeLabel', () => {
  const base = {
    id: '01chg1',
    kind: 'fees',
    kind_label: 'Honoraires',
    due_date: '2026-10-05',
    amount_excl_tax: 15000,
    tax_rate: '18.00',
    tax_amount: 2700,
    amount: 17700,
    invoice_id: null,
    amount_paid: 0,
    balance: 17700,
    status: 'due',
    status_label: 'À payer',
    overdue_since: null,
  };

  it('F-PAY-01 · échéance périodique : genre et période ; sans période : le genre seul', () => {
    expect(chargeLabel({ ...base, period_start: '2026-10-01', period_end: '2026-10-31' })).toBe(
      'Honoraires · 01/10/2026 – 31/10/2026',
    );
    expect(
      chargeLabel({
        ...base,
        kind_label: 'Droit d’adhésion',
        period_start: null,
        period_end: null,
      }),
    ).toBe('Droit d’adhésion');
  });
});
