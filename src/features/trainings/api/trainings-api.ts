import { withApiErrors } from '@/lib/api-errors';
import { http } from '@/lib/http';
import type { ApiItem, ApiPage } from '@/lib/query';

/*
 * Formations et séminaires (PRD M11, F-FOR-01 à 04, RG-FOR-01 à 06, étape 7.5), d'après
 * `OrganizerTrainingController` (`/network/trainings`, `/cga/trainings`), `NetworkTrainingCatalogController`
 * (`/cga/network-trainings`, `/cga/training-registrations`) et `MyTrainingController` (`/me/trainings`,
 * `/me/training-registrations`) ; ressources `TrainingResource` et `TrainingRegistrationResource`.
 */

/** Espace de l'organisateur : le CNCGA (formations du réseau) ou un CGA (ses agents et adhérents). */
export type TrainingSpace = 'network' | 'cga';

export const TRAINING_FORMATS = ['in_person', 'online', 'workshop'] as const;

export const AUDIENCE_TYPES = [
  'cga_managers',
  'cga_staff',
  'cga_accountants',
  'all_members',
  'members_by_regime',
  'new_members',
] as const;

/** Régimes ciblables par « Adhérents d'un régime » (`SaveTrainingRequest`). */
export const AUDIENCE_REGIMES = ['RME', 'TEE'] as const;

export const TRAINING_PAYMENT_METHODS = [
  'cash',
  'cheque',
  'transfer',
  'mobile_money',
  'other',
] as const;

export type TrainingStatus = 'draft' | 'published' | 'cancelled' | 'completed';

export type RegistrationStatus =
  'pending_approval' | 'registered' | 'waitlisted' | 'cancelled' | 'rejected';

export type TrainingAudience = {
  type: string;
  label: string;
  regime: string | null;
  new_member_months: number | null;
};

export type TrainingRegistration = {
  id: string;
  status: RegistrationStatus;
  status_label: string;
  waitlist_rank: number | null;
  rejection_reason: string | null;
  registered_at: string;
  person: {
    membership_id: string;
    name: string;
    kind: 'agent' | 'member';
    organization: { id: string; name: string };
    /** Donnée au CGA de la personne et à la personne elle-même, jamais au CNCGA (RG-SEC-01). */
    company_name: string | null;
  };
  payment_status: 'not_applicable' | 'to_pay' | 'paid';
  payment_status_label: string;
  paid_on: string | null;
  payment_method: string | null;
  receipt_number: string | null;
  receipt_url: string | null;
  attendance: 'present' | 'absent' | null;
  certificate_url: string | null;
  /** Pour la personne inscrite seulement. */
  training?: {
    id: string;
    title: string;
    starts_at: string;
    status: TrainingStatus;
    organizer: string;
  };
  evaluation?: { score: number; comment: string | null } | null;
};

export type Training = {
  id: string;
  title: string;
  description: string | null;
  format: string;
  format_label: string;
  location: string | null;
  online_url: string | null;
  trainer: string | null;
  starts_at: string;
  ends_at: string;
  /** `null` : places illimitées. */
  capacity: number | null;
  /** 0 : formation gratuite. */
  price: number;
  requires_approval: boolean;
  status: TrainingStatus;
  status_label: string;
  published_at: string | null;
  cancellation_reason: string | null;
  completed_at: string | null;
  organizer?: { id: string; name: string; type: string };
  audiences: TrainingAudience[];
  seats: { registered: number; waitlisted: number; pending: number; left: number | null };
  /** Catalogue de la personne : son inscription en cours, s'il y en a une. */
  my_registration?: TrainingRegistration | null;
  /** Organisateur : actions permises selon le statut et la date. */
  can?: {
    update: boolean;
    publish: boolean;
    cancel: boolean;
    register: boolean;
    attendance: boolean;
    complete: boolean;
  };
};

export type TrainingCandidate = {
  membership_id: string;
  name: string;
  kind: 'agent' | 'member';
  role: string;
  organization: { id: string; name: string };
  company_name: string | null;
  registration_status: RegistrationStatus | null;
};

export type TrainingEvaluations = {
  present: number;
  answers: number;
  average: number | null;
  distribution: Record<string, number>;
  comments: { score: number; comment: string }[];
};

export type RegistrationCounts = {
  registered: number;
  waitlisted: number;
  pending: number;
  already: number;
};

export type TrainingInput = {
  title: string;
  description: string;
  format: string;
  location: string;
  online_url: string;
  trainer: string;
  starts_at: string;
  ends_at: string;
  /** Vide : places illimitées. */
  capacity: string;
  price: string;
  requires_approval: boolean;
  audiences: { type: string; regime?: string }[];
};

export type TrainingPeriod = 'upcoming' | 'past';

export type TrainingFilters = { period: TrainingPeriod; page: number };

export type PaymentInput = { paid_on: string; method: string; reference: string };

