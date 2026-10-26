import type { FeeSchedule } from '@/features/members/api/members-api';
import { withApiErrors } from '@/lib/api-errors';
import { http } from '@/lib/http';
import type { ApiItem } from '@/lib/query';

/*
 * Barème du centre (F-PAY-01, `/api/v1/cga/fee-schedule`) et campagne annuelle d'attestations
 * (RG-DOC-06, 07, `/api/v1/cga/certificate-campaign`) : le serveur calcule les éligibles (sans
 * radiés, radiations en cours, dossiers Cabinet ni attestations bloquées) et produit en file.
 */
export type FeeScheduleView = FeeSchedule & { can: { update: boolean } };

/** Régimes du portefeuille CGA, seuls à avoir des honoraires au barème. */
export const FEE_REGIMES = ['RME', 'TEE'] as const;

export const PERIODICITIES = ['monthly', 'quarterly', 'yearly'] as const;

export type FeeScheduleInput = {
  entry_fee: number;
  fees: Record<(typeof FEE_REGIMES)[number], { amount: number; periodicity: string }>;
};

export type CertificateCampaign = {
  year: number;
  eligible: number;
  issued: number;
  blocked: {
    member: { id: string; company_name: string; membership_number: string | null };
    trigger: string;
    trigger_label: string;
    reason: string;
    blocked_at: string;
  }[];
};

export const feesKeys = {
  campaign: ['cga', 'certificate-campaign'] as const,
};

export const feesApi = {
  async schedule(): Promise<FeeScheduleView> {
    const { data } = await http.get<ApiItem<FeeScheduleView>>('/cga/fee-schedule');

    return data.data;
  },

  saveSchedule: (input: FeeScheduleInput) =>
    withApiErrors(async () => {
      const { data } = await http.put<ApiItem<FeeScheduleView>>('/cga/fee-schedule', input);

      return data.data;
    }),

  async campaign(): Promise<CertificateCampaign> {
    const { data } = await http.get<ApiItem<CertificateCampaign>>('/cga/certificate-campaign');

    return data.data;
  },

  /** 202 : les attestations se produisent en file ; le nombre mis en file revient. */
  launchCampaign: () =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<{ year: number; queued: number }>>(
        '/cga/certificate-campaign',
      );

      return data.data;
    }),
};
