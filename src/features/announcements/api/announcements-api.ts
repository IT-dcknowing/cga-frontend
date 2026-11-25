import { withApiErrors } from '@/lib/api-errors';
import { toFormData } from '@/lib/form-data';
import { http } from '@/lib/http';
import type { ApiItem, ApiPage } from '@/lib/query';

/*
 * Annonces (PRD M12, F-COM-01 et 02, étape 7.6), d'après `AuthorAnnouncementController`
 * (`/network/announcements`, `/cga/announcements` : publiées aussitôt) et `MyAnnouncementController`
 * (`/me/announcements` : annonces reçues dans l'espace actif, lecture) ; ressource `AnnouncementResource`.
 */
export type AnnouncementSpace = 'network' | 'cga';

/** Cibles d'une annonce du CNCGA (`AnnouncementAudience::network()`) ; un CGA vise ses adhérents. */
export const NETWORK_AUDIENCES = ['all_cgas', 'selected_cgas', 'all_network_members'] as const;

export type Announcement = {
  id: string;
  title: string;
  body: string;
  published_at: string;
  from?: { name: string; type: string };
  attachment?: { name: string; mime_type: string; url: string } | null;
  /** Annonce reçue : déjà lue par la personne. */
  read?: boolean;
  /** Auteur seulement. */
  audience?: string;
  audience_label?: string;
  member_filter?: { portfolio: string; regimes: string[]; sector_ids: string[] } | null;
  targets?: { id: string; name: string }[];
  send_email?: boolean;
  recipients_count?: number;
  reads_count?: number;
};

export type NewAnnouncement = {
  title: string;
  body: string;
  attachment: File | null;
  sendEmail: boolean;
  /** CNCGA : cible et, pour « Certains CGA », les CGA choisis. */
  audience?: string;
  organizationIds?: string[];
  /** CGA : adhérents filtrés par régime et secteur (vide : tous). */
  regimes?: string[];
  sectorIds?: string[];
};

export type ReceivedPage = ApiPage<Announcement> & { meta: { unread: number } };

export const announcementKeys = {
  all: ['announcements'] as const,
  authored: (space: AnnouncementSpace, page: number) =>
    ['announcements', space, 'authored', page] as const,
  received: (page: number, unread: boolean) => ['announcements', 'received', page, unread] as const,
};

export const announcementsApi = {
  async authored(space: AnnouncementSpace, page: number): Promise<ApiPage<Announcement>> {
    const { data } = await http.get<ApiPage<Announcement>>(`/${space}/announcements`, {
      params: { page },
    });

    return data;
  },

  /** Publie aussitôt ; `recipients` : nombre de destinataires calculé par le serveur. */
  publish: (space: AnnouncementSpace, input: NewAnnouncement) =>
    withApiErrors(async () => {
      const fields: Record<string, unknown> = {
        title: input.title,
        body: input.body,
        attachment: input.attachment ?? undefined,
        send_email: input.sendEmail,
      };

      if (space === 'network') {
        fields.audience = input.audience;
        fields.organization_ids =
          input.audience === 'selected_cgas' ? (input.organizationIds ?? []) : undefined;
      } else {
        fields.filter = {
          regimes: input.regimes ?? [],
          sector_ids: input.sectorIds ?? [],
        };
      }
      const { data } = await http.post<ApiItem<Announcement> & { meta?: { recipients: number } }>(
        `/${space}/announcements`,
        toFormData(fields),
      );

      return { announcement: data.data, recipients: data.meta?.recipients ?? 0 };
    }),

  async received(page: number, unread = false): Promise<ReceivedPage> {
    const { data } = await http.get<ReceivedPage>('/me/announcements', {
      params: { page, 'filter[unread]': unread ? 1 : undefined },
    });

    return data;
  },

  markRead: (id: string) =>
    withApiErrors(async () => {
      await http.post(`/me/announcements/${encodeURIComponent(id)}/read`);
    }),
};
