import { withApiErrors } from '@/lib/api-errors';
import { config } from '@/lib/config';
import { toFormData } from '@/lib/form-data';
import { http } from '@/lib/http';
import type { ApiItem, ApiPage } from '@/lib/query';
import type { components } from '@/types/api';

/*
 * Factures et avoirs certifiés FNE (F-PAY-05, 06, RG-FNE-01 à 05, `/api/v1/cga/invoices`) et
 * fournisseur de certification du centre (F-ADM-07, `/api/v1/cga/invoicing-provider`). Les montants
 * viennent du serveur ; une facture certifiée est immuable (correction par avoir) et seule une facture
 * certifiée se télécharge ou se remet à l'adhérent. Les identifiants du fournisseur ne reviennent
 * jamais en clair (« •••• 4F2A »).
 */
export type Invoice = Omit<components['schemas']['InvoiceResource'], 'can'> & {
  can: {
    certify_manually: boolean;
    resubmit: boolean;
    cancel: boolean;
    issue_credit_note: boolean;
    deliver: boolean;
  };
};

export type InvoicingProvider = Omit<
  components['schemas']['InvoicingProviderResource'],
  'modes' | 'can'
> & {
  modes: { value: string; label: string; available: boolean }[];
  can: { update: boolean; test: boolean };
};

export type ProviderInput = {
  mode: string;
  base_url: string | null;
  /** Absent : les identifiants enregistrés sont conservés. */
  credentials?: string;
  fne_number_pattern: string | null;
  active: boolean;
};

export const INVOICE_STATUSES = [
  'draft',
  'pending_certification',
  'certified',
  'rejected',
  'cancelled',
] as const;

export type InvoiceFilters = { status: string; memberId?: string; page: number };

export const invoiceKeys = {
  all: ['invoices'] as const,
  list: (filters: InvoiceFilters) => ['invoices', filters] as const,
  provider: ['cga', 'invoicing-provider'] as const,
};

function invoicePath(id: string, action: string): string {
  return `/cga/invoices/${encodeURIComponent(id)}/${action}`;
}

export const invoicesApi = {
  async list(filters: InvoiceFilters): Promise<ApiPage<Invoice>> {
    const { data } = await http.get<ApiPage<Invoice>>('/cga/invoices', {
      params: {
        'filter[status]': filters.status === '' ? undefined : filters.status,
        'filter[member_id]': filters.memberId,
        page: filters.page,
        per_page: config.pageSize,
      },
    });

    return data;
  },

  /** Facture des sommes dues choisies ; le serveur la soumet aussitôt à la certification. */
  issue: (memberId: string, chargeIds: string[]) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<Invoice>>('/cga/invoices', {
        member_id: memberId,
        charge_ids: chargeIds,
      });

      return data.data;
    }),

  /** Mode manuel : numéro FNE et PDF certifié saisis par le centre. */
  certify: (id: string, fneNumber: string, file: File) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<Invoice>>(
        invoicePath(id, 'manual-certification'),
        toFormData({ fne_number: fneNumber, file }),
      );

      return data.data;
    }),

  act: (id: string, action: 'resubmit' | 'credit-note' | 'deliver') =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<Invoice>>(invoicePath(id, action));

      return data.data;
    }),

  cancel: (id: string, reason: string) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<Invoice>>(invoicePath(id, 'cancel'), { reason });

      return data.data;
    }),

  async provider(): Promise<InvoicingProvider> {
    const { data } = await http.get<ApiItem<InvoicingProvider>>('/cga/invoicing-provider');

    return data.data;
  },

  saveProvider: (input: ProviderInput) =>
    withApiErrors(async () => {
      const { data } = await http.put<ApiItem<InvoicingProvider>>('/cga/invoicing-provider', input);

      return data.data;
    }),

  testProvider: () =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<InvoicingProvider>>('/cga/invoicing-provider/test');

      return data.data;
    }),
};
