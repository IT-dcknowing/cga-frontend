import { withApiErrors } from '@/lib/api-errors';
import { toFormData } from '@/lib/form-data';
import { http } from '@/lib/http';
import type { ApiItem } from '@/lib/query';

/*
 * Obligations des adhérents (PRD M07, F-OBL-01 à 07, 02-TRD §4.2) : catalogue visible du centre et
 * propositions du moteur d'applicabilité (`/cga/obligation-types`), obligations attribuées d'un dossier
 * (`/cga/members/{id}/obligations`, confirmation ou retrait des propositions) et échéances
 * (`/cga/members/{id}/obligation-instances` : faite, montant dû, paiement, diligence, déclaration de
 * l'adhérent). Statuts, montants restants et actions possibles (`can`) viennent du serveur.
 */
export const OBLIGATION_CATEGORIES = ['tax', 'cnps', 'cmu', 'other'] as const;

export type ObligationCategory = (typeof OBLIGATION_CATEGORIES)[number];

export type ObligationType = {
  id: string;
  code: string;
  label: string;
  local: boolean;
  catalog_version: string | null;
  category: ObligationCategory;
  category_label: string;
  authority: string | null;
  platform: string | null;
  kind: 'declaration' | 'payment' | 'diligence';
  kind_label: string;
  periodicity: string;
  periodicity_label: string;
  tax_nature: string | null;
  tax_nature_label: string | null;
  has_abatement: boolean;
  active: boolean;
  data_status: string;
  can: { update: boolean };
};

export type MemberObligation = {
  id: string;
  status: 'suggested' | 'active' | 'removed';
  status_label: string;
  source: string;
  source_label: string;
  start_date: string;
  end_date: string | null;
  confirmed_at: string | null;
  type: ObligationType;
  can: { confirm: boolean; remove: boolean };
};

export type ObligationPayment = {
  id: string;
  amount: number;
  paid_on: string;
  source: string;
  source_label: string;
  status: string;
  status_label: string;
  confirmed_at: string | null;
  proof?: { id: string; name: string; url: string } | null;
};

export type InstanceStatus =
  | 'todo'
  | 'done'
  | 'to_pay'
  | 'partially_paid'
  | 'paid'
  | 'not_established'
  | 'in_progress'
  | 'established'
  | 'cancelled';

export type ObligationInstance = {
  id: string;
  label: string;
  category: ObligationCategory;
  category_label: string;
  kind: 'declaration' | 'payment' | 'diligence';
  kind_label: string;
  authority_name: string | null;
  period_label: string;
  period_start: string;
  period_end: string;
  due_date: string;
  overdue: boolean;
  platform: string | null;
  tax_nature: string | null;
  tax_nature_label: string | null;
  amount_gross: number | null;
  amount_due: number | null;
  amount_paid: number;
  balance: number | null;
  status: InstanceStatus;
  status_label: string;
  member_declared_status: string | null;
  member_declared_status_label: string | null;
  member_declared_at: string | null;
  member_declaration_rejection: string | null;
  parent_instance_id: string | null;
  done_at: string | null;
  payments: ObligationPayment[];
  can: {
    mark_done?: boolean;
    set_amount?: boolean;
    record_payment?: boolean;
    set_diligence?: boolean;
    review_declaration?: boolean;
    /** Espace adhérent : « Signaler comme fait / payé » (RG-OBL-09). */
    declare?: boolean;
  };
};

/** Récapitulatif d'un bloc (`ObligationSummary`) : reste dû, montants à saisir, ouvertes, en retard. */
export type CategorySummary = {
  total_due: number;
  amounts_to_enter: number;
  open: number;
  overdue: number;
};

export type InstancesList = {
  instances: ObligationInstance[];
  summary: Record<ObligationCategory, CategorySummary>;
};

/** Critères du moteur d'applicabilité (RG-OBL-02, 03). */
export type SuggestionCriteria = {
  regime: string;
  sector_id: string;
  employees_count: string;
};

export type AmountInput = { amount_due: number; amount_gross: number | null };

export type DeclarationReview = {
  done_on?: string;
  amount?: number;
  paid_on?: string;
  amount_due?: number;
  amount_gross?: number | null;
};

export const obligationKeys = {
  all: ['obligations'] as const,
  types: ['obligations', 'types'] as const,
  suggestions: (criteria: SuggestionCriteria) => ['obligations', 'suggestions', criteria] as const,
  ofMember: (memberId: string) => ['obligations', 'member', memberId] as const,
  instances: (memberId: string) => ['obligations', 'instances', memberId] as const,
};

