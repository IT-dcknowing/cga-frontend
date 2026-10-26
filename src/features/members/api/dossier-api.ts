import { withApiErrors } from '@/lib/api-errors';
import { toFormData } from '@/lib/form-data';
import { http } from '@/lib/http';
import type { ApiItem } from '@/lib/query';
import type { components } from '@/types/api';
import { memberPath } from './members-api';

/*
 * Honoraires, paiements, documents et blocage d'attestation d'un dossier (F-PAY-01 à 03, F-DOC-01 à
 * 05, RG-DOC-10), sur `/api/v1/cga/members/{member}/…` et `/api/v1/cga/documents/{document}/…`. Les
 * montants viennent toujours du serveur (TTC, avec TVA) ; un document est produit en file (202) puis
 * relu jusqu'à ce qu'il soit prêt.
 */
/** Somme due (`ChargeResource`) : montants hors taxes, TVA et TTC calculés par le serveur. */
export type Charge = {
  id: string;
  kind: string;
  kind_label: string;
  period_start: string | null;
  period_end: string | null;
  due_date: string;
  amount_excl_tax: number;
  tax_rate: string | number;
  tax_amount: number;
  /** TTC. */
  amount: number;
  invoice_id: string | null;
  amount_paid: number;
  balance: number;
  status: string;
  status_label: string;
  overdue_since: string | null;
};

export type Payment = Omit<components['schemas']['PaymentResource'], 'can'> & {
  can: { confirm: boolean; reject: boolean };
};

export type MemberDocument = Omit<components['schemas']['DocumentResource'], 'can'> & {
  can: { retry: boolean; regenerate: boolean; cancel: boolean };
};

export type PaymentEntry = {
  amount: number;
  paid_on: string;
  method: string;
  reference: string | null;
  /** Échéances payées ; sans liste, le serveur ventile sur les plus anciennes. */
  charge_ids: string[];
  proof: File | null;
};

/** Documents qu'un agent produit pour le dossier (`ProduceMemberDocument::TYPES`). */
export const PRODUCIBLE = ['membership_contract', 'membership_certificate'] as const;

export const UPLOAD_CATEGORIES = ['financial_statements', 'certificate', 'other'] as const;

export const BLOCK_TRIGGERS = ['fees_overdue', 'rsi_overdue', 'manual'] as const;

export const dossierApi = {
  async charges(id: string): Promise<Charge[]> {
    const { data } = await http.get<{ data: Charge[] }>(memberPath(id, '/charges'));

    return data.data;
  },

  async payments(id: string): Promise<Payment[]> {
    const { data } = await http.get<{ data: Payment[] }>(memberPath(id, '/payments'));

    return data.data;
  },

  /** Paiement saisi par le CGA, confirmé d'office ; reçu numéroté produit ensuite (RG-PAY-02). */
  recordPayment: (id: string, entry: PaymentEntry) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<Payment>>(
        memberPath(id, '/payments'),
        toFormData({
          amount: entry.amount,
          paid_on: entry.paid_on,
          method: entry.method,
          reference: entry.reference,
          proof: entry.proof ?? undefined,
          ...Object.fromEntries(
            entry.charge_ids.map((charge, index) => [`charge_ids[${String(index)}]`, charge]),
          ),
        }),
      );

      return data.data;
    }),

  confirmPayment: (id: string, paymentId: string) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<Payment>>(
        memberPath(id, `/payments/${encodeURIComponent(paymentId)}/confirm`),
      );

      return data.data;
    }),

  rejectPayment: (id: string, paymentId: string, reason: string) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<Payment>>(
        memberPath(id, `/payments/${encodeURIComponent(paymentId)}/reject`),
        { reason },
      );

      return data.data;
    }),

  async documents(id: string): Promise<MemberDocument[]> {
    const { data } = await http.get<{ data: MemberDocument[] }>(memberPath(id, '/documents'));

    return data.data;
  },

  /** 202 : produit en file ; 409 si l'attestation est bloquée ou la fiche du centre incomplète. */
  produce: (id: string, type: string) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<MemberDocument>>(memberPath(id, '/documents'), {
        type,
      });

      return data.data;
    }),

  upload: (id: string, input: { title: string; category: string; file: File }) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<MemberDocument>>(
        memberPath(id, '/documents/upload'),
        toFormData(input),
      );

      return data.data;
    }),

  async document(documentId: string): Promise<MemberDocument> {
    const { data } = await http.get<ApiItem<MemberDocument>>(
      `/cga/documents/${encodeURIComponent(documentId)}`,
    );

    return data.data;
  },

  documentAction: (
    documentId: string,
    action: 'retry' | 'regenerate' | 'cancel',
    reason?: string,
  ) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<MemberDocument>>(
        `/cga/documents/${encodeURIComponent(documentId)}/${action}`,
        reason === undefined ? {} : { reason },
      );

      return data.data;
    }),

  /** Blocage manuel de l'attestation (RG-DOC-10), jamais automatique. */
  blockAttestation: (id: string, input: { trigger: string; reason: string }) =>
    withApiErrors(async () => {
      await http.post(memberPath(id, '/attestation-blocks'), input);
    }),

  releaseAttestation: (id: string, reason: string) =>
    withApiErrors(async () => {
      await http.post(memberPath(id, '/attestation-blocks/release'), { reason });
    }),
};
