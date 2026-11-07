import { withApiErrors } from '@/lib/api-errors';
import { toFormData } from '@/lib/form-data';
import { http } from '@/lib/http';
import type { ApiItem, ApiPage } from '@/lib/query';

/*
 * Campagne de clôture de l'exercice (F-OBL-08, RG-OBL-10 à 12, décision 0006), d'après
 * `ClosingCampaignController` (`ClosingCampaignResource`, méta `board` et `report`,
 * `ClosingItemResource`, `ClosingAgentResource`) et `MemberClosingController` : exercices du centre,
 * frise des 4 étapes, dossiers suivis, « Marquer l'étape faite » (dans l'ordre ; dépôt : référence et
 * accusé), livrable et agent d'un dossier, actions groupées ; suivi d'un dossier et de l'adhérent.
 */
export const CLOSING_STEPS = ['pieces', 'regularisation', 'finalisation', 'filing'] as const;

export type ClosingStep = (typeof CLOSING_STEPS)[number];

export const CLOSING_DELIVERABLES = ['smt', 'financial_statements'] as const;

export type ClosingDeliverable = (typeof CLOSING_DELIVERABLES)[number];

export type ClosingCampaign = {
  id: string;
  fiscal_year: number;
  status: 'open' | 'closed';
  status_label: string;
  opened_at: string;
  closed_at: string | null;
  steps: { code: ClosingStep; label: string; due: string }[];
};

/** Frise : dossiers retenus par les filtres, faits et en retard par étape. */
export type ClosingBoard = {
  items: number;
  steps: { code: ClosingStep; done: number; late: number }[];
};

/** Bloc « Pour le rapport » (RG-OBL-12), portefeuille CGA seulement. */
export type ClosingReportCounts = {
  smt_established: number;
  smt_transmitted: number;
  financial_statements_established: number;
  financial_statements_transmitted: number;
};

export type ClosingItemStep = {
  code: ClosingStep;
  label: string;
  due: string;
  done_on: string | null;
  late: boolean;
};

export type ClosingItem = {
  id: string;
  campaign: { id: string; fiscal_year: number; status: 'open' | 'closed' };
  deliverable: ClosingDeliverable;
  deliverable_label: string;
  steps: ClosingItemStep[];
  next_step: ClosingStep | null;
  late_step: ClosingStep | null;
  filing_reference: string | null;
  filing_receipt?: { id: string; name: string; url: string } | null;
  /** Côté centre seulement (absent dans l'espace adhérent). */
  member?: {
    id: string;
    company_name: string;
    membership_number: string | null;
    client_number: string | null;
  };
  portfolio?: 'cga' | 'cabinet';
  portfolio_label?: string;
  assigned_to?: { id: string; name: string } | null;
  can?: { mark_step: boolean; update: boolean };
};

export type ClosingAgent = { id: string; name: string };

export type ClosingFilters = {
  portfolio: '' | 'cga' | 'cabinet';
  assignedTo: string;
  step: '' | ClosingStep | 'done';
  late: boolean;
  page: number;
};

export type MarkStepInput = { doneOn: string; reference?: string; receipt?: File | null };

/** Dossiers non traités d'une action groupée, avec le motif du serveur. */
export type SkippedItem = { id: string; code: string; message: string };

export const closingKeys = {
  all: ['closing'] as const,
  campaigns: ['closing', 'campaigns'] as const,
  agents: ['closing', 'agents'] as const,
  board: (id: string, portfolio: string, assignedTo: string) =>
    ['closing', 'board', id, portfolio, assignedTo] as const,
  items: (id: string, filters: ClosingFilters) => ['closing', 'items', id, filters] as const,
  member: (memberId: string) => ['closing', 'member', memberId] as const,
  own: ['closing', 'own'] as const,
};

function campaignPath(campaignId: string, rest = ''): string {
  return `/cga/closing-campaigns/${encodeURIComponent(campaignId)}${rest}`;
}

function blank(value: string): string | undefined {
  return value === '' ? undefined : value;
}

