import { withApiErrors } from '@/lib/api-errors';
import { config } from '@/lib/config';
import { toFormData } from '@/lib/form-data';
import { http } from '@/lib/http';
import { pageOf, SHOWN_BY_SCREEN, type ApiItem, type ApiPage, type ListPage } from '@/lib/query';
import type { components } from '@/types/api';

/*
 * Dossiers des adhérents du centre (F-ADH-01 à 07), sur `/api/v1/cga/members` du backend. Les types
 * viennent de son OpenAPI (`npm run gen:api`), précisés là où l'analyse de Scramble reste vague ; les
 * boutons suivent le bloc `can` de chaque dossier (02-TRD §4.3), le serveur refaisant le contrôle à
 * chaque requête. L'apporteur n'est renvoyé qu'avec le droit « Voir les apporteurs » (RG-PTF-06).
 */
type GeneratedMember = components['schemas']['MemberResource'];
type GeneratedRadiation = components['schemas']['RadiationResource'];

/** Alerte d'un dossier (`MemberAlerts`) : elle ne bloque rien, le gérant décide (CR-04). */
export type MemberAlert = {
  code: 'radiation_required' | 'fees_overdue' | (string & {});
  label: string;
  since: string;
  days: number;
  overdue: boolean;
  periods?: number;
};

export type Radiation = Omit<GeneratedRadiation, 'can'> & {
  can: { validate: boolean; cancel: boolean };
};

export type Member = Omit<
  GeneratedMember,
  'can' | 'alerts' | 'fees_overdue_periods' | 'missing_for_validation' | 'radiation'
> & {
  alerts: MemberAlert[];
  fees_overdue_periods: number;
  missing_for_validation: string[];
  radiation: Radiation | null;
  can: Record<keyof GeneratedMember['can'], boolean>;
};

export type Referrer = Omit<components['schemas']['ReferrerResource'], 'can'> & {
  can: { update: boolean; delete: boolean };
};

/** Valeur d'un référentiel proposée dans une liste (CDI, commune). */
export type ReferenceOption = { id: string; code?: string; name: string };

export type TaxOffice = Pick<components['schemas']['TaxOfficeResource'], 'id' | 'code' | 'name'>;

/** Secteur d'activité visible du centre : validé, ou proposé par lui (RG-REF-01). */
export type Sector = { id: string; code: string; name: string; status: string };

/** Barème du centre (F-PAY-01) : droit d'adhésion et honoraires par régime du portefeuille CGA. */
export type FeeSchedule = {
  entry_fee: { amount: number; valid_from: string | null };
  fees: Partial<Record<Regime, { amount: number; periodicity: string; valid_from: string | null }>>;
};

/** Contrôle à la volée du NCC (F-ADH-02, RG-ADH-05) : jamais le nom d'un autre CGA. */
export type NccCheck = {
  ncc: string;
  valid: boolean;
  existing: { id: string; company_name: string; status: string; portfolio: string } | null;
  enrolled_elsewhere: boolean;
};

/** `members.portfolio` (RG-PTF-01) ; « Tous » n'est qu'un choix de la liste. */
export const PORTFOLIOS = ['cga', 'cabinet'] as const;
export type Portfolio = (typeof PORTFOLIOS)[number];
export type PortfolioChoice = Portfolio | 'all';

/** `members.status` (F-ADH-01). */
export const MEMBER_STATUSES = [
  'draft',
  'active',
  'radiation_pending',
  'radiated',
  'closed',
] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

/** Régimes d'imposition : TEE et RME au portefeuille CGA, RSI et RNI en plus au Cabinet. */
export const REGIMES = ['TEE', 'RME', 'RSI', 'RNI'] as const;
export type Regime = (typeof REGIMES)[number];

/** Régimes permis par portefeuille (RG-PTF-01, `RegimeOfPortfolio`). */
export const REGIMES_OF: Record<Portfolio, readonly Regime[]> = {
  cga: ['TEE', 'RME'],
  cabinet: REGIMES,
};

/** `EntityType`, `LegalForm`, `FeesPeriodicity`, `RevenueKind` du backend. */
export const ENTITY_TYPES = ['company', 'individual'] as const;
export const LEGAL_FORMS = [
  'SARL',
  'SARLU',
  'SAS',
  'SASU',
  'SA',
  'SNC',
  'GIE',
  'COOP',
  'EI',
  'OTHER',
] as const;
export const FEES_PERIODICITIES = ['monthly', 'quarterly', 'yearly'] as const;
export const REVENUE_KINDS = ['forecast', 'actual'] as const;

/** Champs triables de la liste (liste blanche de `ListMembersRequest`). */
export const MEMBER_SORTS = [
  'company_name',
  '-company_name',
  'membership_number',
  '-membership_number',
  'adhesion_date',
  '-adhesion_date',
] as const;
export type MemberSort = (typeof MEMBER_SORTS)[number];

