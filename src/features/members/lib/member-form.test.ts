import { describe, expect, it } from 'vitest';
import {
  checkMember,
  emptyMemberForm,
  formFieldOf,
  memberFormOf,
  memberInput,
  missingStep,
  requiredFields,
  scheduledFees,
  stepOf,
} from '@/features/members/lib/member-form';
import { fr } from '@/lib/i18n/fr';
import { demoFeeSchedule, demoMember, demoReferrers } from '@/test/demo-members';

/* Saisie d'un dossier (F-ADH-02) : niveaux de contrôle, conversions vers et depuis l'API. */
const errors = fr.members.create.errors;

describe('checkMember · niveaux de contrôle', () => {
  it('RG-ADH-01 · brouillon : seuls les champs sans lesquels le dossier n’existe pas', () => {
    const found = checkMember('draft', emptyMemberForm('cga'));

    expect([...found.keys()]).toEqual([
      'company_name',
      'legal_form',
      'ncc',
      'main_activity',
      'phone',
    ]);
    expect(found.get('company_name')).toBe(errors.required);
  });

  it('identification : CDI, siège, commune, signataire ; dirigeant d’une entreprise individuelle', () => {
    const values = { ...emptyMemberForm('cga'), entity_type: 'individual' };

    expect(requiredFields('identification', values)).toEqual(
      expect.arrayContaining([
        'tax_office_id',
        'commune_id',
        'signatory_title',
        'owner_id_document_number',
      ]),
    );
    expect(requiredFields('identification', emptyMemberForm('cga'))).not.toContain(
      'owner_last_name',
    );
  });

  it('RG-ADH-02 · adhésion au portefeuille CGA : contrat signé, confirmations, droit d’adhésion', () => {
    const found = checkMember('membership', emptyMemberForm('cga'));

    expect(found.get('cga_contract_signed_on')).toBe(errors.required);
    expect(found.get('cga_contract_confirmed')).toBe(errors.confirm);
    expect(found.get('exclusivity_confirmed')).toBe(errors.confirm);
    expect(found.get('entry_fee_amount')).toBe(errors.required);

    const cabinet = checkMember('membership', emptyMemberForm('cabinet'));

    expect(cabinet.has('cga_contract_signed_on')).toBe(false);
    expect(cabinet.has('exclusivity_confirmed')).toBe(false);
    expect(cabinet.has('entry_fee_amount')).toBe(false);
  });

  it('formats : nombres entiers positifs, e-mail', () => {
    const found = checkMember('draft', {
      ...emptyMemberForm('cga'),
      share_capital: '1 000',
      employees_count: '-2',
      email: 'pas-un-email',
    });

    expect(found.get('share_capital')).toBe(errors.number);
    expect(found.get('employees_count')).toBe(errors.number);
    expect(found.get('email')).toBe(errors.email);
  });
});

describe('étapes de l’assistant', () => {
  it('chaque champ et chaque élément manquant renvoie à son étape', () => {
    expect(stepOf('ncc')).toBe(1);
    expect(stepOf('sector_id')).toBe(2);
    expect(missingStep('reference_revenue')).toBe(2);
    expect(missingStep('entry_fee_payment')).toBe(2);
    expect(missingStep('signatory_name')).toBe(1);
  });
});

describe('conversions', () => {
  it('saisie → API : vides en null, nombres, chiffre d’affaires ; le Cabinet n’envoie ni apporteur ni contrat', () => {
    const values = {
      ...emptyMemberForm('cga'),
      company_name: ' Ets Kouamé ',
      legal_form: 'SARL',
      ncc: '1234567A',
      share_capital: '1000000',
      referrer_id: demoReferrers[0].id,
      revenue_amount: '5000000',
      revenue_year: '2025',
      revenue_kind: 'actual',
      cga_contract_signed_on: '2026-10-01',
      cga_contract_confirmed: true,
      entry_fee_amount: '25000',
    };
    const input = memberInput(values);

    expect(input).toMatchObject({
      company_name: 'Ets Kouamé',
      sigle: null,
      share_capital: 1000000,
      referrer_id: demoReferrers[0].id,
      cga_contract_signed_on: '2026-10-01',
      cga_contract_confirmed: true,
      entry_fee_amount: 25000,
      reference_revenue: { year: 2025, amount: 5000000, kind: 'actual' },
    });

    const cabinet = memberInput({ ...values, portfolio: 'cabinet' });

    expect(cabinet).not.toHaveProperty('referrer_id');
    expect(cabinet).not.toHaveProperty('cga_contract_signed_on');
    expect(cabinet.entry_fee_amount).toBeNull();
    expect(memberInput({ ...values, revenue_amount: '' }).reference_revenue).toBeNull();
  });

  it('entreprise individuelle : dirigeant envoyé, sans capital social', () => {
    const input = memberInput({
      ...emptyMemberForm('cga'),
      entity_type: 'individual',
      share_capital: '500000',
      owner_last_name: 'Kouamé',
    });

    expect(input.share_capital).toBeNull();
    expect(input.owner_last_name).toBe('Kouamé');
    expect(
      memberInput({ ...emptyMemberForm('cga'), owner_last_name: 'X' }).owner_last_name,
    ).toBeNull();
  });

  it('dossier de l’API → saisie, pour le modifier', () => {
    const member = demoMember({
      company_name: 'BOULANGERIE ADJOUA',
      ncc: '1000001A',
      share_capital: 1000000,
      referrer: { id: demoReferrers[0].id, label: 'Accessoire 1', name: 'Kossonou' },
      reference_revenue: { year: 2025, amount: 8000000, kind: 'actual', source: 'manual' },
      portfolio: 'cabinet',
    });
    const values = memberFormOf(member);

    expect(values).toMatchObject({
      portfolio: 'cabinet',
      company_name: 'BOULANGERIE ADJOUA',
      share_capital: '1000000',
      referrer_id: demoReferrers[0].id,
      revenue_amount: '8000000',
      revenue_year: '2025',
      revenue_kind: 'actual',
      sigle: '',
      exclusivity_confirmed: false,
    });
    expect(memberFormOf(demoMember({ reference_revenue: null })).revenue_kind).toBe('forecast');
  });

  it('erreurs 422 de l’API → champs du formulaire', () => {
    expect(formFieldOf('phone')).toBe('phone');
    expect(formFieldOf('reference_revenue.amount')).toBe('revenue_amount');
    expect(formFieldOf('reference_revenue')).toBe('revenue_amount');
    expect(formFieldOf('transfer_id')).toBeUndefined();
  });

  it('honoraires du barème selon le régime (F-PAY-01) ; aucun au régime réel', () => {
    expect(scheduledFees(demoFeeSchedule, 'TEE')).toEqual({
      amount: '15000',
      periodicity: 'quarterly',
    });
    expect(scheduledFees(demoFeeSchedule, 'RSI')).toBeNull();
    expect(scheduledFees(undefined, 'TEE')).toBeNull();
  });
});