export const closingApi = {
  async campaigns(): Promise<ClosingCampaign[]> {
    const { data } = await http.get<{ data: ClosingCampaign[] }>('/cga/closing-campaigns');

    return data.data;
  },

  async agents(): Promise<ClosingAgent[]> {
    const { data } = await http.get<{ data: ClosingAgent[] }>('/cga/closing-campaigns/agents');

    return data.data;
  },

  async board(
    campaignId: string,
    filters: Pick<ClosingFilters, 'portfolio' | 'assignedTo'>,
  ): Promise<{ campaign: ClosingCampaign; board: ClosingBoard; report: ClosingReportCounts }> {
    const { data } = await http.get<{
      data: ClosingCampaign;
      meta: { board: ClosingBoard; report: ClosingReportCounts };
    }>(campaignPath(campaignId), {
      params: { portfolio: blank(filters.portfolio), assigned_to: blank(filters.assignedTo) },
    });

    return { campaign: data.data, ...data.meta };
  },

  async items(campaignId: string, filters: ClosingFilters): Promise<ApiPage<ClosingItem>> {
    const { data } = await http.get<ApiPage<ClosingItem>>(campaignPath(campaignId, '/items'), {
      params: {
        page: filters.page,
        'filter[portfolio]': blank(filters.portfolio),
        'filter[assigned_to]': blank(filters.assignedTo),
        'filter[step]': blank(filters.step),
        'filter[late]': filters.late ? 1 : undefined,
      },
    });

    return data;
  },

  /** « Marquer l'étape faite » d'un dossier ; le dépôt légal exige la référence et l'accusé. */
  markStep: (campaignId: string, itemId: string, step: ClosingStep, input: MarkStepInput) =>
    withApiErrors(async () => {
      const path = campaignPath(
        campaignId,
        `/items/${encodeURIComponent(itemId)}/steps/${encodeURIComponent(step)}`,
      );
      const body =
        step === 'filing'
          ? toFormData({
              done_on: input.doneOn,
              reference: input.reference,
              receipt: input.receipt ?? undefined,
            })
          : { done_on: input.doneOn };
      const { data } = await http.post<ApiItem<ClosingItem>>(path, body);

      return data.data;
    }),

  /** Livrable (SMT ou états financiers) et agent d'un dossier. */
  updateItem: (
    campaignId: string,
    itemId: string,
    input: { deliverable: ClosingDeliverable; assignedTo: string | null },
  ) =>
    withApiErrors(async () => {
      const { data } = await http.put<ApiItem<ClosingItem>>(
        campaignPath(campaignId, `/items/${encodeURIComponent(itemId)}`),
        { deliverable: input.deliverable, assigned_to: input.assignedTo },
      );

      return data.data;
    }),

  /** Étape faite pour plusieurs dossiers : ceux qui ne peuvent pas l'être sont rendus avec leur motif. */
  bulkStep: (campaignId: string, step: ClosingStep, itemIds: string[], doneOn: string) =>
    withApiErrors(async () => {
      const { data } = await http.post<{ data: ClosingItem[]; meta: { skipped: SkippedItem[] } }>(
        campaignPath(campaignId, `/bulk/steps/${encodeURIComponent(step)}`),
        { item_ids: itemIds, done_on: doneOn },
      );

      return { done: data.data, skipped: data.meta.skipped };
    }),

  bulkAssign: (campaignId: string, itemIds: string[], assignedTo: string | null) =>
    withApiErrors(async () => {
      const { data } = await http.post<{ data: ClosingItem[] }>(
        campaignPath(campaignId, '/bulk/assign'),
        { item_ids: itemIds, assigned_to: assignedTo },
      );

      return data.data;
    }),

  /** Onglet « Clôture » du dossier : un suivi par exercice. */
  async forMember(memberId: string): Promise<ClosingItem[]> {
    const { data } = await http.get<{ data: ClosingItem[] }>(
      `/cga/members/${encodeURIComponent(memberId)}/closing`,
    );

    return data.data;
  },

  /** `/adherent/cloture` : les exercices de l'adhérent connecté. */
  async own(): Promise<ClosingItem[]> {
    const { data } = await http.get<{ data: ClosingItem[] }>('/member/closing');

    return data.data;
  },

  /** « Déposer des pièces » : préoccupation « Pièces de clôture » avec les fichiers joints. */
  depositPieces: (input: { subject: string; message: string; files: File[] }) =>
    withApiErrors(async () => {
      await http.post(
        '/member/concerns',
        toFormData({
          category: 'closing_pieces',
          subject: input.subject,
          message: input.message,
          attachments: input.files,
        }),
      );
    }),
};
