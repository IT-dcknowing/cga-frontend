import { z } from 'zod';
import type {
  FeeSchedule,
  Member,
  MemberInput,
  Portfolio,
  Regime,
} from '@/features/members/api/members-api';
import { REGIMES_OF } from '@/features/members/api/members-api';
import { fr } from '@/lib/i18n/fr';

/*
 * Saisie d'un dossier (F-ADH-02), à l'inscription comme à la modification. Trois niveaux de contrôle
 * de confort, le serveur refaisant chaque vérification :
 * - brouillon : ce sans quoi le dossier n'existe pas (`MemberRequest`) ;
 * - étape 1 : les champs obligatoires de l'identification (« Suivant ») ;
 * - adhésion : tous les champs obligatoires (« Valider l'adhésion », RG-ADH-02).
 */
const errors = fr.members.create.errors;

export type MemberForm = {
  portfolio: Portfolio;
  entity_type: string;
  company_name: string;
  sigle: string;
  legal_form: string;
  share_capital: string;
  owner_last_name: string;
  owner_first_names: string;
  owner_nationality: string;
  owner_id_document_type: string;
  owner_id_document_number: string;
  ncc: string;
  rccm: string;
  idu: string;
  regime: string;
  legacy_number: string;
  referrer_id: string;
  tax_office_id: string;
  activity_code_text: string;
  main_activity: string;
  address: string;
  commune_id: string;
  land_section: string;
  land_parcel: string;
  phone: string;
  whatsapp: string;
  email: string;
  signatory_name: string;
  signatory_title: string;
  employees_count: string;
  sector_id: string;
  revenue_amount: string;
  revenue_kind: string;
  revenue_year: string;
  cga_contract_signed_on: string;
  cga_contract_confirmed: boolean;
  entry_fee_amount: string;
  fees_amount: string;
  fees_periodicity: string;
  exclusivity_confirmed: boolean;
};

export type MemberField = keyof MemberForm;

export type CheckLevel = 'draft' | 'identification' | 'membership';

/** Étape de l'assistant où se saisit chaque champ (les autres sont à l'étape 1). */
const ACTIVITY_FIELDS: readonly MemberField[] = [
  'sector_id',
  'revenue_amount',
  'revenue_kind',
  'revenue_year',
  'cga_contract_signed_on',
  'cga_contract_confirmed',
  'entry_fee_amount',
  'fees_amount',
  'fees_periodicity',
  'exclusivity_confirmed',
];

export function stepOf(field: string): 1 | 2 {
  return (ACTIVITY_FIELDS as readonly string[]).includes(field) ? 2 : 1;
}

/** Ce qui manque à la validation (`MembershipReadiness`) → champ du formulaire, pour son étape. */
export function missingStep(code: string): 1 | 2 {
  return code === 'reference_revenue' || code === 'entry_fee_payment' ? 2 : stepOf(code);
}

const DRAFT_REQUIRED: readonly MemberField[] = [
  'entity_type',
  'company_name',
  'legal_form',
  'ncc',
  'regime',
  'main_activity',
  'phone',
];

const IDENTIFICATION_REQUIRED: readonly MemberField[] = [
  'tax_office_id',
  'address',
  'commune_id',
  'signatory_name',
  'signatory_title',
];

const OWNER_REQUIRED: readonly MemberField[] = [
  'owner_last_name',
  'owner_first_names',
  'owner_nationality',
  'owner_id_document_type',
  'owner_id_document_number',
];

const MEMBERSHIP_REQUIRED: readonly MemberField[] = [
  'sector_id',
  'revenue_amount',
  'revenue_kind',
  'revenue_year',
  'fees_amount',
  'fees_periodicity',
];

const CGA_REQUIRED: readonly MemberField[] = ['cga_contract_signed_on', 'entry_fee_amount'];

const INTEGER_FIELDS: readonly MemberField[] = [
  'share_capital',
  'employees_count',
  'revenue_amount',
  'revenue_year',
  'entry_fee_amount',
  'fees_amount',
];

