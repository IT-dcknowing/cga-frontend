import type { Announcement } from '@/features/announcements/api/announcements-api';
import { forbidden, invalid, notFound, ok, paginated, type ApiReply } from './api-replies';

/*
 * Annonces simulées, d'après `AuthorAnnouncementController`, `MyAnnouncementController` et
 * `AnnouncementFeed` (PRD M12, F-COM-01 et 02) : annonces du CNCGA (tous les CGA, certains CGA, tous les
 * adhérents du réseau) et d'un CGA (ses adhérents, filtrés par régime et secteur), publiées aussitôt
 * avec le nombre de destinataires ; fil des annonces reçues (agents d'un CGA, adhérents), non lues,
 * lecture. Droits : `announcements.network.publish`, `announcements.cga.publish`.
 */
type Context = {
  allows: (permission: string) => boolean;
  organizationId: string | null;
  memberId: string | null;
  membershipId: string | null;
};

const CNCGA = '01org0000000000000000cncga';
const DCK = '01cga000000000000000000001';
const BOUAKE = '01cga000000000000000000002';

const NAMES: Record<string, string> = {
  [CNCGA]: 'Collectif National des Centres de Gestion Agréés',
  [DCK]: 'DC-KNOWING CGA',
  [BOUAKE]: 'CGA Démo Bouaké',
};

const AUDIENCE_LABELS: Record<string, string> = {
  all_cgas: 'Tous les CGA',
  selected_cgas: 'Certains CGA',
  all_network_members: 'Tous les adhérents du réseau',
  own_members: 'Les adhérents du centre',
};

/** Destinataires simulés par cible (`PublishAnnouncement` les compte côté serveur). */
const RECIPIENTS: Record<string, number> = {
  all_cgas: 14,
  all_network_members: 120,
  own_members: 4,
};

export const demoAnnouncementIds = {
  calendar: '01ann000000000000000000001',
  dck: '01ann000000000000000000002',
  members: '01ann000000000000000000003',
  centre: '01ann000000000000000000004',
};

type Stored = {
  id: string;
  organizationId: string;
  title: string;
  body: string;
  published_at: string;
  audience: string;
  targets: string[];
  member_filter: { portfolio: string; regimes: string[]; sector_ids: string[] } | null;
  send_email: boolean;
  recipients_count: number;
  attachment: string | null;
};

/** Valeurs d'un champ tableau d'un `FormData` (`nom[0]`, `nom[1]`…). */
function listOf(body: unknown, prefix: string): string[] {
  if (!(body instanceof FormData)) {
    return [];
  }

  return [...body.entries()]
    .filter(([name]) => name.startsWith(`${prefix}[`))
    .map(([, value]) => String(value));
}

function field(body: unknown, name: string): string {
  if (!(body instanceof FormData)) {
    return '';
  }
  const value = body.get(name);

  return typeof value === 'string' ? value.trim() : '';
}

