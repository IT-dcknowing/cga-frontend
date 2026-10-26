import { withApiErrors } from '@/lib/api-errors';
import { config } from '@/lib/config';
import { toFormData } from '@/lib/form-data';
import { http } from '@/lib/http';
import type { ApiItem, ApiPage } from '@/lib/query';
import type { components } from '@/types/api';

/*
 * Fiche du centre (F-ORG-03, `/api/v1/cga/profile`) et agents d'une organisation (F-ORG-09, 10,
 * `/api/v1/{cga|network}/users`) : ceux du CGA par son gérant, ceux du CNCGA par la Présidente. Le
 * serveur décide de tout (rôles assignables, statut, `can`) ; le frontend n'envoie que la saisie.
 */
export type CgaProfile = Omit<components['schemas']['CgaProfileResource'], 'missing_fields'> & {
  missing_fields: string[];
};

export type ImageKind = 'logo' | 'signature' | 'stamp';

export const IMAGE_KINDS: readonly ImageKind[] = ['logo', 'signature', 'stamp'];

/** Saisie de la fiche (`CgaProfileRequest`) : la dénomination et l'agrément restent au CNCGA. */
export type CgaProfileInput = {
  legal_form: string | null;
  share_capital: number | null;
  ncc: string | null;
  rccm: string | null;
  agreement_number: string | null;
  agreement_date: string | null;
  regional_directorate_id: string | null;
  tax_office_id: string | null;
  said: string | null;
  address: string | null;
  city: string;
  commune_id: string | null;
  phone_1: string;
  phone_2: string | null;
  email: string | null;
  manager_name: string | null;
  expert_name: string | null;
  signatory_name: string | null;
  signatory_title: string | null;
  numbering_abbreviation: string | null;
  history_text: string | null;
  previous_year_revenue: number | null;
};

export type Agent = Omit<components['schemas']['AgentResource'], 'can'> & {
  can: { update_roles: boolean; disable: boolean; enable: boolean; resend_invitation: boolean };
};

/** Espace des agents : le centre (`cga`) ou le réseau (`network`). */
export type AgentScope = 'cga' | 'network';

export const INVITATION_CHANNELS = ['sms', 'email', 'sms_email'] as const;

export type AgentInput = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  channel: string;
  roles: string[];
};

export type AgentFilters = { search: string; status: string };

/** Rôles qu'un responsable donne à ses agents (`TeamRoles::assignable`). */
export const ASSIGNABLE_ROLES: Record<AgentScope, readonly string[]> = {
  cga: [
    'cga_accountant_expert',
    'cga_accountant',
    'cga_legal',
    'cga_tax_advisor',
    'cga_billing_officer',
    'cga_trainer',
    'cga_secretary',
  ],
  network: ['cncga_manager', 'cncga_dues', 'cncga_training', 'cncga_viewer'],
};

function agentPath(scope: AgentScope, id?: string, action?: string): string {
  return [`/${scope}/users`, id === undefined ? null : encodeURIComponent(id), action]
    .filter((part) => part !== null && part !== undefined)
    .join('/');
}

export const cgaApi = {
  async profile(): Promise<CgaProfile> {
    const { data } = await http.get<ApiItem<CgaProfile>>('/cga/profile', {
      // Lu par la coque pour ses bandeaux : un agent sans le droit ne voit simplement rien.
      skipErrorToast: [403],
    });

    return data.data;
  },

  updateProfile: (input: CgaProfileInput) =>
    withApiErrors(async () => {
      const { data } = await http.put<ApiItem<CgaProfile>>('/cga/profile', input);

      return data.data;
    }),

  uploadImage: (kind: ImageKind, image: File) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<CgaProfile>>(
        `/cga/profile/images/${kind}`,
        toFormData({ image }),
      );

      return data.data;
    }),

  /** Les agents d'une organisation tiennent sur une page : la plus grande permise. */
  async agents(scope: AgentScope, filters: AgentFilters): Promise<Agent[]> {
    const { data } = await http.get<ApiPage<Agent>>(agentPath(scope), {
      params: {
        'filter[search]': filters.search === '' ? undefined : filters.search,
        'filter[status]': filters.status === '' ? undefined : filters.status,
        per_page: config.pageSizeMax,
      },
    });

    return data.data;
  },

  invite: (scope: AgentScope, input: AgentInput) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<Agent>>(agentPath(scope), input);

      return data.data;
    }),

  updateRoles: (scope: AgentScope, id: string, roles: string[]) =>
    withApiErrors(async () => {
      const { data } = await http.put<ApiItem<Agent>>(agentPath(scope, id, 'roles'), { roles });

      return data.data;
    }),

  setActive: (scope: AgentScope, id: string, active: boolean) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<Agent>>(
        agentPath(scope, id, active ? 'enable' : 'disable'),
      );

      return data.data;
    }),

  resendInvitation: (scope: AgentScope, id: string) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<Agent>>(agentPath(scope, id, 'invitation'));

      return data.data;
    }),
};