/** Champs obligatoires d'un niveau de contrôle, selon le portefeuille et le type d'entreprise. */
export function requiredFields(level: CheckLevel, values: MemberForm): MemberField[] {
  const required = [...DRAFT_REQUIRED];

  if (level === 'draft') {
    return required;
  }

  required.push(...IDENTIFICATION_REQUIRED);

  if (values.entity_type === 'individual') {
    required.push(...OWNER_REQUIRED);
  }

  if (level === 'membership') {
    required.push(...MEMBERSHIP_REQUIRED);

    if (values.portfolio === 'cga') {
      required.push(...CGA_REQUIRED);
    }
  }

  return required;
}

/** Contrôle d'un niveau : erreurs par champ, dans l'ordre de l'écran. */
export function checkMember(level: CheckLevel, values: MemberForm): Map<MemberField, string> {
  const found = new Map<MemberField, string>();
  const required = requiredFields(level, values);

  for (const field of Object.keys(values) as MemberField[]) {
    const value = values[field];

    if (typeof value === 'string') {
      const trimmed = value.trim();

      if (trimmed === '' && required.includes(field)) {
        found.set(field, errors.required);
      } else if (trimmed !== '' && INTEGER_FIELDS.includes(field) && !/^\d+$/.test(trimmed)) {
        found.set(field, errors.number);
      } else if (field === 'email' && trimmed !== '' && !z.email().safeParse(trimmed).success) {
        found.set(field, errors.email);
      }
    }
  }

  if (level === 'membership' && values.portfolio === 'cga') {
    if (!values.cga_contract_confirmed) {
      found.set('cga_contract_confirmed', errors.confirm);
    }

    if (!values.exclusivity_confirmed) {
      found.set('exclusivity_confirmed', errors.confirm);
    }
  }

  return found;
}

export function emptyMemberForm(portfolio: Portfolio): MemberForm {
  return {
    portfolio,
    entity_type: 'company',
    company_name: '',
    sigle: '',
    legal_form: '',
    share_capital: '',
    owner_last_name: '',
    owner_first_names: '',
    owner_nationality: '',
    owner_id_document_type: '',
    owner_id_document_number: '',
    ncc: '',
    rccm: '',
    idu: '',
    regime: REGIMES_OF[portfolio][0],
    legacy_number: '',
    referrer_id: '',
    tax_office_id: '',
    activity_code_text: '',
    main_activity: '',
    address: '',
    commune_id: '',
    land_section: '',
    land_parcel: '',
    phone: '',
    whatsapp: '',
    email: '',
    signatory_name: '',
    signatory_title: '',
    employees_count: '',
    sector_id: '',
    revenue_amount: '',
    revenue_kind: 'forecast',
    revenue_year: String(new Date().getFullYear()),
    cga_contract_signed_on: '',
    cga_contract_confirmed: false,
    entry_fee_amount: '',
    fees_amount: '',
    fees_periodicity: 'monthly',
    exclusivity_confirmed: false,
  };
}

/** Dossier de l'API → saisie, pour le modifier. */
export function memberFormOf(member: Member): MemberForm {
  const text = (value: string | number | null | undefined) =>
    value === null || value === undefined ? '' : String(value);

  return {
    portfolio: member.portfolio === 'cabinet' ? 'cabinet' : 'cga',
    entity_type: member.entity_type,
    company_name: member.company_name,
    sigle: text(member.sigle),
    legal_form: member.legal_form,
    share_capital: text(member.share_capital),
    owner_last_name: text(member.owner.last_name),
    owner_first_names: text(member.owner.first_names),
    owner_nationality: text(member.owner.nationality),
    owner_id_document_type: text(member.owner.id_document_type),
    owner_id_document_number: text(member.owner.id_document_number),
    ncc: member.ncc,
    rccm: text(member.rccm),
    idu: text(member.idu),
    regime: member.regime,
    legacy_number: text(member.legacy_number),
    referrer_id: text(member.referrer?.id),
    tax_office_id: text(member.tax_office?.id),
    activity_code_text: text(member.activity_code_text),
    main_activity: member.main_activity,
    address: text(member.address),
    commune_id: text(member.commune?.id),
    land_section: text(member.land_section),
    land_parcel: text(member.land_parcel),
    phone: member.phone,
    whatsapp: text(member.whatsapp),
    email: text(member.email),
    signatory_name: text(member.signatory_name),
    signatory_title: text(member.signatory_title),
    employees_count: text(member.employees_count),
    sector_id: text(member.sector?.id),
    revenue_amount: text(member.reference_revenue?.amount),
    revenue_kind: member.reference_revenue?.kind ?? 'forecast',
    revenue_year: text(member.reference_revenue?.year ?? new Date().getFullYear()),
    cga_contract_signed_on: text(member.contract.signed_on),
    cga_contract_confirmed: member.contract.confirmed,
    entry_fee_amount: text(member.entry_fee_amount),
    fees_amount: text(member.fees_amount),
    fees_periodicity: member.fees_periodicity,
    exclusivity_confirmed: false,
  };
}

