import { withApiErrors } from '@/lib/api-errors';
import { config } from '@/lib/config';
import { http } from '@/lib/http';
import type { components } from '@/types/api';

/*
 * Registre des CGA du réseau (F-ORG-01 à 07), sur `/api/v1/network/organizations` du backend. Les
 * types viennent de son OpenAPI (`npm run gen:api`) ; les boutons suivent le bloc `can` de chaque
 * fiche (02-TRD §4.3), le serveur refaisant le contrôle à chaque requête.
 */
export type Organization = components['schemas']['OrganizationResource'];

export type RegionalDirectorate = Pick<
  components['schemas']['RegionalDirectorateResource'],
  'id' | 'code' | 'name'
>;

/** `organizations.status` (05-BACKEND-SCHEMA §3). */
export const ORGANIZATION_STATUSES = ['active', 'suspended', 'terminated'] as const;
/** `organizations.subscription_status` (F-ORG-05). */
export const SUBSCRIPTION_STATUSES = ['none', 'trial', 'active', 'terminated'] as const;
/** `organizations.agreement_status` (RG-ORG-03, F-ORG-07). */
export const AGREEMENT_STATUSES = ['pending', 'granted', 'withdrawn'] as const;

export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number];
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
export type AgreementStatus = (typeof AGREEMENT_STATUSES)[number];

/** Champs triables de la liste (liste blanche du serveur). */
export type OrganizationSort = 'name' | '-name' | 'city' | '-city' | 'created_at' | '-created_at';

/** Fiche du registre (F-ORG-02), à la création comme à la modification. */
export type OrganizationInput = {
  name: string;
  sigle: string | null;
  city: string;
  phone_1: string;
  email: string | null;
  /** À la création : « en cours » ou « agréé » ; le retrait passe par sa propre action (F-ORG-07). */
  agreement_status: 'pending' | 'granted';
  agreement_number: string | null;
  agreement_date: string | null;
};

export type OrganizationFilters = {
  search: string;
  status: OrganizationStatus | null;
  subscriptionStatus: SubscriptionStatus | null;
  regionalDirectorateId: string | null;
  sort: OrganizationSort | null;
  /** Page demandée, à partir de 1. */
  page: number;
};

export type OrganizationPage = {
  items: Organization[];
  total: number;
  page: number;
  perPage: number;
};

/** Gérant invité à l'ouverture de l'accès du CGA (F-ORG-02), par SMS par défaut. */
export type ManagerInvitation = { first_name: string; last_name: string; phone: string };

export type OrganizationsApi = {
  list: (filters: OrganizationFilters) => Promise<OrganizationPage>;
  get: (id: string) => Promise<Organization>;
  create: (input: OrganizationInput) => Promise<Organization>;
  update: (id: string, input: OrganizationInput) => Promise<Organization>;
  /** 409 si le CGA a déjà un gérant, invité ou actif. */
  inviteManager: (id: string, invitation: ManagerInvitation) => Promise<Organization>;
  changeSubscription: (
    id: string,
    input: { status: SubscriptionStatus; reason: string | null },
  ) => Promise<Organization>;
  /** Présidente seule (RG-ROLE-04) ; 409 si le CGA est déjà suspendu. */
  suspend: (id: string, reason: string) => Promise<Organization>;
  reactivate: (id: string, reason: string) => Promise<Organization>;
  /** F-ORG-07 : le CGA est suspendu ; aucune radiation n'est faite (RG-ADH-18). */
  withdrawAgreement: (
    id: string,
    input: { withdrawn_at: string; reason: string },
  ) => Promise<Organization>;
  regionalDirectorates: () => Promise<RegionalDirectorate[]>;
};

type ApiItem<T> = { data: T };

type ApiPage<T> = {
  data: T[];
  meta: { current_page: number; per_page: number; total: number; last_page: number };
};

/** 403 et 404 d'une lecture : l'écran commun s'affiche à la place du toast (03-APPFLOW §7). */
const SHOWN_BY_SCREEN = [403, 404];

function organizationPath(id: string, action = ''): string {
  return `/network/organizations/${encodeURIComponent(id)}${action}`;
}

/** Une écriture renvoie la fiche à jour ; ses refus deviennent 409 / 422 pour l'écran. */
function write(call: () => Promise<{ data: ApiItem<Organization> }>): Promise<Organization> {
  return withApiErrors(async () => (await call()).data.data);
}

export const httpOrganizationsApi: OrganizationsApi = {
  async list({ search, status, subscriptionStatus, regionalDirectorateId, sort, page }) {
    const { data } = await http.get<ApiPage<Organization>>('/network/organizations', {
      params: {
        'filter[search]': search === '' ? undefined : search,
        'filter[status]': status ?? undefined,
        'filter[subscription_status]': subscriptionStatus ?? undefined,
        'filter[regional_directorate_id]': regionalDirectorateId ?? undefined,
        sort: sort ?? undefined,
        page,
        per_page: config.pageSize,
      },
      skipErrorToast: SHOWN_BY_SCREEN,
    });

    return {
      items: data.data,
      total: data.meta.total,
      page: data.meta.current_page,
      perPage: data.meta.per_page,
    };
  },

  async get(id) {
    const { data } = await http.get<ApiItem<Organization>>(organizationPath(id), {
      skipErrorToast: SHOWN_BY_SCREEN,
    });

    return data.data;
  },

  create: (input) => write(() => http.post('/network/organizations', input)),

  update: (id, input) => write(() => http.put(organizationPath(id), input)),

  inviteManager: (id, invitation) =>
    write(() => http.post(organizationPath(id, '/manager'), invitation)),

  changeSubscription: (id, input) =>
    write(() => http.post(organizationPath(id, '/subscription'), input)),

  suspend: (id, reason) => write(() => http.post(organizationPath(id, '/suspend'), { reason })),

  reactivate: (id, reason) =>
    write(() => http.post(organizationPath(id, '/reactivate'), { reason })),

  withdrawAgreement: (id, input) =>
    write(() => http.post(organizationPath(id, '/withdraw-agreement'), input)),

  async regionalDirectorates() {
    const { data } = await http.get<ApiPage<RegionalDirectorate>>(
      '/referentials/regional-directorates',
      { params: { 'filter[active]': 1, sort: 'name', per_page: config.pageSizeMax } },
    );

    return data.data.map(({ id, code, name }) => ({ id, code, name }));
  },
};
