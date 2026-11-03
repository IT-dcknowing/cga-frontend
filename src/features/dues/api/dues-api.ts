import { withApiErrors } from '@/lib/api-errors';
import { toFormData } from '@/lib/form-data';
import { http } from '@/lib/http';
import type { ApiItem } from '@/lib/query';

/*
 * Cotisation des CGA au CNCGA (PRD M14, F-COT-01 à 06) : côté réseau `/api/v1/network/dues` (suivi de
 * l'année, examen des paiements déclarés, paiement saisi, relance, facture FNE de l'étape 6.9), côté
 * centre `/api/v1/cga/dues` (sa cotisation, déclaration d'un paiement avec preuve). Montants, statuts
 * et numéros viennent du serveur ; aucune suspension automatique (RG-COT-06).
 */
export const DUES_STATUSES = ['due', 'partial', 'paid', 'unpaid'] as const;

export const PAYMENT_METHODS = ['transfer', 'cash', 'cheque', 'mobile_money', 'other'] as const;

export type DuesPayment = {
  id: string;
  amount: number;
  paid_on: string;
  method: string;
  method_label: string;
  reference: string | null;
  source: string;
  status: 'pending_confirmation' | 'confirmed' | 'rejected';
  status_label: string;
  rejection_reason: string | null;
  receipt_number: string | null;
  proof_url: string | null;
  receipt_url: string | null;
};

export type DuesInvoice = {
  id: string;
  number: string;
  status: string;
  status_label: string;
  /** Lien du PDF certifié ; `null` tant que la facture n'est pas certifiée (RG-FNE-01). */
  pdf_url: string | null;
};

export type NetworkDue = {
  id: string;
  cga: { id: string; name: string; sigle: string | null } | null;
  year: number;
  base_amount: number;
  prorata_ratio: number;
  amount_due: number;
  amount_paid: number;
  balance: number;
  deadline: string;
  status: (typeof DUES_STATUSES)[number];
  status_label: string;
  /** Un paiement déclaré attend la confirmation du CNCGA ; `null` quand les paiements ne sont pas lus. */
  pending_confirmation: boolean | null;
  last_reminder_at: string | null;
  reminder_count: number;
  invoice: DuesInvoice | null;
  payments?: DuesPayment[];
};

export type NetworkDuesList = {
  dues: NetworkDue[];
  totals: { amount_due: number; amount_paid: number; balance: number };
  counts: Partial<Record<(typeof DUES_STATUSES)[number], number>>;
};

export type PaymentInput = {
  amount: number;
  paid_on: string;
  method: string;
  reference: string;
};

export const duesKeys = {
  all: ['dues'] as const,
  network: (year: number, status: string) => ['dues', 'network', year, status] as const,
  detail: (id: string) => ['dues', 'detail', id] as const,
  ofCga: (cgaId: string) => ['dues', 'cga', cgaId] as const,
  own: ['dues', 'own'] as const,
};

function duePath(id: string, action = ''): string {
  return `/network/dues/${encodeURIComponent(id)}${action === '' ? '' : `/${action}`}`;
}

function paymentPath(id: string, action: 'confirm' | 'reject'): string {
  return `/network/dues/payments/${encodeURIComponent(id)}/${action}`;
}

export const duesApi = {
  async network(filters: {
    year?: number;
    status?: string;
    cga?: string;
  }): Promise<NetworkDuesList> {
    const { data } = await http.get<{
      data: NetworkDue[];
      meta: { totals: NetworkDuesList['totals']; counts: NetworkDuesList['counts'] };
    }>('/network/dues', {
      params: {
        year: filters.year,
        status: filters.status === '' ? undefined : filters.status,
        cga: filters.cga,
      },
    });

    return { dues: data.data, totals: data.meta.totals, counts: data.meta.counts };
  },

  async detail(id: string): Promise<NetworkDue> {
    const { data } = await http.get<ApiItem<NetworkDue>>(duePath(id));

    return data.data;
  },

  /** Paiement reçu directement par le CNCGA : confirmé d'emblée, reçu numéroté. */
  record: (id: string, input: PaymentInput) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<NetworkDue>>(duePath(id, 'payments'), {
        ...input,
        reference: input.reference === '' ? null : input.reference,
      });

      return data.data;
    }),

  review: (paymentId: string, decision: { confirm: true } | { confirm: false; reason: string }) =>
    withApiErrors(async () => {
      const { data } = decision.confirm
        ? await http.post<ApiItem<NetworkDue>>(paymentPath(paymentId, 'confirm'))
        : await http.post<ApiItem<NetworkDue>>(paymentPath(paymentId, 'reject'), {
            reason: decision.reason,
          });

      return data.data;
    }),

  remind: (id: string) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<NetworkDue>>(duePath(id, 'remind'));

      return data.data;
    }),

  /** « Facturer » (étape 6.9) : une seule facture par cotisation, soumise à la certification FNE. */
  invoice: (id: string) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<NetworkDue>>(duePath(id, 'invoice'));

      return data.data;
    }),

  async own(): Promise<{ dues: NetworkDue[]; canDeclare: boolean }> {
    const { data } = await http.get<{ data: NetworkDue[]; meta: { can: { declare: boolean } } }>(
      '/cga/dues',
    );

    return { dues: data.data, canDeclare: data.meta.can.declare };
  },

  /** Déclaration du centre, preuve obligatoire : le paiement attend la confirmation du CNCGA. */
  declare: (id: string, input: PaymentInput & { proof: File }) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<NetworkDue>>(
        `/cga/dues/${encodeURIComponent(id)}/payments`,
        toFormData({ ...input, amount: String(input.amount) }),
      );

      return data.data;
    }),
};
