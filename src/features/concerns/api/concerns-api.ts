import { withApiErrors } from '@/lib/api-errors';
import { toFormData } from '@/lib/form-data';
import { http } from '@/lib/http';
import type { ApiItem, ApiPage } from '@/lib/query';

/*
 * Préoccupations (PRD M10, F-PRE-01 à 04, RG-PRE-01 à 03, étape 7.4), d'après `CgaConcernController`,
 * `NetworkConcernController` et `MemberConcernController` (`ConcernResource`, `ConcernMessageResource`) :
 * demandes reçues des adhérents et envoyées au CNCGA (centre), demandes des CGA (CNCGA), demandes de
 * l'adhérent ; fil de messages, notes internes, statuts, réouverture, transfert au CNCGA, indicateurs.
 */
export type ConcernSpace = 'cga' | 'network' | 'member';

export const CONCERN_STATUSES = ['open', 'in_review', 'resolved', 'rejected'] as const;

export type ConcernStatus = (typeof CONCERN_STATUSES)[number];

export const CONCERN_CATEGORIES = [
  'tax',
  'accounting',
  'legal',
  'social',
  'training',
  'administrative',
  'public_platforms',
  'document_request',
  'info_update',
  'closing_pieces',
  'other',
] as const;

export type ConcernAttachment = {
  id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  url: string;
};

export type ConcernMessage = {
  id: string;
  body: string;
  side: 'requester' | 'handler';
  author: { name: string };
  system: boolean;
  copied: boolean;
  created_at: string;
  attachments: ConcernAttachment[];
  /** Côté de celui qui traite seulement : note interne invisible du demandeur. */
  internal?: boolean;
};

export type Concern = {
  id: string;
  level: 'member_to_cga' | 'cga_to_cncga';
  category: string;
  category_label: string;
  subject: string;
  status: ConcernStatus;
  status_label: string;
  rejection_reason: string | null;
  created_at: string;
  last_activity_at: string;
  first_response_at: string | null;
  resolved_at: string | null;
  elapsed_days: number;
  target_response_days: number;
  response_late: boolean;
  reopen_count: number;
  transferred: boolean;
  author?: { name: string };
  awaiting_reply?: boolean;
  awaiting_since?: string | null;
  /** Sans réponse depuis `concerns.stale_days` jours (RG-PRE-02). */
  stale?: boolean;
  member?: {
    id: string;
    company_name: string;
    membership_number: string | null;
    portfolio: string;
  } | null;
  transfer?: { id: string; status: ConcernStatus; status_label: string } | null;
  organization?: { id: string; name: string };
  from_transfer?: boolean;
  messages?: ConcernMessage[];
  can?: {
    reply: boolean;
    note: boolean;
    change_status: boolean;
    reopen: boolean;
    transfer: boolean;
  };
};

export type ConcernFilters = {
  status: string;
  category: string;
  /** Centre : `member_to_cga` (reçues) ou `cga_to_cncga` (envoyées au CNCGA). */
  level?: 'member_to_cga' | 'cga_to_cncga';
  organizationId?: string;
  stale?: boolean;
  page: number;
};

export type ConcernIndicators = {
  count: number;
  by_status: Record<ConcernStatus, number>;
  treatment_rate: number | null;
  responded: number;
  on_target_rate: number | null;
  average_response_hours: number | null;
  average_resolution_hours: number | null;
  by_category: Record<string, number>;
};

export type NetworkIndicators = {
  network: ConcernIndicators;
  organizations: (ConcernIndicators & { organization: { id: string; name: string } })[];
};

export type NewConcern = { category: string; subject: string; message: string; files: File[] };

export const concernKeys = {
  all: ['concerns'] as const,
  list: (space: ConcernSpace, filters: ConcernFilters) =>
    ['concerns', space, 'list', filters] as const,
  detail: (space: ConcernSpace, id: string) => ['concerns', space, 'detail', id] as const,
  indicators: (space: ConcernSpace) => ['concerns', space, 'indicators'] as const,
};

function base(space: ConcernSpace): string {
  return space === 'member' ? '/member/concerns' : `/${space}/concerns`;
}

function path(space: ConcernSpace, id: string, action = ''): string {
  return `${base(space)}/${encodeURIComponent(id)}${action === '' ? '' : `/${action}`}`;
}

function blank(value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : value;
}

export const concernsApi = {
  async list(space: ConcernSpace, filters: ConcernFilters): Promise<ApiPage<Concern>> {
    const { data } = await http.get<ApiPage<Concern>>(base(space), {
      params: {
        page: filters.page,
        'filter[status]': blank(filters.status),
        'filter[category]': space === 'member' ? undefined : blank(filters.category),
        'filter[level]': space === 'cga' ? filters.level : undefined,
        'filter[organization_id]': space === 'network' ? blank(filters.organizationId) : undefined,
        'filter[stale]': space === 'cga' && filters.stale === true ? 1 : undefined,
      },
    });

    return data;
  },

  async show(space: ConcernSpace, id: string): Promise<Concern> {
    const { data } = await http.get<ApiItem<Concern>>(path(space, id));

    return data.data;
  },

  /** Centre : « Écrire au CNCGA » ; adhérent : « Nouvelle demande » au CGA. */
  create: (space: 'cga' | 'member', input: NewConcern) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<Concern>>(
        base(space),
        toFormData({
          category: input.category,
          subject: input.subject,
          message: input.message,
          attachments: input.files,
        }),
      );

      return data.data;
    }),

  reply: (
    space: ConcernSpace,
    id: string,
    input: { message: string; internal: boolean; files: File[] },
  ) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<Concern>>(
        path(space, id, 'messages'),
        toFormData({
          message: input.message,
          internal: space === 'member' ? undefined : input.internal,
          attachments: input.files,
        }),
      );

      return data.data;
    }),

  changeStatus: (space: 'cga' | 'network', id: string, status: ConcernStatus, reason: string) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<Concern>>(path(space, id, 'status'), {
        status,
        reason: status === 'rejected' ? reason : null,
      });

      return data.data;
    }),

  reopen: (space: 'cga' | 'member', id: string) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<Concern>>(path(space, id, 'reopen'));

      return data.data;
    }),

  /** « Transmettre au CNCGA » (F-PRE-03) : la demande d'origine passe « En examen — transmise ». */
  transfer: (id: string, input: { message: string; files: File[] }) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<Concern>>(
        path('cga', id, 'transfer'),
        toFormData({ message: input.message, attachments: input.files }),
      );

      return data.data;
    }),

  async networkIndicators(): Promise<NetworkIndicators> {
    const { data } = await http.get<ApiItem<NetworkIndicators>>('/network/concerns/indicators');

    return data.data;
  },

  /** « Demander un document » (F-DOC-06) : crée une préoccupation « Demande de document ». */
  requestDocument: (type: string, message: string) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<Concern>>('/member/document-requests', {
        type,
        message: message.trim() === '' ? null : message.trim(),
      });

      return data.data;
    }),
};
