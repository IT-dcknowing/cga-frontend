import type {
  RegistrationStatus,
  Training,
  TrainingCandidate,
  TrainingRegistration,
  TrainingStatus,
} from '@/features/trainings/api/trainings-api';
import { formInput } from './api-member-records';
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

/*
 * Formations simulées, d'après `OrganizerTrainingController`, `NetworkTrainingCatalogController` et
 * `MyTrainingController` (`TrainingResource`, `TrainingRegistrationResource`, bloc `can`) : formations du
 * CNCGA et d'un CGA, publication, annulation, inscriptions avec liste d'attente et promotion (RG-FOR-03),
 * validation (RG-FOR-05), paiement et reçu (RG-FOR-06), présence, clôture et attestations, évaluations ;
 * formations du réseau vues d'un CGA ; formations ouvertes à l'adhérent, désinscription (RG-FOR-04).
 * Droits : `trainings.network.manage`, `trainings.cga.manage`, `member.trainings.register`.
 * Les dates « à venir » sont en 2030, les sessions passées en 2026 : `can` se calcule sur l'horloge réelle.
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

const ORGANIZATIONS: Record<string, { id: string; name: string; type: string }> = {
  [CNCGA]: { id: CNCGA, name: 'Collectif National des Centres de Gestion Agréés', type: 'cncga' },
  [DCK]: { id: DCK, name: 'DC-KNOWING CGA', type: 'cga' },
  [BOUAKE]: { id: BOUAKE, name: 'CGA Démo Bouaké', type: 'cga' },
};

const STATUS_LABELS: Record<TrainingStatus, string> = {
  draft: 'Brouillon',
  published: 'Publiée',
  cancelled: 'Annulée',
  completed: 'Terminée',
};

const REGISTRATION_LABELS: Record<RegistrationStatus, string> = {
  pending_approval: 'En attente de validation',
  registered: 'Inscrit',
  waitlisted: 'En liste d’attente',
  cancelled: 'Désinscrit',
  rejected: 'Refusée',
};

const AUDIENCE_LABELS: Record<string, string> = {
  cga_managers: 'Responsables CGA',
  cga_staff: 'Tous les agents CGA',
  cga_accountants: 'Comptables CGA',
  all_members: 'Tous les adhérents',
  members_by_regime: 'Adhérents d’un régime',
  new_members: 'Nouveaux adhérents',
};

const FORMAT_LABELS: Record<string, string> = {
  in_person: 'Présentiel',
  online: 'En ligne',
  workshop: 'Atelier',
};

/** Personnes simulées : agents des CGA et accès adhérents de DC-KNOWING. */
type Person = {
  membership_id: string;
  name: string;
  kind: 'agent' | 'member';
  role: string;
  organizationId: string;
  company_name: string | null;
};

export const demoTrainingPeople: Record<string, Person> = {
  awa: {
    membership_id: '01mbs000000000000000000t01',
    name: 'Awa Koné',
    kind: 'agent',
    role: 'Comptable',
    organizationId: DCK,
    company_name: null,
  },
  yao: {
    membership_id: '01mbs000000000000000000t02',
    name: 'Yao Kouadio',
    kind: 'agent',
    role: 'Gérant',
    organizationId: BOUAKE,
    company_name: null,
  },
  marc: {
    membership_id: '01mbs000000000000000000t03',
    name: 'Marc Ehui',
    kind: 'agent',
    role: 'Secrétaire',
    organizationId: DCK,
    company_name: null,
  },
  adjoua: {
    membership_id: '01mbs000000000000000000t04',
    name: 'Adjoua Brou',
    kind: 'member',
    role: 'Dirigeant',
    organizationId: DCK,
    company_name: 'BOULANGERIE ADJOUA',
  },
  kone: {
    membership_id: '01mbs000000000000000000t05',
    name: 'Ibrahim Koné',
    kind: 'member',
    role: 'Dirigeant',
    organizationId: DCK,
    company_name: 'KONÉ TRANSPORTS',
  },
};