function textOrNull(value: string): string | null {
  const trimmed = value.trim();

  return trimmed === '' ? null : trimmed;
}

function integerOrNull(value: string): number | null {
  const trimmed = value.trim();

  return trimmed === '' ? null : Number.parseInt(trimmed, 10);
}

/** Saisie → corps de `POST` / `PUT /cga/members` ; le Cabinet n'envoie ni apporteur ni contrat CGA. */
export function memberInput(values: MemberForm): MemberInput {
  const revenueAmount = integerOrNull(values.revenue_amount);
  const revenueYear = integerOrNull(values.revenue_year);
  const individual = values.entity_type === 'individual';
  const owner = (value: string) => (individual ? textOrNull(value) : null);
  const input: MemberInput = {
    entity_type: values.entity_type,
    company_name: values.company_name.trim(),
    sigle: textOrNull(values.sigle),
    legal_form: values.legal_form,
    share_capital: individual ? null : integerOrNull(values.share_capital),
    owner_last_name: owner(values.owner_last_name),
    owner_first_names: owner(values.owner_first_names),
    owner_nationality: owner(values.owner_nationality),
    owner_id_document_type: owner(values.owner_id_document_type),
    owner_id_document_number: owner(values.owner_id_document_number),
    ncc: values.ncc.trim(),
    rccm: textOrNull(values.rccm),
    idu: textOrNull(values.idu),
    regime: values.regime,
    legacy_number: textOrNull(values.legacy_number),
    tax_office_id: textOrNull(values.tax_office_id),
    activity_code_text: textOrNull(values.activity_code_text),
    sector_id: textOrNull(values.sector_id),
    main_activity: values.main_activity.trim(),
    address: textOrNull(values.address),
    commune_id: textOrNull(values.commune_id),
    land_section: textOrNull(values.land_section),
    land_parcel: textOrNull(values.land_parcel),
    phone: values.phone.trim(),
    whatsapp: textOrNull(values.whatsapp),
    email: textOrNull(values.email),
    signatory_name: textOrNull(values.signatory_name),
    signatory_title: textOrNull(values.signatory_title),
    employees_count: integerOrNull(values.employees_count),
    entry_fee_amount: values.portfolio === 'cga' ? integerOrNull(values.entry_fee_amount) : null,
    fees_amount: integerOrNull(values.fees_amount),
    fees_periodicity: textOrNull(values.fees_periodicity),
    reference_revenue:
      revenueAmount === null || revenueYear === null
        ? null
        : { year: revenueYear, amount: revenueAmount, kind: values.revenue_kind },
  };

  if (values.portfolio === 'cga') {
    input.referrer_id = textOrNull(values.referrer_id);
    input.cga_contract_signed_on = textOrNull(values.cga_contract_signed_on);
    input.cga_contract_confirmed = values.cga_contract_confirmed;
  }

  return input;
}

/** Champs de l'API → champs du formulaire, pour placer ses erreurs 422 (03-APPFLOW §7). */
export function formFieldOf(apiField: string): MemberField | undefined {
  if (apiField.startsWith('reference_revenue')) {
    const part = apiField.split('.')[1] ?? 'amount';

    return `revenue_${part}` as MemberField;
  }

  return apiField in emptyMemberForm('cga') ? (apiField as MemberField) : undefined;
}

/** Honoraires proposés par le barème pour un régime du portefeuille CGA (F-PAY-01). */
export function scheduledFees(
  schedule: FeeSchedule | undefined,
  regime: string,
): { amount: string; periodicity: string } | null {
  const fee = schedule?.fees[regime as Regime];

  return fee === undefined ? null : { amount: String(fee.amount), periodicity: fee.periodicity };
}