export const trainingKeys = {
  all: ['trainings'] as const,
  list: (space: TrainingSpace, filters: TrainingFilters) =>
    ['trainings', space, 'list', filters] as const,
  detail: (space: TrainingSpace, id: string) => ['trainings', space, 'detail', id] as const,
  registrations: (space: TrainingSpace, id: string) =>
    ['trainings', space, 'registrations', id] as const,
  evaluations: (space: TrainingSpace, id: string) =>
    ['trainings', space, 'evaluations', id] as const,
  candidates: (scope: string, id: string, search: string) =>
    ['trainings', scope, 'candidates', id, search] as const,
  networkList: (filters: TrainingFilters) => ['trainings', 'catalog', 'list', filters] as const,
  networkDetail: (id: string) => ['trainings', 'catalog', 'detail', id] as const,
  networkRegistrations: (id: string) => ['trainings', 'catalog', 'registrations', id] as const,
  mine: ['trainings', 'me', 'open'] as const,
  myRegistrations: ['trainings', 'me', 'registrations'] as const,
};

function base(space: TrainingSpace): string {
  return `/${space}/trainings`;
}

function path(space: TrainingSpace, id: string, action = ''): string {
  return `${base(space)}/${encodeURIComponent(id)}${action === '' ? '' : `/${action}`}`;
}

function registrationPath(
  space: TrainingSpace,
  id: string,
  registrationId: string,
  action: string,
) {
  return path(space, id, `registrations/${encodeURIComponent(registrationId)}/${action}`);
}

function catalogPath(id: string, action = ''): string {
  return `/cga/network-trainings/${encodeURIComponent(id)}${action === '' ? '' : `/${action}`}`;
}

function blank(value: string): string | null {
  return value.trim() === '' ? null : value.trim();
}

/** Corps de `SaveTrainingRequest` : champs vides envoyés à `null`, nombres convertis. */
function payload(input: TrainingInput) {
  return {
    title: input.title.trim(),
    description: blank(input.description),
    format: input.format,
    location: blank(input.location),
    online_url: blank(input.online_url),
    trainer: blank(input.trainer),
    starts_at: input.starts_at,
    ends_at: input.ends_at,
    capacity: input.capacity.trim() === '' ? null : Number(input.capacity),
    price: input.price.trim() === '' ? 0 : Number(input.price),
    requires_approval: input.requires_approval,
    audiences: input.audiences,
  };
}

type WithMeta<T, M> = { data: T; meta?: M };