export const demoTrainingIds = {
  /** CNCGA, publiée, à venir, 2 places prises sur 2 (RG-FOR-03). */
  fiscal: '01trn000000000000000000001',
  /** CNCGA, publiée, session passée : émargement et clôture. */
  closing: '01trn000000000000000000002',
  /** CNCGA, brouillon. */
  draft: '01trn000000000000000000003',
  /** CNCGA, ouverte aux adhérents, 1 place prise sur 1 (liste d'attente). */
  fne: '01trn000000000000000000004',
  /** DC-KNOWING, payante, validation des inscriptions (RG-FOR-05, 06). */
  cash: '01trn000000000000000000005',
  /** DC-KNOWING, terminée : l'adhérente a été présente et peut évaluer. */
  workshop: '01trn000000000000000000006',
};

type StoredTraining = Omit<
  Training,
  'status_label' | 'format_label' | 'organizer' | 'seats' | 'can' | 'my_registration' | 'audiences'
> & {
  organizationId: string;
  audiences: { type: string; regime: string | null }[];
};

type StoredRegistration = {
  id: string;
  trainingId: string;
  personId: string;
  status: RegistrationStatus;
  rejection_reason: string | null;
  registered_at: string;
  payment_status: TrainingRegistration['payment_status'];
  paid_on: string | null;
  payment_method: string | null;
  receipt_number: string | null;
  attendance: 'present' | 'absent' | null;
  certificate: boolean;
  evaluation: { score: number; comment: string | null } | null;
};

function training(
  id: string,
  organizationId: string,
  title: string,
  overrides: Partial<StoredTraining> = {},
): StoredTraining {
  return {
    id,
    organizationId,
    title,
    description: null,
    format: 'in_person',
    location: 'Abidjan, Plateau',
    online_url: null,
    trainer: 'Cabinet Formation Plus',
    starts_at: '2030-04-15T09:00:00+00:00',
    ends_at: '2030-04-15T17:00:00+00:00',
    capacity: null,
    price: 0,
    requires_approval: false,
    status: 'published',
    published_at: '2026-10-01T08:00:00+00:00',
    cancellation_reason: null,
    completed_at: null,
    audiences: [{ type: 'cga_staff', regime: null }],
    ...overrides,
  };
}

let sequence = 0;

function registration(
  trainingId: string,
  personId: string,
  overrides: Partial<StoredRegistration> = {},
): StoredRegistration {
  sequence += 1;

  return {
    id: `01reg0000000000000000000${String(sequence).padStart(2, '0')}`,
    trainingId,
    personId,
    status: 'registered',
    rejection_reason: null,
    registered_at: `2026-10-${String(sequence).padStart(2, '0')}T10:00:00+00:00`,
    payment_status: 'not_applicable',
    paid_on: null,
    payment_method: null,
    receipt_number: null,
    attendance: null,
    certificate: false,
    evaluation: null,
    ...overrides,
  };
}

