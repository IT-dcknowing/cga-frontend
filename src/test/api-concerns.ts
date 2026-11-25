import type { Concern, ConcernMessage, ConcernStatus } from '@/features/concerns/api/concerns-api';
import {
  conflict,
  forbidden,
  invalid,
  notFound,
  ok,
  paginated,
  text,
  type ApiReply,
  type Input,
} from './api-replies';
import { formInput } from './api-member-records';
import { demoMemberIds } from './demo-members';

/*
 * Préoccupations simulées, d'après `CgaConcernController`, `NetworkConcernController` et
 * `MemberConcernController` (`ConcernResource`, `ConcernMessageResource`, bloc `can` de
 * `PresentsConcerns`) : niveaux adhérent → CGA et CGA → CNCGA, notes internes invisibles du demandeur,
 * statuts (motif d'un rejet), réouverture d'une demande close, transmission au CNCGA (F-PRE-03),
 * demande de document (F-DOC-06), indicateurs agrégés (RG-PRE-03). Droits : `concerns.reply`,
 * `concerns.network.write`, `network_concerns.view`, `network_concerns.handle`, `member.concerns.write`.
 */
type Context = { allows: (permission: string) => boolean; memberId?: string | null };

const STATUS_LABELS: Record<ConcernStatus, string> = {
  open: 'Ouverte',
  in_review: 'En examen',
  resolved: 'Traitée',
  rejected: 'Rejetée',
};

const CATEGORY_LABELS: Record<string, string> = {
  tax: 'Fiscalité',
  accounting: 'Comptabilité',
  public_platforms: 'Plateformes publiques',
  document_request: 'Demande de document',
  other: 'Autre',
};

export const demoConcernIds = {
  tee: '01cnc000000000000000000001',
  closed: '01cnc000000000000000000002',
  eImpots: '01cnc000000000000000000003',
  bouake: '01cnc000000000000000000004',
};

type Stored = Omit<Concern, 'can' | 'messages' | 'status_label' | 'category_label'> & {
  organizationId: string;
  memberId: string | null;
  messages: ConcernMessage[];
};

let sequence = 0;

function message(
  body: string,
  side: 'requester' | 'handler',
  author: string,
  internal = false,
): ConcernMessage {
  sequence += 1;

  return {
    id: `01msg0000000000000000${String(sequence).padStart(5, '0')}`,
    body,
    side,
    author: { name: author },
    system: false,
    copied: false,
    created_at: '2026-11-02T09:00:00Z',
    attachments: [],
    internal,
  };
}

function concern(overrides: Partial<Stored> & Pick<Stored, 'id' | 'subject' | 'level'>): Stored {
  return {
    category: 'tax',
    status: 'open',
    rejection_reason: null,
    created_at: '2026-10-15T09:00:00Z',
    last_activity_at: '2026-11-02T09:00:00Z',
    first_response_at: null,
    resolved_at: null,
    elapsed_days: 23,
    target_response_days: 7,
    response_late: true,
    reopen_count: 0,
    transferred: false,
    organizationId: '01cga000000000000000000001',
    memberId: null,
    messages: [],
    ...overrides,
  };
}

function demoConcerns(): Stored[] {
  return [
    concern({
      id: demoConcernIds.tee,
      subject: 'Calcul de la TEE du trimestre',
      level: 'member_to_cga',
      memberId: demoMemberIds.adjoua,
      member: {
        id: demoMemberIds.adjoua,
        company_name: 'BOULANGERIE ADJOUA',
        membership_number: '2026-DCK-0001',
        portfolio: 'cga',
      },
      author: { name: 'Sery Adhérent' },
      awaiting_reply: true,
      stale: true,
      messages: [
        message(
          'Bonjour, comment est calculée la TEE de ce trimestre ?',
          'requester',
          'Sery Adhérent',
        ),
        message('Vérifier le CA de référence avant de répondre.', 'handler', 'Koffi Gérant', true),
      ],
    }),
    concern({
      id: demoConcernIds.closed,
      subject: 'Attestation d’adhésion',
      level: 'member_to_cga',
      category: 'document_request',
      status: 'resolved',
      resolved_at: '2026-10-20T09:00:00Z',
      response_late: false,
      memberId: demoMemberIds.adjoua,
      member: {
        id: demoMemberIds.adjoua,
        company_name: 'BOULANGERIE ADJOUA',
        membership_number: '2026-DCK-0001',
        portfolio: 'cga',
      },
      author: { name: 'Sery Adhérent' },
      messages: [
        message('Pouvez-vous me délivrer mon attestation ?', 'requester', 'Sery Adhérent'),
        message('Votre attestation est disponible dans vos documents.', 'handler', 'Koffi Gérant'),
      ],
    }),
    concern({
      id: demoConcernIds.eImpots,
      subject: 'Accès à e-impots',
      level: 'cga_to_cncga',
      category: 'public_platforms',
      status: 'in_review',
      author: { name: 'Koffi Gérant' },
      organization: { id: '01cga000000000000000000001', name: 'DC-KNOWING CGA' },
      messages: [
        message('Nos agents n’accèdent plus à e-impots.', 'requester', 'Koffi Gérant'),
        { ...message('Demande passée « En examen »', 'handler', 'CNCGA'), system: true },
      ],
    }),
    concern({
      id: demoConcernIds.bouake,
      subject: 'Question transmise par un adhérent',
      level: 'cga_to_cncga',
      category: 'other',
      organizationId: '01cga000000000000000000002',
      organization: { id: '01cga000000000000000000002', name: 'CGA Démo Bouaké' },
      author: { name: 'Gérant Bouaké' },
      from_transfer: true,
      messages: [message('Question d’un adhérent sur la CMU.', 'requester', 'Gérant Bouaké')],
    }),
  ];
}