export const trainingsApi = {
  /* ------------------------------------------------------------------ Organisateur */

  async list(space: TrainingSpace, filters: TrainingFilters): Promise<ApiPage<Training>> {
    const { data } = await http.get<ApiPage<Training>>(base(space), {
      params: {
        page: filters.page,
        'filter[period]': filters.period,
        sort: filters.period === 'upcoming' ? 'starts_at' : '-starts_at',
      },
    });

    return data;
  },

  async show(space: TrainingSpace, id: string): Promise<Training> {
    const { data } = await http.get<ApiItem<Training>>(path(space, id));

    return data.data;
  },

  /** « Publier » (`publish`) ou « Enregistrer en brouillon » ; `notified` : personnes notifiées. */
  create: (space: TrainingSpace, input: TrainingInput, publish: boolean) =>
    withApiErrors(async () => {
      const { data } = await http.post<WithMeta<Training, { notified: number | null }>>(
        base(space),
        { ...payload(input), publish },
      );

      return { training: data.data, notified: data.meta?.notified ?? null };
    }),

  update: (space: TrainingSpace, id: string, input: TrainingInput) =>
    withApiErrors(async () => {
      const { data } = await http.put<ApiItem<Training>>(path(space, id), payload(input));

      return data.data;
    }),

  publish: (space: TrainingSpace, id: string) =>
    withApiErrors(async () => {
      const { data } = await http.post<WithMeta<Training, { notified: number | null }>>(
        path(space, id, 'publish'),
      );

      return { training: data.data, notified: data.meta?.notified ?? null };
    }),

  cancel: (space: TrainingSpace, id: string, reason: string) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<Training>>(path(space, id, 'cancel'), { reason });

      return data.data;
    }),

  async registrations(space: TrainingSpace, id: string): Promise<TrainingRegistration[]> {
    const { data } = await http.get<{ data: TrainingRegistration[] }>(
      path(space, id, 'registrations'),
    );

    return data.data;
  },

  async candidates(space: TrainingSpace, id: string, search: string): Promise<TrainingCandidate[]> {
    const { data } = await http.get<{ data: TrainingCandidate[] }>(path(space, id, 'candidates'), {
      params: { search: blank(search) ?? undefined },
    });

    return data.data;
  },

  register: (space: TrainingSpace, id: string, membershipIds: string[]) =>
    withApiErrors(async () => {
      const { data } = await http.post<WithMeta<Training, { registrations: RegistrationCounts }>>(
        path(space, id, 'registrations'),
        { membership_ids: membershipIds },
      );

      return data.meta?.registrations ?? { registered: 0, waitlisted: 0, pending: 0, already: 0 };
    }),

  approve: (space: TrainingSpace, id: string, registrationId: string) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<TrainingRegistration>>(
        registrationPath(space, id, registrationId, 'approve'),
      );

      return data.data;
    }),

  reject: (space: TrainingSpace, id: string, registrationId: string, reason: string) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<TrainingRegistration>>(
        registrationPath(space, id, registrationId, 'reject'),
        { reason: blank(reason) },
      );

      return data.data;
    }),

  /** RG-FOR-06 : paiement encaissé hors plateforme ; le serveur produit le reçu. */
  payment: (space: TrainingSpace, id: string, registrationId: string, input: PaymentInput) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<TrainingRegistration>>(
        registrationPath(space, id, registrationId, 'payment'),
        { paid_on: input.paid_on, method: input.method, reference: blank(input.reference) },
      );

      return data.data;
    }),

  attendance: (
    space: TrainingSpace,
    id: string,
    marks: { registration_id: string; status: 'present' | 'absent' }[],
  ) =>
    withApiErrors(async () => {
      const { data } = await http.put<{ data: { marked: number } }>(path(space, id, 'attendance'), {
        attendance: marks,
      });

      return data.data.marked;
    }),

  /** « Clôturer la session » : attestations générées pour les présents. */
  complete: (space: TrainingSpace, id: string) =>
    withApiErrors(async () => {
      const { data } = await http.post<WithMeta<Training, { certificates: number }>>(
        path(space, id, 'complete'),
      );

      return { training: data.data, certificates: data.meta?.certificates ?? 0 };
    }),

  async evaluations(space: TrainingSpace, id: string): Promise<TrainingEvaluations> {
    const { data } = await http.get<ApiItem<TrainingEvaluations>>(path(space, id, 'evaluations'));

    return data.data;
  },

  /* ------------------------------------------------------- Formations du réseau (centre) */

  async networkList(filters: TrainingFilters): Promise<ApiPage<Training>> {
    const { data } = await http.get<ApiPage<Training>>('/cga/network-trainings', {
      params: {
        page: filters.page,
        'filter[period]': filters.period,
        sort: filters.period === 'upcoming' ? 'starts_at' : '-starts_at',
      },
    });

    return data;
  },

  async networkShow(id: string): Promise<Training> {
    const { data } = await http.get<ApiItem<Training>>(catalogPath(id));

    return data.data;
  },

  async networkRegistrations(id: string): Promise<TrainingRegistration[]> {
    const { data } = await http.get<{ data: TrainingRegistration[] }>(
      catalogPath(id, 'registrations'),
    );

    return data.data;
  },

  async networkCandidates(id: string, search: string): Promise<TrainingCandidate[]> {
    const { data } = await http.get<{ data: TrainingCandidate[] }>(catalogPath(id, 'candidates'), {
      params: { search: blank(search) ?? undefined },
    });

    return data.data;
  },

  networkRegister: (id: string, membershipIds: string[]) =>
    withApiErrors(async () => {
      const { data } = await http.post<WithMeta<Training, { registrations: RegistrationCounts }>>(
        catalogPath(id, 'registrations'),
        { membership_ids: membershipIds },
      );

      return data.meta?.registrations ?? { registered: 0, waitlisted: 0, pending: 0, already: 0 };
    }),

  /** Désinscrire une personne du centre (RG-FOR-04). */
  cancelForCentre: (registrationId: string) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<TrainingRegistration>>(
        `/cga/training-registrations/${encodeURIComponent(registrationId)}/cancel`,
      );

      return data.data;
    }),

  /* ------------------------------------------------------------- La personne elle-même */

  async mine(): Promise<Training[]> {
    const { data } = await http.get<{ data: Training[] }>('/me/trainings');

    return data.data;
  },

  async myRegistrations(): Promise<TrainingRegistration[]> {
    const { data } = await http.get<{ data: TrainingRegistration[] }>('/me/training-registrations');

    return data.data;
  },

  registerSelf: (trainingId: string) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<TrainingRegistration>>(
        `/me/trainings/${encodeURIComponent(trainingId)}/register`,
      );

      return data.data;
    }),

  cancelMine: (registrationId: string) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<TrainingRegistration>>(
        `/me/training-registrations/${encodeURIComponent(registrationId)}/cancel`,
      );

      return data.data;
    }),

  evaluate: (registrationId: string, score: number, comment: string) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<TrainingRegistration>>(
        `/me/training-registrations/${encodeURIComponent(registrationId)}/evaluation`,
        { score, comment: blank(comment) },
      );

      return data.data;
    }),
};
