import { withApiErrors } from '@/lib/api-errors';
import { http } from '@/lib/http';
import type { ApiItem } from '@/lib/query';

/*
 * Envois groupés d'un centre à ses adhérents (F-COM-03, RG-COM-01, RG-COM-02, `/api/v1/cga/campaigns`) :
 * aperçu des destinataires et du quota SMS, préparation, envoi (validation du gérant au-delà du seuil),
 * historique avec la délivrance par statut. Le serveur compte les destinataires et décompte les SMS.
 */
export const CAMPAIGN_CHANNELS = ['platform', 'email', 'sms', 'whatsapp'] as const;

export type CampaignChannel = (typeof CAMPAIGN_CHANNELS)[number];

export type CampaignFilter = {
  portfolio: 'cga' | 'cabinet' | 'all';
  regimes: string[];
  sector_ids: string[];
  unpaid_fees: boolean;
  member_ids: string[];
};

export type Campaign = {
  id: string;
  title: string;
  body: string;
  channels: CampaignChannel[];
  filter: Partial<CampaignFilter>;
  recipients_count: number;
  status: 'draft' | 'pending_approval' | 'approved' | 'sending' | 'sent' | 'rejected';
  status_label: string;
  rejection_reason: string | null;
  approved_at: string | null;
  sent_at: string | null;
  created_at: string;
  /** Envois par statut (« sent », « failed »…), tirés du journal des messages. */
  delivery: Record<string, number>;
};

export type CampaignHistory = {
  campaigns: Campaign[];
  smsRemaining: number;
  approvalThreshold: number;
  can: { send: boolean; approve: boolean };
};

export type Audience = {
  recipients_count: number;
  approval_threshold: number;
  needs_approval: boolean;
  sms_needed: number;
  sms_remaining: number;
};

export const campaignKeys = {
  all: ['campaigns'] as const,
  history: ['campaigns', 'history'] as const,
  audience: (channels: string[], filter: CampaignFilter) =>
    ['campaigns', 'audience', channels, filter] as const,
};

function campaignPath(id: string, action: 'send' | 'approve' | 'reject'): string {
  return `/cga/campaigns/${encodeURIComponent(id)}/${action}`;
}

export const campaignsApi = {
  async history(): Promise<CampaignHistory> {
    const { data } = await http.get<{
      data: Campaign[];
      meta: { sms_remaining: number; approval_threshold: number; can: CampaignHistory['can'] };
    }>('/cga/campaigns');

    return {
      campaigns: data.data,
      smsRemaining: data.meta.sms_remaining,
      approvalThreshold: data.meta.approval_threshold,
      can: data.meta.can,
    };
  },

  audience: (channels: string[], filter: CampaignFilter) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<Audience>>('/cga/campaigns/preview', {
        channels,
        filter,
      });

      return data.data;
    }),

  /** Prépare la campagne (brouillon), puis l'envoie ou la soumet à la validation du gérant. */
  send: (input: { title: string; body: string; channels: string[]; filter: CampaignFilter }) =>
    withApiErrors(async () => {
      const { data: prepared } = await http.post<ApiItem<Campaign>>('/cga/campaigns', input);
      const { data } = await http.post<ApiItem<Campaign>>(campaignPath(prepared.data.id, 'send'));

      return data.data;
    }),

  decide: (id: string, decision: { approve: true } | { approve: false; reason: string }) =>
    withApiErrors(async () => {
      const { data } = decision.approve
        ? await http.post<ApiItem<Campaign>>(campaignPath(id, 'approve'))
        : await http.post<ApiItem<Campaign>>(campaignPath(id, 'reject'), {
            reason: decision.reason,
          });

      return data.data;
    }),
};
