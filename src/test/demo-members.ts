import type {
  FeeSchedule,
  Member,
  ReferenceOption,
  Referrer,
  Sector,
  TaxOffice,
} from '@/features/members/api/members-api';

/*
 * Dossiers d'adhérents de DC-KNOWING pour le backend simulé : un par onglet de la liste, dans les deux
 * portefeuilles, avec un ancien n° (import, RG-IMP-03) et un apporteur (« Accessoire 1 »).
 */
export const demoMemberIds = {
  adjoua: '01mbr000000000000000000001',
  bamba: '01mbr000000000000000000002',
  kouadio: '01mbr000000000000000000003',
  yao: '01mbr000000000000000000004',
  toure: '01mbr000000000000000000005',
  cabinet: '01mbr000000000000000000006',
  closed: '01mbr000000000000000000007',
};

export const demoTaxOffices: TaxOffice[] = [
  { id: '01cdi000000000000000000001', code: 'CDI-PLT', name: 'CDI Plateau (démonstration)' },
  { id: '01cdi000000000000000000002', code: 'CDI-BKE', name: 'CDI Bouaké (démonstration)' },
];

export const demoCommunes: ReferenceOption[] = [
  { id: '01com000000000000000000001', name: 'Cocody (démonstration)' },
  { id: '01com000000000000000000002', name: 'Plateau (démonstration)' },
];

export const demoSectors: Sector[] = [
  { id: '01sec000000000000000000001', code: 'COM', name: 'Commerce', status: 'validated' },
  { id: '01sec000000000000000000002', code: 'SER', name: 'Services', status: 'validated' },
];

/** Barème du centre : 25 000 F de droit d'adhésion (HT), honoraires TEE et RME. */
export const demoFeeSchedule: FeeSchedule = {
  entry_fee: { amount: 25000, valid_from: '2026-01-01' },
  fees: {
    RME: { amount: 20000, periodicity: 'monthly', valid_from: '2026-01-01' },
    TEE: { amount: 15000, periodicity: 'quarterly', valid_from: '2026-01-01' },
  },
};

/** NCC inscrit au portefeuille CGA d'un autre CGA abonné (RG-ADH-05). */
export const NCC_ENROLLED_ELSEWHERE = '7777777Z';

export const demoReferrers: Referrer[] = [
  {
    id: '01ref000000000000000000001',
    label: 'Accessoire 1',
    name: 'Kossonou Apporteur',
    phone: '+2250700000101',
    email: null,
    terms: '10 % des honoraires de la première année',
    active: true,
    members_count: 1,
    can: { update: true, delete: false },
  },
  {
    id: '01ref000000000000000000002',
    label: 'Accessoire 2',
    name: 'Ouattara Relais',
    phone: null,
    email: null,
    terms: null,
    active: true,
    members_count: 0,
    can: { update: true, delete: true },
  },
];

const allowed = {
  update: true,
  validate: false,
  delete: false,
  change_regime: true,
  request_radiation: true,
  move_to_cga: false,
  block_attestation: true,
  release_attestation: false,
};

export function demoMember(overrides: Partial<Member> = {}): Member {
  return {
    id: demoMemberIds.adjoua,
    portfolio: 'cga',
    portfolio_label: 'Portefeuille CGA',
    status: 'active',
    status_label: 'Actif',
    membership_number: null,
    client_number: null,
    legacy_number: null,
    referrer: null,
    contract: { signed_on: '2026-01-10', confirmed: true, ended_on: null },
    adhesion_date: '2026-01-10',
    validated_at: '2026-01-10T09:00:00Z',
    entity_type: 'company',
    company_name: '',
    sigle: null,
    legal_form: 'SARL',
    legal_form_label: 'SARL',
    share_capital: null,
    owner: {
      last_name: null,
      first_names: null,
      nationality: null,
      id_document_type: null,
      id_document_number: null,
    },
    ncc: '',
    rccm: null,
    idu: null,
    regime: 'TEE',
    regime_label: 'TEE',
    regime_since: '2026-01-10',
    rsi_since: null,
    tax_office: { ...demoTaxOffices[0] },
    activity_code: null,
    activity_code_text: null,
    sector: null,
    main_activity: 'Commerce de détail',
    address: null,
    commune: null,
    land_section: null,
    land_parcel: null,
    registration_date: null,
    phone: '+2250707070707',
    whatsapp: null,
    email: null,
    signatory_name: null,
    signatory_title: null,
    employees_count: null,
    entry_fee_amount: 29500,
    fees_amount: 15000,
    fees_periodicity: 'monthly',
    pieces_status: 'complete',
    attestation_blocked: false,
    attestation_block: null,
    fees_overdue_periods: 0,
    alerts: [],
    radiation: null,
    reference_revenue: null,
    missing_for_validation: [],
    created_at: '2026-01-05T09:00:00Z',
    can: { ...allowed },
    ...overrides,
  };
}