function memberPath(memberId: string, suffix: string): string {
  return `/cga/members/${encodeURIComponent(memberId)}/${suffix}`;
}

function instancePath(memberId: string, instanceId: string, action: string): string {
  return memberPath(memberId, `obligation-instances/${encodeURIComponent(instanceId)}/${action}`);
}

function blankToNull(value: string): string | null {
  return value.trim() === '' ? null : value.trim();
}

export const obligationsApi = {
  /** Catalogue visible du centre : national en vigueur et obligations locales. */
  async types(): Promise<ObligationType[]> {
    const { data } = await http.get<{ data: ObligationType[] }>('/cga/obligation-types');

    return data.data;
  },

  /** Obligations applicables à un futur dossier (étape 2 de l'assistant). */
  async suggestions(criteria: SuggestionCriteria): Promise<ObligationType[]> {
    const { data } = await http.get<{ data: ObligationType[] }>(
      '/cga/obligation-types/suggestions',
      {
        params: {
          regime: criteria.regime,
          sector_id: blankToNull(criteria.sector_id) ?? undefined,
          employees_count: blankToNull(criteria.employees_count) ?? undefined,
        },
      },
    );

    return data.data;
  },

  async ofMember(memberId: string): Promise<MemberObligation[]> {
    const { data } = await http.get<{ data: MemberObligation[] }>(
      memberPath(memberId, 'obligations'),
    );

    return data.data;
  },

  /** Confirme ou retire des propositions (`suggested`) : la liste à jour du dossier. */
  review: (memberId: string, decision: { confirm: string[]; remove: string[] }) =>
    withApiErrors(async () => {
      const { data } = await http.post<{ data: MemberObligation[] }>(
        memberPath(memberId, 'obligations/review'),
        {
          confirm: decision.confirm.length > 0 ? decision.confirm : undefined,
          remove: decision.remove.length > 0 ? decision.remove : undefined,
        },
      );

      return data.data;
    }),

  /** Attribue une obligation du catalogue, confirmée d'office. */
  add: (memberId: string, typeId: string) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<MemberObligation>>(
        memberPath(memberId, 'obligations'),
        { obligation_type_id: typeId },
      );

      return data.data;
    }),

  async instances(memberId: string): Promise<InstancesList> {
    const { data } = await http.get<{
      data: ObligationInstance[];
      summary: InstancesList['summary'];
    }>(memberPath(memberId, 'obligation-instances'));

    return { instances: data.data, summary: data.summary };
  },

  markDone: (
    memberId: string,
    instanceId: string,
    input: { done_on: string; amount_due: number | null; amount_gross: number | null },
  ) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<ObligationInstance>>(
        instancePath(memberId, instanceId, 'done'),
        input,
      );

      return data.data;
    }),

  setAmount: (memberId: string, instanceId: string, input: AmountInput) =>
    withApiErrors(async () => {
      const { data } = await http.put<ApiItem<ObligationInstance>>(
        instancePath(memberId, instanceId, 'amount'),
        input,
      );

      return data.data;
    }),

  recordPayment: (
    memberId: string,
    instanceId: string,
    input: { amount: number; paid_on: string; proof: File | null },
  ) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<ObligationInstance>>(
        instancePath(memberId, instanceId, 'payments'),
        toFormData({
          amount: String(input.amount),
          paid_on: input.paid_on,
          ...(input.proof === null ? {} : { proof: input.proof }),
        }),
      );

      return data.data;
    }),

  setDiligence: (memberId: string, instanceId: string, status: string) =>
    withApiErrors(async () => {
      const { data } = await http.put<ApiItem<ObligationInstance>>(
        instancePath(memberId, instanceId, 'diligence'),
        { status },
      );

      return data.data;
    }),

  /** Confirme la déclaration de l'adhérent, telle quelle ou corrigée (RG-OBL-09). */
  confirmDeclaration: (memberId: string, instanceId: string, review: DeclarationReview) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<ObligationInstance>>(
        instancePath(memberId, instanceId, 'member-declaration/confirm'),
        review,
      );

      return data.data;
    }),

  rejectDeclaration: (memberId: string, instanceId: string, reason: string) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<ObligationInstance>>(
        instancePath(memberId, instanceId, 'member-declaration/reject'),
        { reason },
      );

      return data.data;
    }),

  /** « + Autre administration » : une échéance ponctuelle hors catalogue (bloc Autres). */
  addOtherAuthority: (
    memberId: string,
    input: { authority: string; label: string; amount_due: number; due_date: string },
  ) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<ObligationInstance>>(
        memberPath(memberId, 'obligation-instances'),
        { ...input, label: blankToNull(input.label) },
      );

      return data.data;
    }),
};