export type MemberFilters = {
  portfolio: PortfolioChoice;
  /** Un ou plusieurs statuts (onglet « Radiés / clos » : radié et clos). */
  statuses: readonly MemberStatus[];
  search: string;
  regime: Regime | null;
  taxOfficeId: string | null;
  referrerId: string | null;
  sort: MemberSort | null;
  page: number;
};

/**
 * Fiche d'un dossier envoyée à `POST` / `PUT /cga/members` (`MemberRequest`). Au portefeuille
 * Cabinet, ni apporteur ni contrat CGA : ces champs sont omis (RG-PTF-06, 08).
 */
export type MemberInput = {
  entity_type: string;
  company_name: string;
  sigle: string | null;
  legal_form: string;
  share_capital: number | null;
  owner_last_name: string | null;
  owner_first_names: string | null;
  owner_nationality: string | null;
  owner_id_document_type: string | null;
  owner_id_document_number: string | null;
  ncc: string;
  rccm: string | null;
  idu: string | null;
  regime: string;
  legacy_number: string | null;
  referrer_id?: string | null;
  tax_office_id: string | null;
  activity_code_text: string | null;
  sector_id: string | null;
  main_activity: string;
  address: string | null;
  commune_id: string | null;
  land_section: string | null;
  land_parcel: string | null;
  phone: string;
  whatsapp: string | null;
  email: string | null;
  signatory_name: string | null;
  signatory_title: string | null;
  employees_count: number | null;
  cga_contract_signed_on?: string | null;
  cga_contract_confirmed?: boolean;
  entry_fee_amount: number | null;
  fees_amount: number | null;
  fees_periodicity: string | null;
  reference_revenue: { year: number; amount: number; kind: string } | null;
};

/** Pièce attendue du dossier (F-PJ-01, RG-PJ-02). */
export type MemberPiece = {
  type: string;
  type_label: string;
  status: string;
  status_label: string;
  file: { id: string; name: string; mime_type: string; url: string } | null;
  received_at: string | null;
  expires_at: string | null;
  can: { upload: boolean };
};

/** Accès en ligne de l'adhérent (F-ADH-09) : principal ou secondaire. */
export type MemberAccess = {
  id: string;
  role: string;
  role_label: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  status: string;
  status_label: string;
  read_only_until: string | null;
  activated_at: string | null;
  invitation: { channel: string; sent_at: string; expires_at: string } | null;
  can: { resend_invitation: boolean; disable: boolean; enable: boolean };
};

export type AccessInvitation = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  channel: string;
  role: string;
};

/** Ligne de l'onglet « Historique » (`MemberHistoryResource`). */
export type HistoryEntry = {
  id: number;
  occurred_at: string;
  subject: string;
  subject_label: string;
  event: string;
  event_label: string;
  actor: string | null;
  changes: { field: string; label: string; before: unknown; after: unknown }[];
  justification: { name: string; url: string } | null;
  source: string | null;
  source_label: string | null;
};

/** Initiateurs, motifs, pièces exigées et issues d'une radiation (`RadiationRules`, F-ADH-06). */
export type RadiationOptions = {
  initiators: {
    value: string;
    label: string;
    sp_request_reference: boolean;
    reasons: {
      value: string;
      label: string;
      proof: { code: string; label: string } | null;
      immediate: boolean;
    }[];
  }[];
  outcomes: { value: string; label: string }[];
};

export type RadiationDemand = {
  initiator: string;
  reason: string;
  reason_other: string | null;
  effective_date: string;
  observation: string;
  proof: File | null;
  sp_request_reference: string | null;
  /** Contribuable ou décès : les deux temps enchaînés (F-ADH-06). */
  validate_now: boolean;
  outcome: string | null;
  validation_reference: string | null;
};

export type RegimeChange = {
  regime: string;
  effective_date: string;
  reason: string;
  justification: File;
};

/** Bascule Cabinet → CGA (RG-PTF-03) ; le droit d'adhésion est payé avec elle (RG-PTF-03). */
export type MoveToCga = {
  cga_contract_signed_on: string;
  cga_contract_confirmed: boolean;
  contract: File | null;
  referrer_id: string | null;
  entry_fee_payment: {
    amount: number;
    paid_on: string;
    method: string;
    reference: string | null;
  } | null;
};

export type ReferrerInput = {
  label: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  terms: string | null;
  active: boolean;
};

export const PAYMENT_METHODS = ['cash', 'cheque', 'transfer', 'mobile_money', 'other'] as const;
export const INVITATION_CHANNELS = ['sms', 'email', 'sms_email'] as const;