export function createConcernsBackend() {
  const concerns = demoConcerns();
  const documentRequests: Input[] = [];

  function closed(item: Stored): boolean {
    return item.status === 'resolved' || item.status === 'rejected';
  }

  /** Côté de l'espace : celui qui traite (`handler`) ou celui qui demande (`requester`). */
  function side(space: string, item: Stored): 'handler' | 'requester' {
    if (space === 'network') {
      return 'handler';
    }
    if (space === 'member') {
      return 'requester';
    }

    return item.level === 'member_to_cga' ? 'handler' : 'requester';
  }

  function resource(space: string, item: Stored, context: Context, detailed: boolean): Concern {
    const handler = side(space, item) === 'handler';
    const open = !closed(item);
    const { organizationId, memberId, messages, ...rest } = item;

    void organizationId;
    void memberId;
    const data: Concern = {
      ...rest,
      status_label: STATUS_LABELS[item.status],
      category_label: CATEGORY_LABELS[item.category] ?? item.category,
      member: space === 'cga' ? item.member : undefined,
      organization: space === 'network' ? item.organization : undefined,
      stale: handler && space === 'cga' ? item.stale : undefined,
    };

    if (!detailed) {
      return data;
    }

    return {
      ...data,
      messages: messages
        .filter((entry) => handler || entry.internal !== true)
        .map((entry) => (handler ? entry : { ...entry, internal: undefined })),
      can: {
        reply: open,
        note: open && handler,
        change_status: handler && open,
        reopen: !open && !handler,
        transfer:
          space === 'cga' &&
          open &&
          item.level === 'member_to_cga' &&
          !item.transferred &&
          context.allows('concerns.network.write'),
      },
    };
  }

  function visible(space: string, context: Context, level: string | null): Stored[] {
    if (space === 'network') {
      return concerns.filter((item) => item.level === 'cga_to_cncga');
    }
    if (space === 'member') {
      return concerns.filter(
        (item) => item.level === 'member_to_cga' && item.memberId === context.memberId,
      );
    }

    return concerns.filter(
      (item) =>
        item.organizationId === '01cga000000000000000000001' &&
        item.level === (level ?? 'member_to_cga'),
    );
  }

  function allowed(space: string, context: Context): boolean {
    return space === 'network'
      ? context.allows('network_concerns.view')
      : space === 'member'
        ? context.allows('member.concerns.write')
        : context.allows('concerns.reply') || context.allows('concerns.network.write');
  }

  function create(space: string, input: Input, context: Context): ApiReply {
    const errors: Record<string, string> = {};

    for (const field of ['category', 'subject', 'message']) {
      if (text(input, field) === '') {
        errors[field] = `Le champ ${field} est obligatoire.`;
      }
    }
    if (Object.keys(errors).length > 0) {
      return invalid(errors);
    }
    if (space === 'cga' && !context.allows('concerns.network.write')) {
      return forbidden;
    }
    const created = concern({
      id: `01cnc0000000000000000new${String(concerns.length).padStart(2, '0')}`,
      subject: text(input, 'subject'),
      level: space === 'cga' ? 'cga_to_cncga' : 'member_to_cga',
      category: text(input, 'category'),
      elapsed_days: 0,
      response_late: false,
      memberId: space === 'member' ? (context.memberId ?? null) : null,
      author: { name: space === 'cga' ? 'Koffi Gérant' : 'Sery Adhérent' },
      messages: [
        message(
          text(input, 'message'),
          'requester',
          space === 'cga' ? 'Koffi Gérant' : 'Sery Adhérent',
        ),
      ],
    });

    concerns.unshift(created);

    return ok(resource(space, created, context, true), 201);
  }

  return {
    concerns: () => concerns,
    documentRequests: () => documentRequests,
    route(
      method: string,
      path: string,
      query: URLSearchParams,
      body: unknown,
      context: Context,
    ): ApiReply | undefined {
      if (path === '/member/document-requests' && method === 'POST') {
        if (!context.allows('member.concerns.write')) {
          return forbidden;
        }
        const input = formInput(body);

        if (text(input, 'type') === 'other' && text(input, 'message') === '') {
          return invalid({ message: 'Précisez le document demandé.' });
        }
        documentRequests.push(input);

        return create(
          'member',
          {
            category: 'document_request',
            subject: 'Demande de document',
            message: text(input, 'message') || 'Attestation',
          },
          context,
        );
      }

      const match = /^\/(cga|network|member)\/concerns(?:\/([^/]+))?(?:\/([a-z]+))?$/.exec(path);

      if (match === null) {
        return undefined;
      }
      const [, space, id, action] = match;

      if (!allowed(space, context)) {
        return forbidden;
      }

      if (id === 'indicators' && method === 'GET' && space === 'network') {
        const metrics = {
          count: 12,
          by_status: { open: 3, in_review: 2, resolved: 6, rejected: 1 },
          treatment_rate: 0.583,
          responded: 10,
          on_target_rate: 0.8,
          average_response_hours: 30.5,
          average_resolution_hours: 72,
          by_category: { tax: 5, other: 7 },
        };

        return ok({
          period: { from: null, to: null },
          network: metrics,
          organizations: [
            {
              ...metrics,
              count: 8,
              organization: { id: '01cga000000000000000000001', name: 'DC-KNOWING CGA' },
            },
            {
              ...metrics,
              count: 4,
              treatment_rate: null,
              average_response_hours: null,
              organization: { id: '01cga000000000000000000002', name: 'CGA Démo Bouaké' },
            },
          ],
        });
      }

      if (id === undefined) {
        if (method === 'GET') {
          const status = query.get('filter[status]');
          const category = query.get('filter[category]');
          const stale = query.get('filter[stale]') === '1';

          return paginated(
            visible(space, context, query.get('filter[level]'))
              .filter((item) => status === null || item.status === status)
              .filter((item) => category === null || item.category === category)
              .filter((item) => !stale || item.stale === true)
              .map((item) => resource(space, item, context, false)),
            query,
          );
        }
        if (method === 'POST' && space !== 'network') {
          return create(space, formInput(body), context);
        }

        return undefined;
      }

      const item = concerns.find(
        (candidate) =>
          candidate.id === id &&
          visible(space, context, candidate.level).some((shown) => shown.id === candidate.id),
      );

      if (item === undefined) {
        return notFound;
      }
      const input = formInput(body);

      if (method === 'GET' && action === undefined) {
        return ok(resource(space, item, context, true));
      }

      if (method === 'POST' && action === 'messages') {
        if (closed(item)) {
          return conflict('concern_closed', 'Cette demande est close : rouvrez-la pour répondre.');
        }
        if (text(input, 'message') === '') {
          return invalid({ message: 'Le message est obligatoire.' });
        }
        const handler = side(space, item) === 'handler';
        const internal = handler && (input.internal === '1' || input.internal === true);
        const entry = message(
          text(input, 'message'),
          handler ? 'handler' : 'requester',
          handler ? 'Koffi Gérant' : 'Sery Adhérent',
          internal,
        );

        entry.attachments = Object.values((input.attachments ?? {}) as Input)
          .filter((file): file is File => file instanceof File)
          .map((file, index) => ({
            id: `01fil00000000000000000at${index}`,
            name: file.name,
            mime_type: file.type,
            size_bytes: file.size,
            url: `https://files.test/${file.name}`,
          }));
        item.messages.push(entry);
        if (handler && !internal) {
          item.first_response_at ??= '2026-11-07T10:00:00Z';
          item.stale = false;
          item.awaiting_reply = false;
        }

        return ok(resource(space, item, context, true), 201);
      }

      if (method === 'POST' && action === 'status' && space !== 'member') {
        const status = text(input, 'status') as ConcernStatus;

        if (status === 'rejected' && text(input, 'reason') === '') {
          return invalid({ reason: 'Le motif du rejet est obligatoire.' });
        }
        item.status = status;
        item.rejection_reason = status === 'rejected' ? text(input, 'reason') : null;

        return ok(resource(space, item, context, true));
      }

      if (method === 'POST' && action === 'reopen' && space !== 'network') {
        if (!closed(item)) {
          return conflict('concern_open', 'Cette demande est déjà ouverte.');
        }
        item.status = 'open';
        item.reopen_count += 1;

        return ok(resource(space, item, context, true));
      }

      if (method === 'POST' && action === 'transfer' && space === 'cga') {
        if (!context.allows('concerns.network.write')) {
          return forbidden;
        }
        if (text(input, 'message') === '') {
          return invalid({ message: 'Le message d’accompagnement est obligatoire.' });
        }
        item.transferred = true;
        item.status = 'in_review';
        item.transfer = {
          id: '01cnc00000000000000000tr01',
          status: 'open',
          status_label: STATUS_LABELS.open,
        };

        return ok(resource(space, item, context, true));
      }

      return undefined;
    },
  };
}