export function createAnnouncementsBackend() {
  const announcements: Stored[] = [
    {
      id: demoAnnouncementIds.centre,
      organizationId: DCK,
      title: 'Fermeture du centre le 15 novembre',
      body: 'Le centre sera fermé le 15 novembre.\nLes rendez-vous sont reportés.',
      published_at: '2026-11-03T09:00:00+00:00',
      audience: 'own_members',
      targets: [],
      member_filter: { portfolio: 'cga', regimes: [], sector_ids: [] },
      send_email: false,
      recipients_count: 4,
      attachment: null,
    },
    {
      id: demoAnnouncementIds.members,
      organizationId: CNCGA,
      title: 'Facturation électronique : ce qui change',
      body: 'La FNE devient obligatoire pour tous les adhérents.',
      published_at: '2026-10-20T09:00:00+00:00',
      audience: 'all_network_members',
      targets: [],
      member_filter: null,
      send_email: true,
      recipients_count: 120,
      attachment: null,
    },
    {
      id: demoAnnouncementIds.dck,
      organizationId: CNCGA,
      title: 'Audit de DC-KNOWING',
      body: 'Visite de l’équipe du CNCGA la semaine prochaine.',
      published_at: '2026-10-12T09:00:00+00:00',
      audience: 'selected_cgas',
      targets: [DCK],
      member_filter: null,
      send_email: false,
      recipients_count: 3,
      attachment: null,
    },
    {
      id: demoAnnouncementIds.calendar,
      organizationId: CNCGA,
      title: 'Calendrier fiscal 2027',
      body: 'Le calendrier fiscal 2027 est disponible.',
      published_at: '2026-10-01T09:00:00+00:00',
      audience: 'all_cgas',
      targets: [],
      member_filter: null,
      send_email: false,
      recipients_count: 14,
      attachment: 'calendrier-2027.pdf',
    },
  ];
  /** Lectures : identifiant de l'accès → annonces lues. */
  const reads = new Map<string, Set<string>>();
  let sequence = 10;

  function readsOf(context: Context): Set<string> {
    const key = context.membershipId ?? '';

    if (!reads.has(key)) {
      reads.set(key, new Set());
    }

    return reads.get(key) as Set<string>;
  }

  function present(item: Stored, author: boolean, context: Context): Announcement {
    const base: Announcement = {
      id: item.id,
      title: item.title,
      body: item.body,
      published_at: item.published_at,
      from: {
        name: NAMES[item.organizationId],
        type: item.organizationId === CNCGA ? 'cncga' : 'cga',
      },
      attachment:
        item.attachment === null
          ? null
          : {
              name: item.attachment,
              mime_type: 'application/pdf',
              url: `/fichiers/annonces/${item.attachment}`,
            },
    };

    if (!author) {
      return { ...base, read: readsOf(context).has(item.id) };
    }

    return {
      ...base,
      audience: item.audience,
      audience_label: AUDIENCE_LABELS[item.audience],
      member_filter: item.member_filter,
      targets: item.targets.map((id) => ({ id, name: NAMES[id] ?? id })),
      send_email: item.send_email,
      recipients_count: item.recipients_count,
      reads_count: [...reads.values()].filter((set) => set.has(item.id)).length,
    };
  }

  /** `AnnouncementFeed::received` : agent d'un CGA ou adhérent actif de DC-KNOWING. */
  function received(context: Context): Stored[] {
    return announcements.filter((item) =>
      context.memberId === null
        ? item.organizationId === CNCGA &&
          (item.audience === 'all_cgas' ||
            (item.audience === 'selected_cgas' &&
              item.targets.includes(context.organizationId ?? '')))
        : (item.organizationId === context.organizationId && item.audience === 'own_members') ||
          item.audience === 'all_network_members',
    );
  }

  function publish(space: 'network' | 'cga', body: unknown, context: Context): ApiReply {
    const errors: Record<string, string> = {};
    const audience = space === 'network' ? field(body, 'audience') : 'own_members';
    const targets = listOf(body, 'organization_ids');

    if (field(body, 'title') === '') {
      errors.title = 'Le champ titre est obligatoire.';
    }
    if (field(body, 'body') === '') {
      errors.body = 'Le champ texte est obligatoire.';
    }
    if (space === 'network' && !(audience in RECIPIENTS) && audience !== 'selected_cgas') {
      errors.audience = 'Le champ cible est obligatoire.';
    }
    if (audience === 'selected_cgas' && targets.length === 0) {
      errors.organization_ids = 'Le champ CGA destinataires est obligatoire.';
    }
    if (Object.keys(errors).length > 0) {
      return invalid(errors);
    }
    const regimes = listOf(body, 'filter[regimes]');
    const sectorIds = listOf(body, 'filter[sector_ids]');
    const attachment = body instanceof FormData ? body.get('attachment') : null;

    sequence += 1;
    const created: Stored = {
      id: `01ann0000000000000000000${String(sequence)}`,
      organizationId: space === 'network' ? CNCGA : (context.organizationId ?? DCK),
      title: field(body, 'title'),
      body: field(body, 'body'),
      published_at: new Date().toISOString(),
      audience,
      targets,
      member_filter: space === 'cga' ? { portfolio: 'cga', regimes, sector_ids: sectorIds } : null,
      send_email: field(body, 'send_email') === '1',
      recipients_count:
        audience === 'selected_cgas'
          ? targets.length * 3
          : regimes.length > 0 || sectorIds.length > 0
            ? 2
            : RECIPIENTS[audience],
      attachment: attachment instanceof File ? attachment.name : null,
    };

    announcements.unshift(created);

    return {
      status: 201,
      data: {
        data: present(created, true, context),
        meta: { recipients: created.recipients_count },
      },
    };
  }

  return {
    announcements: () => announcements,
    route(
      method: string,
      path: string,
      query: URLSearchParams,
      body: unknown,
      context: Context,
    ): ApiReply | undefined {
      const author = /^\/(network|cga)\/announcements$/.exec(path);

      if (author !== null) {
        const space = author[1] as 'network' | 'cga';
        const permission =
          space === 'network' ? 'announcements.network.publish' : 'announcements.cga.publish';

        if (!context.allows(permission) || context.memberId !== null) {
          return forbidden;
        }
        if (method === 'POST') {
          return publish(space, body, context);
        }
        const organizationId = space === 'network' ? CNCGA : context.organizationId;

        return paginated(
          announcements
            .filter((item) => item.organizationId === organizationId)
            .map((item) => present(item, true, context)),
          query,
        );
      }

      if (path === '/me/announcements' && method === 'GET') {
        if (context.organizationId === CNCGA || context.organizationId === null) {
          return forbidden;
        }
        const feed = received(context);
        const reply = paginated(
          feed.map((item) => present(item, false, context)),
          query,
        ) as { status: number; data: { meta: Record<string, unknown> } };

        reply.data.meta.unread = feed.filter((item) => !readsOf(context).has(item.id)).length;

        return reply as ApiReply;
      }

      const read = /^\/me\/announcements\/([^/]+)\/read$/.exec(path);

      if (read !== null && method === 'POST') {
        if (!received(context).some((item) => item.id === read[1])) {
          return notFound;
        }
        readsOf(context).add(read[1]);

        return ok({ id: read[1], read: true, read_at: new Date().toISOString() });
      }

      return undefined;
    },
  };
}