export type MembersApi = {
  list: (filters: MemberFilters) => Promise<ListPage<Member>>;
  get: (id: string) => Promise<Member>;
  /** Brouillon (RG-ADH-01) ; 409 `ncc_already_registered` ou `membership_exclusive`. */
  create: (portfolio: Portfolio, input: MemberInput) => Promise<Member>;
  /** Justificatif exigé pour changer la raison sociale ou le NCC d'un dossier validé (RG-ADH-06b). */
  update: (id: string, input: MemberInput, justification?: File | null) => Promise<Member>;
  /** Brouillon seulement (RG-ADH-01). */
  remove: (id: string) => Promise<void>;
  changeRegime: (id: string, change: RegimeChange) => Promise<Member>;
  radiationOptions: () => Promise<RadiationOptions>;
  requestRadiation: (id: string, demand: RadiationDemand) => Promise<Member>;
  validateRadiation: (
    id: string,
    input: { outcome: string; validation_reference: string | null },
  ) => Promise<Member>;
  cancelRadiation: (id: string, reason: string) => Promise<Member>;
  /** 409 `membership_incomplete` (détails `balance`) tant que le droit d'adhésion n'est pas payé. */
  moveToCga: (id: string, move: MoveToCga) => Promise<Member>;
  pieces: (id: string) => Promise<MemberPiece[]>;
  accesses: (id: string) => Promise<MemberAccess[]>;
  inviteAccess: (id: string, invitation: AccessInvitation) => Promise<MemberAccess>;
  accessAction: (
    id: string,
    accessId: string,
    action: 'resend' | 'disable' | 'enable',
  ) => Promise<MemberAccess>;
  history: (id: string, page: number) => Promise<ListPage<HistoryEntry>>;
  /** « Valider l'adhésion » ; 409 `membership_incomplete` (détails `missing`), `membership_exclusive`. */
  validate: (id: string, exclusivityConfirmed: boolean) => Promise<Member>;
  nccCheck: (ncc: string) => Promise<NccCheck>;
  /** Pièce du dossier (PDF, JPG ou PNG), dont l'exemplaire signé du contrat CGA. */
  uploadPiece: (id: string, pieceType: string, file: File) => Promise<void>;
  referrers: () => Promise<Referrer[]>;
  /** Apporteurs du centre (RG-PTF-06) : libellé « Accessoire n » proposé par le serveur s'il est vide. */
  createReferrer: (input: ReferrerInput) => Promise<Referrer>;
  updateReferrer: (id: string, input: ReferrerInput) => Promise<Referrer>;
  /** 409 `referrer_in_use` si un dossier y est rattaché. */
  deleteReferrer: (id: string) => Promise<void>;
  taxOffices: () => Promise<TaxOffice[]>;
  communes: () => Promise<ReferenceOption[]>;
  sectors: () => Promise<Sector[]>;
  /** RG-REF-01 : le serveur attribue le code ; 422 si le nom est déjà pris. */
  proposeSector: (name: string) => Promise<Sector>;
  feeSchedule: () => Promise<FeeSchedule>;
};

export function memberPath(id: string, action = ''): string {
  return `/cga/members/${encodeURIComponent(id)}${action}`;
}

/** Une écriture renvoie le dossier à jour ; ses refus deviennent 409 / 422 pour l'écran. */
function write(call: () => Promise<{ data: ApiItem<Member> }>): Promise<Member> {
  return withApiErrors(async () => (await call()).data.data);
}

/** Référentiel court, lu en une page (`pageSizeMax`), trié par nom. */
async function referential<T>(path: string, params: Record<string, unknown> = {}): Promise<T[]> {
  const { data } = await http.get<ApiPage<T>>(path, {
    params: { sort: 'name', per_page: config.pageSizeMax, ...params },
  });

  return data.data;
}