export function demoMembers(): Member[] {
  const [accessoire] = demoReferrers;

  return [
    demoMember({
      id: demoMemberIds.adjoua,
      company_name: 'BOULANGERIE ADJOUA',
      sigle: 'BA',
      ncc: '1000001A',
      membership_number: '2026-DCK-0001',
      legacy_number: 'DCK-OLD-7',
      referrer: { id: accessoire.id, label: accessoire.label, name: accessoire.name },
    }),
    demoMember({
      id: demoMemberIds.bamba,
      company_name: 'QUINCAILLERIE BAMBA',
      ncc: '1000002B',
      membership_number: '2026-DCK-0002',
      regime: 'RME',
      regime_label: 'RME',
      pieces_status: 'pending',
      tax_office: { ...demoTaxOffices[1] },
    }),
    demoMember({
      id: demoMemberIds.kouadio,
      status: 'draft',
      status_label: 'Brouillon',
      company_name: 'ETS KOUADIO & FILS',
      ncc: '1000003C',
      adhesion_date: null,
      validated_at: null,
      contract: { signed_on: null, confirmed: false, ended_on: null },
      pieces_status: 'pending',
      missing_for_validation: ['cga_contract_signed_on'],
      can: {
        ...allowed,
        validate: true,
        delete: true,
        change_regime: false,
        request_radiation: false,
      },
    }),
    demoMember({
      id: demoMemberIds.yao,
      status: 'radiation_pending',
      status_label: 'Radiation en cours',
      company_name: 'PHARMACIE YAO',
      ncc: '1000004D',
      membership_number: '2025-DCK-0040',
      can: { ...allowed, request_radiation: false },
    }),
    demoMember({
      id: demoMemberIds.toure,
      status: 'radiated',
      status_label: 'Radié',
      company_name: 'GARAGE TOURÉ',
      ncc: '1000005E',
      membership_number: '2024-DCK-0012',
      contract: { signed_on: '2024-02-01', confirmed: true, ended_on: '2026-06-30' },
      can: { ...allowed, update: false, change_regime: false, request_radiation: false },
    }),
    demoMember({
      id: demoMemberIds.cabinet,
      portfolio: 'cabinet',
      portfolio_label: 'Portefeuille Cabinet',
      company_name: 'CABINET CLIENT SARL',
      ncc: '1000006F',
      client_number: 'CAB-DCK-00001',
      regime: 'RSI',
      regime_label: 'RSI',
      contract: { signed_on: null, confirmed: false, ended_on: null },
      entry_fee_amount: 0,
      can: { ...allowed, request_radiation: false, block_attestation: false },
    }),
    demoMember({
      id: demoMemberIds.closed,
      portfolio: 'cabinet',
      portfolio_label: 'Portefeuille Cabinet',
      status: 'closed',
      status_label: 'Clos',
      company_name: 'ANCIEN CLIENT SA',
      ncc: '1000007G',
      client_number: 'CAB-DCK-00002',
      contract: { signed_on: null, confirmed: false, ended_on: null },
      can: {
        ...allowed,
        update: false,
        change_regime: false,
        request_radiation: false,
        block_attestation: false,
      },
    }),
  ];
}