export function createTrainingsBackend() {
  sequence = 0;
  const trainings: StoredTraining[] = [
    training(demoTrainingIds.fiscal, CNCGA, 'Annexe fiscale 2030 : les nouveautés', {
      capacity: 2,
      description: 'Lecture commentée de l’annexe fiscale.',
    }),
    training(demoTrainingIds.closing, CNCGA, 'Clôture des comptes 2025', {
      starts_at: '2026-02-10T09:00:00+00:00',
      ends_at: '2026-02-10T17:00:00+00:00',
    }),
    training(demoTrainingIds.draft, CNCGA, 'Sécurité sociale des dirigeants', {
      status: 'draft',
      published_at: null,
      starts_at: '2030-06-01T09:00:00+00:00',
      ends_at: '2030-06-01T12:00:00+00:00',
    }),
    training(demoTrainingIds.fne, CNCGA, 'Facturation électronique (FNE)', {
      capacity: 1,
      format: 'online',
      location: null,
      online_url: 'https://visio.cncga.test/fne',
      starts_at: '2030-05-20T09:00:00+00:00',
      ends_at: '2030-05-20T11:00:00+00:00',
      audiences: [{ type: 'all_members', regime: null }],
    }),
    training(demoTrainingIds.cash, DCK, 'Tenue de caisse au régime TEE', {
      price: 15000,
      requires_approval: true,
      capacity: 20,
      starts_at: '2030-03-12T14:00:00+00:00',
      ends_at: '2030-03-12T17:00:00+00:00',
      audiences: [{ type: 'members_by_regime', regime: 'TEE' }],
    }),
    training(demoTrainingIds.workshop, DCK, 'Atelier FNE 2026', {
      format: 'workshop',
      status: 'completed',
      starts_at: '2026-01-20T09:00:00+00:00',
      ends_at: '2026-01-20T12:00:00+00:00',
      completed_at: '2026-01-21T08:00:00+00:00',
      audiences: [{ type: 'all_members', regime: null }],
    }),
  ];
  const registrations: StoredRegistration[] = [
    registration(demoTrainingIds.fiscal, 'awa'),
    registration(demoTrainingIds.fiscal, 'yao'),
    registration(demoTrainingIds.closing, 'awa'),
    registration(demoTrainingIds.closing, 'yao'),
    registration(demoTrainingIds.fne, 'kone'),
    registration(demoTrainingIds.cash, 'adjoua', {
      status: 'pending_approval',
      payment_status: 'to_pay',
    }),
    registration(demoTrainingIds.cash, 'kone', { payment_status: 'to_pay' }),
    registration(demoTrainingIds.workshop, 'adjoua', { attendance: 'present', certificate: true }),
    registration(demoTrainingIds.workshop, 'kone', {
      attendance: 'present',
      certificate: true,
      evaluation: { score: 4, comment: 'Très concret.' },
    }),
  ];
  const ACTIVE: RegistrationStatus[] = ['pending_approval', 'registered', 'waitlisted'];
  let receipts = 0;
  /** Personnes notifiées à la publication (`PublishTraining`). */
  const NOTIFIED = 12;

  function started(stored: StoredTraining): boolean {
    return new Date(stored.starts_at).getTime() <= Date.now();
  }

  function of(trainingId: string): StoredRegistration[] {
    return registrations.filter((item) => item.trainingId === trainingId);
  }

  function rank(item: StoredRegistration): number | null {
    if (item.status !== 'waitlisted') {
      return null;
    }

    return (
      of(item.trainingId)
        .filter((other) => other.status === 'waitlisted')
        .findIndex((other) => other.id === item.id) + 1
    );
  }

  function seats(stored: StoredTraining) {
    const all = of(stored.id);
    const registered = all.filter((item) => item.status === 'registered').length;

    return {
      registered,
      waitlisted: all.filter((item) => item.status === 'waitlisted').length,
      pending: all.filter((item) => item.status === 'pending_approval').length,
      left: stored.capacity === null ? null : Math.max(0, stored.capacity - registered),
    };
  }

  function present(stored: StoredTraining, withCan: boolean): Training {
    const open = stored.status === 'published' && !started(stored);
    const { organizationId, audiences, ...rest } = stored;

    return {
      ...rest,
      format_label: FORMAT_LABELS[stored.format] ?? stored.format,
      status_label: STATUS_LABELS[stored.status],
      organizer: ORGANIZATIONS[organizationId],
      audiences: audiences.map((audience) => ({
        type: audience.type,
        label: AUDIENCE_LABELS[audience.type] ?? audience.type,
        regime: audience.regime,
        new_member_months: audience.type === 'new_members' ? 6 : null,
      })),
      seats: seats(stored),
      ...(withCan
        ? {
            can: {
              update: stored.status === 'draft' || open,
              publish: stored.status === 'draft',
              cancel: stored.status === 'draft' || stored.status === 'published',
              register: open,
              attendance: stored.status === 'published' && !open,
              complete: stored.status === 'published' && !open,
            },
          }
        : {}),
    };
  }

  function presentRegistration(
    item: StoredRegistration,
    options: { company: boolean; attendee?: boolean },
  ): TrainingRegistration {
    const person = demoTrainingPeople[item.personId];
    const stored = trainings.find((candidate) => candidate.id === item.trainingId);

    return {
      id: item.id,
      status: item.status,
      status_label: REGISTRATION_LABELS[item.status],
      waitlist_rank: rank(item),
      rejection_reason: item.rejection_reason,
      registered_at: item.registered_at,
      person: {
        membership_id: person.membership_id,
        name: person.name,
        kind: person.kind,
        organization: {
          id: person.organizationId,
          name: ORGANIZATIONS[person.organizationId].name,
        },
        company_name: options.company || options.attendee === true ? person.company_name : null,
      },
      payment_status: item.payment_status,
      payment_status_label: item.payment_status,
      paid_on: item.paid_on,
      payment_method: item.payment_method,
      receipt_number: item.receipt_number,
      receipt_url:
        item.receipt_number === null ? null : `/fichiers/recus/${item.receipt_number}.pdf`,
      attendance: item.attendance,
      certificate_url: item.certificate ? `/fichiers/attestations/${item.id}.pdf` : null,
      ...(options.attendee === true && stored !== undefined
        ? {
            training: {
              id: stored.id,
              title: stored.title,
              starts_at: stored.starts_at,
              status: stored.status,
              organizer: ORGANIZATIONS[stored.organizationId].name,
            },
            evaluation: item.evaluation,
          }
        : {}),
    };
  }

  /** Statut d'une nouvelle inscription : validation, places ou liste d'attente (RG-FOR-03, 05). */
  function admit(stored: StoredTraining): RegistrationStatus {
    if (stored.requires_approval) {
      return 'pending_approval';
    }
    const left = seats(stored).left;

    return left === null || left > 0 ? 'registered' : 'waitlisted';
  }

  /** Promotion automatique du premier de la liste d'attente (RG-FOR-03). */
  function promote(stored: StoredTraining) {
    const left = seats(stored).left;
    const next = of(stored.id).find((item) => item.status === 'waitlisted');

    if (next !== undefined && (left === null || left > 0)) {
      next.status = 'registered';
    }
  }

  function enroll(stored: StoredTraining, personIds: string[]) {
    const counts = { registered: 0, waitlisted: 0, pending: 0, already: 0 };

    for (const personId of personIds) {
      if (
        of(stored.id).some((item) => item.personId === personId && ACTIVE.includes(item.status))
      ) {
        counts.already += 1;
        continue;
      }
      const status = admit(stored);

      registrations.push(
        registration(stored.id, personId, {
          status,
          registered_at: new Date().toISOString(),
          payment_status: stored.price > 0 ? 'to_pay' : 'not_applicable',
        }),
      );
      if (status === 'pending_approval') {
        counts.pending += 1;
      } else if (status === 'waitlisted') {
        counts.waitlisted += 1;
      } else {
        counts.registered += 1;
      }
    }

    return counts;
  }

  function personIdOf(membershipId: string): string | undefined {
    return Object.entries(demoTrainingPeople).find(
      ([, person]) => person.membership_id === membershipId,
    )?.[0];
  }

  function candidates(stored: StoredTraining, scope: 'network' | 'cga', search: string) {
    const term = search.toLowerCase();

    return Object.entries(demoTrainingPeople)
      .filter(([, person]) =>
        scope === 'network' ? person.kind === 'agent' : person.organizationId === DCK,
      )
      .filter(([, person]) => term === '' || person.name.toLowerCase().includes(term))
      .map(([personId, person]): TrainingCandidate => ({
        membership_id: person.membership_id,
        name: person.name,
        kind: person.kind,
        role: person.role,
        organization: {
          id: person.organizationId,
          name: ORGANIZATIONS[person.organizationId].name,
        },
        company_name: scope === 'network' ? null : person.company_name,
        registration_status:
          of(stored.id).find((item) => item.personId === personId && ACTIVE.includes(item.status))
            ?.status ?? null,
      }));
  }

  function register(stored: StoredTraining, body: unknown, scope: 'network' | 'cga') {
    if (stored.status !== 'published' || started(stored)) {
      return conflict(
        'training_registration_closed',
        'Les inscriptions à cette formation sont closes.',
      );
    }
    const ids = (formInput(body).membership_ids ?? []) as string[];

    if (ids.length === 0) {
      return invalid({ membership_ids: 'Le champ membership ids est obligatoire.' });
    }
    const personIds = ids.map(personIdOf);
    const outside = personIds.some(
      (personId) =>
        personId === undefined ||
        (scope === 'cga' && demoTrainingPeople[personId].organizationId !== DCK) ||
        (scope === 'network' && demoTrainingPeople[personId].kind !== 'agent'),
    );

    if (outside) {
      return invalid({ membership_ids: 'Le champ membership ids sélectionné est invalide.' });
    }
    const counts = enroll(stored, personIds as string[]);

    return { status: 201, data: { data: present(stored, false), meta: { registrations: counts } } };
  }

  function validate(input: Input): Record<string, string> {
    const errors: Record<string, string> = {};
    const starts = text(input, 'starts_at');
    const ends = text(input, 'ends_at');

    if (text(input, 'title') === '') {
      errors.title = 'Le champ titre est obligatoire.';
    }
    if (starts === '') {
      errors.starts_at = 'Le champ début est obligatoire.';
    } else if (new Date(starts).getTime() <= Date.now()) {
      errors.starts_at = 'Le champ début doit être une date postérieure à maintenant.';
    }
    if (ends !== '' && starts !== '' && ends < starts) {
      errors.ends_at = 'Le champ fin doit être une date postérieure ou égale au début.';
    }
    const url = text(input, 'online_url');

    if (url !== '' && !url.startsWith('https://')) {
      errors.online_url = 'Le champ lien en ligne doit être une URL valide.';
    }
    const audiences = (input.audiences ?? []) as unknown[];

    if (audiences.length === 0) {
      errors.audiences = 'Le champ publics cibles est obligatoire.';
    }

    return errors;
  }

  function fill(stored: StoredTraining, input: Input) {
    stored.title = text(input, 'title');
    stored.description = (input.description as string | null) ?? null;
    stored.format = text(input, 'format');
    stored.location = (input.location as string | null) ?? null;
    stored.online_url = (input.online_url as string | null) ?? null;
    stored.trainer = (input.trainer as string | null) ?? null;
    stored.starts_at = new Date(`${text(input, 'starts_at')}Z`).toISOString();
    stored.ends_at = new Date(`${text(input, 'ends_at')}Z`).toISOString();
    stored.capacity = (input.capacity as number | null) ?? null;
    stored.price = Number(input.price ?? 0);
    stored.requires_approval = input.requires_approval === true;
    stored.audiences = (input.audiences as { type: string; regime?: string }[]).map((audience) => ({
      type: audience.type,
      regime: audience.regime ?? null,
    }));
  }

  /* --------------------------------------------------------------------- Organisateur */

  function organizer(
    space: 'network' | 'cga',
    method: string,
    id: string | undefined,
    action: string | undefined,
    query: URLSearchParams,
    body: unknown,
    context: Context,
  ): ApiReply {
    const permission = space === 'network' ? 'trainings.network.manage' : 'trainings.cga.manage';
    const organizationId = space === 'network' ? CNCGA : context.organizationId;

    if (!context.allows(permission) || context.memberId !== null) {
      return forbidden;
    }
    if (id === undefined) {
      if (method === 'POST') {
        const input = formInput(body);
        const errors = validate(input);

        if (Object.keys(errors).length > 0) {
          return invalid(errors);
        }
        const created = training(
          `01trn0000000000000000000${String(trainings.length + 1).padStart(2, '0')}`,
          organizationId ?? CNCGA,
          '',
          { status: input.publish === true ? 'published' : 'draft', published_at: null },
        );

        fill(created, input);
        trainings.unshift(created);

        return {
          status: 201,
          data: {
            data: present(created, true),
            meta: { notified: input.publish === true ? NOTIFIED : null },
          },
        };
      }
      const period = query.get('filter[period]') ?? 'upcoming';
      const items = trainings
        .filter((stored) => stored.organizationId === organizationId)
        .filter((stored) => (period === 'past' ? started(stored) : !started(stored)))
        .map((stored) => present(stored, true));

      return paginated(items, query);
    }

    const stored = trainings.find(
      (candidate) => candidate.id === id && candidate.organizationId === organizationId,
    );

    if (stored === undefined) {
      return notFound;
    }
    const input = formInput(body);

    switch (`${method} ${action ?? ''}`) {
      case 'GET ':
        return ok(present(stored, true));
      case 'PUT ': {
        if (!(present(stored, true).can?.update ?? false)) {
          return conflict(
            'training_locked',
            'Une formation commencée, terminée ou annulée ne se modifie plus.',
          );
        }
        const errors = validate(input);

        if (Object.keys(errors).length > 0) {
          return invalid(errors);
        }
        fill(stored, input);

        return ok(present(stored, true));
      }
      case 'POST publish':
        if (stored.status !== 'draft') {
          return conflict('training_not_draft', 'Seule une formation en brouillon se publie.');
        }
        stored.status = 'published';
        stored.published_at = new Date().toISOString();

        return { status: 200, data: { data: present(stored, true), meta: { notified: NOTIFIED } } };
      case 'POST cancel':
        if (text(input, 'reason') === '') {
          return invalid({ reason: 'Le champ motif est obligatoire.' });
        }
        stored.status = 'cancelled';
        stored.cancellation_reason = text(input, 'reason');

        return ok(present(stored, true));
      case 'GET registrations':
        return ok(
          of(stored.id).map((item) => presentRegistration(item, { company: space === 'cga' })),
        );
      case 'GET candidates':
        return ok(candidates(stored, space, query.get('search') ?? ''));
      case 'POST registrations':
        return register(stored, body, space);
      case 'PUT attendance': {
        if (!(present(stored, true).can?.attendance ?? false)) {
          return conflict(
            'training_not_in_session',
            'L’émargement et la clôture se font à partir du début d’une session publiée.',
          );
        }
        const marks = (input.attendance ?? []) as { registration_id: string; status: string }[];

        for (const mark of marks) {
          const item = of(stored.id).find((candidate) => candidate.id === mark.registration_id);

          if (item !== undefined) {
            item.attendance = mark.status as 'present' | 'absent';
          }
        }

        return ok({ marked: marks.length });
      }
      case 'POST complete': {
        const unmarked = of(stored.id).filter(
          (item) => item.status === 'registered' && item.attendance === null,
        ).length;

        if (unmarked > 0) {
          return conflict(
            'training_attendance_incomplete',
            `Émargez chaque inscrit avant de clôturer la session (${String(unmarked)} restant(s)).`,
            { unmarked },
          );
        }
        const attendees = of(stored.id).filter((item) => item.attendance === 'present');

        for (const item of attendees) {
          item.certificate = true;
        }
        stored.status = 'completed';
        stored.completed_at = new Date().toISOString();

        return {
          status: 200,
          data: { data: present(stored, true), meta: { certificates: attendees.length } },
        };
      }
      case 'GET evaluations': {
        const presentOnes = of(stored.id).filter((item) => item.attendance === 'present');
        const answers = presentOnes.filter((item) => item.evaluation !== null);
        const scores = answers.map((item) => item.evaluation?.score ?? 0);

        return ok({
          present: presentOnes.length,
          answers: answers.length,
          average:
            scores.length === 0
              ? null
              : scores.reduce((sum, score) => sum + score, 0) / scores.length,
          distribution: Object.fromEntries(
            [1, 2, 3, 4, 5].map((score) => [
              String(score),
              scores.filter((value) => value === score).length,
            ]),
          ),
          comments: answers
            .filter((item) => item.evaluation?.comment !== null)
            .map((item) => ({
              score: item.evaluation?.score ?? 0,
              comment: item.evaluation?.comment ?? '',
            })),
        });
      }
      default:
        break;
    }

    const review = /^registrations\/([^/]+)\/(approve|reject|payment)$/.exec(action ?? '');
    const item =
      review === null ? undefined : of(stored.id).find((candidate) => candidate.id === review[1]);

    if (method !== 'POST' || review === null || item === undefined) {
      return notFound;
    }
    if (review[2] === 'payment') {
      if (item.payment_status !== 'to_pay') {
        return conflict(
          'training_payment_not_due',
          'Aucun paiement n’est attendu pour cette inscription.',
        );
      }
      if (text(input, 'paid_on') === '') {
        return invalid({ paid_on: 'Le champ date du paiement est obligatoire.' });
      }
      receipts += 1;
      item.payment_status = 'paid';
      item.paid_on = text(input, 'paid_on');
      item.payment_method = text(input, 'method');
      item.receipt_number = `REC-DCK-2030-${String(receipts).padStart(5, '0')}`;

      return ok(presentRegistration(item, { company: space === 'cga' }));
    }
    if (item.status !== 'pending_approval') {
      return conflict(
        'training_registration_not_pending',
        'Cette inscription n’attend pas de validation.',
      );
    }
    if (review[2] === 'approve') {
      const left = seats(stored).left;

      item.status = left === null || left > 0 ? 'registered' : 'waitlisted';
    } else {
      item.status = 'rejected';
      item.rejection_reason = text(input, 'reason') || null;
    }

    return ok(presentRegistration(item, { company: space === 'cga' }));
  }

  /* ------------------------------------------------------------ Formations du réseau (CGA) */

  function catalog(
    method: string,
    id: string | undefined,
    action: string | undefined,
    query: URLSearchParams,
    body: unknown,
    context: Context,
  ): ApiReply {
    if (!context.allows('trainings.cga.manage') || context.memberId !== null) {
      return forbidden;
    }
    const network = trainings.filter(
      (stored) => stored.organizationId === CNCGA && stored.status !== 'draft',
    );

    if (id === undefined) {
      const period = query.get('filter[period]') ?? 'upcoming';

      return paginated(
        network
          .filter((stored) => (period === 'past' ? started(stored) : !started(stored)))
          .map((stored) => present(stored, false)),
        query,
      );
    }
    const stored = network.find((candidate) => candidate.id === id);

    if (stored === undefined) {
      return notFound;
    }
    switch (`${method} ${action ?? ''}`) {
      case 'GET ':
        return ok(present(stored, false));
      case 'GET registrations':
        return ok(
          of(stored.id)
            .filter((item) => demoTrainingPeople[item.personId].organizationId === DCK)
            .map((item) => presentRegistration(item, { company: true })),
        );
      case 'GET candidates':
        return ok(candidates(stored, 'cga', query.get('search') ?? ''));
      case 'POST registrations':
        return register(stored, body, 'cga');
      default:
        return notFound;
    }
  }

  /** Désinscription (RG-FOR-04) : jusqu'à J-2, puis promotion de la liste d'attente (RG-FOR-03). */
  function cancelRegistration(item: StoredRegistration): ApiReply | null {
    const stored = trainings.find((candidate) => candidate.id === item.trainingId);

    if (!ACTIVE.includes(item.status) || stored === undefined) {
      return conflict('training_registration_not_active', 'Cette inscription n’est plus en cours.');
    }
    const limit = new Date(stored.starts_at).getTime() - 2 * 24 * 3600 * 1000;

    if (Date.now() > limit) {
      return conflict(
        'training_cancellation_closed',
        'La désinscription n’est plus possible à moins de 2 jours de la session.',
        { days: 2 },
      );
    }
    const wasRegistered = item.status === 'registered';

    item.status = 'cancelled';
    if (wasRegistered) {
      promote(stored);
    }

    return null;
  }

  /* -------------------------------------------------------------------- L'adhérent */

  function me(method: string, path: string, body: unknown, context: Context): ApiReply | undefined {
    const match =
      /^\/me\/(trainings|training-registrations)(?:\/([^/]+))?(?:\/(register|cancel|evaluation))?$/.exec(
        path,
      );

    if (match === null) {
      return undefined;
    }
    if (context.memberId === null || !context.allows('member.trainings.register')) {
      return forbidden;
    }
    const [, collection, id, action] = match;
    const personId = 'adjoua';
    const mine = registrations.filter((item) => item.personId === personId);

    if (collection === 'trainings') {
      if (method === 'GET' && id === undefined) {
        const registered = mine
          .filter((item) => item.status !== 'cancelled')
          .map((item) => item.trainingId);
        const open = trainings.filter(
          (stored) =>
            registered.includes(stored.id) ||
            (stored.status === 'published' &&
              !started(stored) &&
              (stored.organizationId === CNCGA || stored.organizationId === DCK) &&
              stored.audiences.some((audience) =>
                ['all_members', 'members_by_regime', 'new_members'].includes(audience.type),
              )),
        );

        return ok(
          open.map((stored) => ({
            ...present(stored, false),
            my_registration: (() => {
              const item = mine.find(
                (candidate) =>
                  candidate.trainingId === stored.id && candidate.status !== 'cancelled',
              );

              return item === undefined
                ? null
                : presentRegistration(item, { company: false, attendee: true });
            })(),
          })),
        );
      }
      const stored = trainings.find((candidate) => candidate.id === id);

      if (method !== 'POST' || action !== 'register' || stored === undefined) {
        return notFound;
      }
      if (stored.status !== 'published' || started(stored)) {
        return conflict(
          'training_registration_closed',
          'Les inscriptions à cette formation sont closes.',
        );
      }
      if (mine.some((item) => item.trainingId === stored.id && ACTIVE.includes(item.status))) {
        return conflict('training_already_registered', 'Vous êtes déjà inscrit à cette formation.');
      }
      enroll(stored, [personId]);
      const created = registrations.at(-1) as StoredRegistration;

      return ok(presentRegistration(created, { company: false, attendee: true }), 201);
    }

    if (method === 'GET' && id === undefined) {
      return ok(
        [...mine]
          .reverse()
          .map((item) => presentRegistration(item, { company: false, attendee: true })),
      );
    }
    const item = mine.find((candidate) => candidate.id === id);

    if (method !== 'POST' || item === undefined) {
      return notFound;
    }
    if (action === 'cancel') {
      return (
        cancelRegistration(item) ??
        ok(presentRegistration(item, { company: false, attendee: true }))
      );
    }
    const stored = trainings.find((candidate) => candidate.id === item.trainingId);

    if (stored?.status !== 'completed' || item.attendance !== 'present') {
      return conflict(
        'training_evaluation_closed',
        'Seule une personne présente évalue une session clôturée.',
      );
    }
    const input = formInput(body);
    const score = Number(input.score);

    if (!(score >= 1 && score <= 5)) {
      return invalid({ score: 'Le champ note doit être entre 1 et 5.' });
    }
    item.evaluation = { score, comment: (input.comment as string | null) ?? null };

    return ok(presentRegistration(item, { company: false, attendee: true }));
  }

  return {
    trainings: () => trainings,
    registrations: () => registrations,
    route(
      method: string,
      path: string,
      query: URLSearchParams,
      body: unknown,
      context: Context,
    ): ApiReply | undefined {
      const own = /^\/(network|cga)\/trainings(?:\/([^/]+))?(?:\/(.+))?$/.exec(path);

      if (own !== null) {
        return organizer(own[1] as 'network' | 'cga', method, own[2], own[3], query, body, context);
      }
      const network = /^\/cga\/network-trainings(?:\/([^/]+))?(?:\/([a-z]+))?$/.exec(path);

      if (network !== null) {
        return catalog(method, network[1], network[2], query, body, context);
      }
      const centre = /^\/cga\/training-registrations\/([^/]+)\/cancel$/.exec(path);

      if (centre !== null && method === 'POST') {
        if (!context.allows('trainings.cga.manage') || context.memberId !== null) {
          return forbidden;
        }
        const item = registrations.find(
          (candidate) =>
            candidate.id === centre[1] &&
            demoTrainingPeople[candidate.personId].organizationId === DCK,
        );

        if (item === undefined) {
          return notFound;
        }

        return cancelRegistration(item) ?? ok(presentRegistration(item, { company: true }));
      }

      return me(method, path, body, context);
    },
  };
}