export const httpMembersApi: MembersApi = {
  async list({ portfolio, statuses, search, regime, taxOfficeId, referrerId, sort, page }) {
    const { data } = await http.get<ApiPage<Member>>('/cga/members', {
      params: {
        'filter[portfolio]': portfolio,
        'filter[status]': statuses.length === 0 ? undefined : statuses.join(','),
        'filter[search]': search === '' ? undefined : search,
        'filter[regime]': regime ?? undefined,
        'filter[tax_office_id]': taxOfficeId ?? undefined,
        'filter[referrer_id]': referrerId ?? undefined,
        sort: sort ?? undefined,
        page,
        per_page: config.pageSize,
      },
      skipErrorToast: SHOWN_BY_SCREEN,
    });

    return pageOf(data);
  },

  async get(id) {
    const { data } = await http.get<ApiItem<Member>>(memberPath(id), {
      skipErrorToast: SHOWN_BY_SCREEN,
    });

    return data.data;
  },

  create: (portfolio, input) => write(() => http.post('/cga/members', { portfolio, ...input })),

  update: (id, input, justification = null) =>
    write(() =>
      justification === null
        ? http.put(memberPath(id), input)
        : http.post(memberPath(id), toFormData({ ...input, justification }, 'PUT')),
    ),

  remove: (id) =>
    withApiErrors(async () => {
      await http.delete(memberPath(id));
    }),

  changeRegime: (id, change) =>
    write(() => http.post(memberPath(id, '/regimes'), toFormData(change))),

  async radiationOptions() {
    const { data } = await http.get<ApiItem<RadiationOptions>>('/cga/members/radiation-options');

    return data.data;
  },

  requestRadiation: (id, demand) =>
    write(() =>
      http.post(
        memberPath(id, '/radiation'),
        toFormData({
          ...demand,
          // Sans validation immédiate, ni issue ni référence de validation (RequestRadiationRequest).
          outcome: demand.validate_now ? demand.outcome : undefined,
          validation_reference: demand.validate_now ? demand.validation_reference : undefined,
          proof: demand.proof ?? undefined,
        }),
      ),
    ),

  validateRadiation: (id, input) =>
    write(() => http.post(memberPath(id, '/radiation/validate'), input)),

  cancelRadiation: (id, reason) =>
    write(() => http.post(memberPath(id, '/radiation/cancel'), { reason })),

  moveToCga: (id, move) =>
    write(() =>
      http.post(
        memberPath(id, '/portfolio/cga'),
        toFormData({
          ...move,
          contract: move.contract ?? undefined,
          entry_fee_payment: move.entry_fee_payment ?? undefined,
        }),
      ),
    ),

  async pieces(id) {
    const { data } = await http.get<{ data: MemberPiece[] }>(memberPath(id, '/pieces'));

    return data.data;
  },

  async accesses(id) {
    const { data } = await http.get<{ data: MemberAccess[] }>(memberPath(id, '/accesses'));

    return data.data;
  },

  inviteAccess: (id, invitation) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<MemberAccess>>(
        memberPath(id, '/accesses'),
        invitation,
      );

      return data.data;
    }),

  accessAction: (id, accessId, action) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<MemberAccess>>(
        memberPath(id, `/accesses/${encodeURIComponent(accessId)}/${action}`),
      );

      return data.data;
    }),

  async history(id, page) {
    const { data } = await http.get<ApiPage<HistoryEntry>>(memberPath(id, '/history'), {
      params: { page, per_page: config.pageSize },
    });

    return pageOf(data);
  },

  validate: (id, exclusivityConfirmed) =>
    write(() =>
      http.post(memberPath(id, '/validate'), { exclusivity_confirmed: exclusivityConfirmed }),
    ),

  async nccCheck(ncc) {
    const { data } = await http.get<ApiItem<NccCheck>>('/cga/members/ncc-check', {
      params: { ncc },
      // Contrôle de confort : un échec n'empêche pas la saisie, le serveur refait le contrôle.
      skipErrorToast: true,
    });

    return data.data;
  },

  uploadPiece: (id, pieceType, file) =>
    withApiErrors(async () => {
      const body = new FormData();

      body.append('file', file);
      await http.post(memberPath(id, `/pieces/${encodeURIComponent(pieceType)}`), body);
    }),

  async referrers() {
    const { data } = await http.get<{ data: Referrer[] }>('/cga/referrers');

    return data.data;
  },

  createReferrer: (input) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<Referrer>>('/cga/referrers', input);

      return data.data;
    }),

  updateReferrer: (id, input) =>
    withApiErrors(async () => {
      const { data } = await http.put<ApiItem<Referrer>>(
        `/cga/referrers/${encodeURIComponent(id)}`,
        input,
      );

      return data.data;
    }),

  deleteReferrer: (id) =>
    withApiErrors(async () => {
      await http.delete(`/cga/referrers/${encodeURIComponent(id)}`);
    }),

  async taxOffices() {
    const offices = await referential<TaxOffice>('/referentials/tax-offices', {
      'filter[active]': 1,
    });

    return offices.map(({ id, code, name }) => ({ id, code, name }));
  },

  async communes() {
    const communes = await referential<ReferenceOption>('/referentials/communes');

    return communes.map(({ id, name }) => ({ id, name }));
  },

  async sectors() {
    const sectors = await referential<Sector>('/referentials/sectors');

    return sectors
      .filter((sector) => sector.status === 'validated' || sector.status === 'proposed')
      .map(({ id, code, name, status }) => ({ id, code, name, status }));
  },

  proposeSector: (name) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<Sector>>('/cga/sectors', { name });
      const { id, code, status } = data.data;

      return { id, code, name: data.data.name, status };
    }),

  async feeSchedule() {
    const { data } = await http.get<ApiItem<FeeSchedule>>('/cga/fee-schedule', {
      // Pré-remplissage seulement : sans barème lisible, les montants restent à saisir.
      skipErrorToast: true,
    });

    return data.data;
  },
};
