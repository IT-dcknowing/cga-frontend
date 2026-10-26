import type { Charge, Payment } from '@/features/members/api/dossier-api';
import { withApiErrors } from '@/lib/api-errors';
import { toFormData } from '@/lib/form-data';
import { http } from '@/lib/http';
import type { ApiItem } from '@/lib/query';

/*
 * Documents, honoraires et paiements de l'adhérent (F-PAY-03, RG-DOC-04, `/api/v1/member/…`) : le
 * serveur choisit le dossier d'après l'accès actif, aucun identifiant n'est envoyé. Un paiement
 * déclaré porte toujours sa preuve ; il attend la confirmation du CGA.
 */
export type MemberSpaceDocument = {
  id: string;
  type: string;
  type_label: string;
  title: string;
  category_label: string | null;
  number: string | null;
  version: number;
  status: string;
  status_label: string;
  issued_at: string | null;
  valid_until: string | null;
  cancelled_at: string | null;
  pdf: { id: string; name: string; url: string } | null;
};

export type PaymentDeclaration = {
  amount: number;
  paid_on: string;
  method: string;
  reference: string | null;
  proof: File;
};

export const memberFinanceKeys = {
  documents: ['member-space', 'documents'] as const,
  charges: ['member-space', 'charges'] as const,
  payments: ['member-space', 'payments'] as const,
};

export const memberFinanceApi = {
  async documents(): Promise<MemberSpaceDocument[]> {
    const { data } = await http.get<{ data: MemberSpaceDocument[] }>('/member/documents');

    return data.data;
  },

  async charges(): Promise<Charge[]> {
    const { data } = await http.get<{ data: Charge[] }>('/member/charges');

    return data.data;
  },

  async payments(): Promise<Payment[]> {
    const { data } = await http.get<{ data: Payment[] }>('/member/payments');

    return data.data;
  },

  declare: (input: PaymentDeclaration) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<Payment>>('/member/payments', toFormData(input));

      return data.data;
    }),
};
