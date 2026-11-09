import type { Campaign, CampaignFilter } from '@/features/communications/api/campaigns-api';
import { conflict, forbidden, invalid, notFound, ok, type ApiReply } from './api-replies';

/*
 * Envois groupés simulés, d'après `MessageCampaignController` (`MessageCampaignResource`) : aperçu
 * (destinataires, seuil, quota SMS), préparation, envoi direct jusqu'au seuil ou par le gérant,
 * validation du gérant au-delà (RG-COM-01), quota SMS insuffisant (RG-COM-02). Le nombre de
 * destinataires suit les filtres : 12 adhérents au portefeuille CGA, 4 aux honoraires impayés, 3 par
 * secteur, 1 par dossier choisi. Droits : `communications.bulk.send`, `communications.bulk.approve`.
 */
type Context = { allows: (permission: string) => boolean };

const NOW = '2026-11-02T09:00:00Z';

function countOf(filter: Partial<CampaignFilter>): number {
  if ((filter.member_ids ?? []).length > 0) {
    return (filter.member_ids ?? []).length;
  }
  let count = filter.portfolio === 'all' ? 20 : 12;

  if (filter.unpaid_fees === true) {
    count = 4;
  }
  if ((filter.sector_ids ?? []).length > 0) {
    count = 3 * (filter.sector_ids ?? []).length;
  }

  return count;
}

export function createCampaignsBackend(
  options: { threshold?: number; smsRemaining?: number; empty?: boolean } = {},
) {
  const threshold = options.threshold ?? 50;
  let smsRemaining = options.smsRemaining ?? 200;
  const seeded: Campaign[] = [
    {
      id: '01cmp000000000000000000001',
      title: 'Déclaration de TVA',
      body: 'Pensez à déclarer la TVA avant le 15.',
      channels: ['platform', 'sms'],
      filter: { portfolio: 'cga', regimes: ['TEE'] },
      recipients_count: 60,
      status: 'pending_approval',
      status_label: 'En attente de validation',
      rejection_reason: null,
      approved_at: null,
      sent_at: null,
      created_at: '2026-11-01T08:00:00Z',
      delivery: {},
    },
    {
      id: '01cmp000000000000000000002',
      title: 'Clôture 2025',
      body: 'Transmettez vos pièces.',
      channels: ['platform'],
      filter: { portfolio: 'cga' },
      recipients_count: 12,
      status: 'sent',
      status_label: 'Envoyé',
      rejection_reason: null,
      approved_at: null,
      sent_at: '2026-10-20T08:00:00Z',
      created_at: '2026-10-20T08:00:00Z',
      delivery: { sent: 11, failed: 1 },
    },
  ];
  let campaigns: Campaign[] = options.empty === true ? [] : seeded;
  let sequence = 2;

  function sent(campaign: Campaign): ApiReply {
    if (campaign.channels.includes('sms') && campaign.recipients_count > smsRemaining) {
      return conflict(
        'sms_quota_insufficient',
        `Quota SMS insuffisant (reste ${String(smsRemaining)}).`,
        {
          remaining: smsRemaining,
        },
      );
    }
    if (campaign.channels.includes('sms')) {
      smsRemaining -= campaign.recipients_count;
    }
    const done: Campaign = {
      ...campaign,
      status: 'sent',
      status_label: 'Envoyé',
      sent_at: NOW,
      delivery: { sent: campaign.recipients_count },
    };

    campaigns = campaigns.map((item) => (item.id === done.id ? done : item));

    return ok(done);
  }

  function route(
    method: string,
    path: string,
    body: unknown,
    context: Context,
  ): ApiReply | undefined {
    if (!path.startsWith('/cga/campaigns')) {
      return undefined;
    }
    const sends = context.allows('communications.bulk.send');
    const approves = context.allows('communications.bulk.approve');

    if (!sends && !approves) {
      return forbidden;
    }
    const input = (body ?? {}) as {
      title?: string;
      body?: string;
      channels?: string[];
      filter?: Partial<CampaignFilter>;
    };

    if (method === 'GET' && path === '/cga/campaigns') {
      return {
        status: 200,
        data: {
          data: campaigns,
          meta: {
            sms_remaining: smsRemaining,
            approval_threshold: threshold,
            can: { send: sends, approve: approves },
          },
        },
      };
    }

    if (method === 'POST' && (path === '/cga/campaigns/preview' || path === '/cga/campaigns')) {
      if (!sends) {
        return forbidden;
      }
      if (!Array.isArray(input.channels) || input.channels.length === 0) {
        return invalid({ channels: 'Choisissez au moins un canal.' });
      }
      const count = countOf(input.filter ?? {});

      if (path === '/cga/campaigns/preview') {
        return ok({
          recipients_count: count,
          approval_threshold: threshold,
          needs_approval: count > threshold,
          sms_needed: input.channels.includes('sms') ? count : 0,
          sms_remaining: smsRemaining,
        });
      }
      sequence += 1;
      const draft: Campaign = {
        id: `01cmp9${String(sequence).padStart(20, '0')}`,
        title: input.title ?? '',
        body: input.body ?? '',
        channels: input.channels as Campaign['channels'],
        filter: input.filter ?? {},
        recipients_count: count,
        status: 'draft',
        status_label: 'Brouillon',
        rejection_reason: null,
        approved_at: null,
        sent_at: null,
        created_at: NOW,
        delivery: {},
      };

      campaigns = [draft, ...campaigns];

      return ok(draft, 201);
    }

    const match = /^\/cga\/campaigns\/([^/]+)\/(send|approve|reject)$/.exec(path);
    const target = match === null ? undefined : campaigns.find((item) => item.id === match[1]);

    if (match === null || target === undefined) {
      return notFound;
    }

    if (match[2] === 'send') {
      if (target.status !== 'draft') {
        return conflict('campaign_not_draft', 'Cette campagne est déjà envoyée.');
      }
      if (target.recipients_count > threshold && !approves) {
        const pending: Campaign = {
          ...target,
          status: 'pending_approval',
          status_label: 'En attente de validation',
        };

        campaigns = campaigns.map((item) => (item.id === pending.id ? pending : item));

        return ok(pending);
      }

      return sent(target);
    }
    if (!approves) {
      return forbidden;
    }
    if (target.status !== 'pending_approval') {
      return conflict('campaign_not_pending', 'Cette campagne n’attend pas de validation.');
    }
    if (match[2] === 'approve') {
      return sent({ ...target, approved_at: NOW });
    }
    const reason = ((body ?? {}) as { reason?: string }).reason ?? '';

    if (reason.trim() === '') {
      return invalid({ reason: 'Le motif est obligatoire.' });
    }
    const rejected: Campaign = {
      ...target,
      status: 'rejected',
      status_label: 'Refusé',
      rejection_reason: reason,
    };

    campaigns = campaigns.map((item) => (item.id === rejected.id ? rejected : item));

    return ok(rejected);
  }

  return { route, campaigns: () => campaigns };
}
