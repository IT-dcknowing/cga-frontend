import type {
  HistoryEntry,
  Member,
  MemberAccess,
  MemberPiece,
  RadiationOptions,
} from '@/features/members/api/members-api';
import {
  conflict,
  forbidden,
  invalid,
  ok,
  paginated,
  type ApiReply,
  type Input,
} from './api-replies';
import { demoMemberIds } from './demo-members';

/*
 * Éléments d'un dossier simulés, d'après `PieceController`, `MemberAccessController`,
 * `MemberHistoryController`, `RegimeController`, `RadiationController` (`config/radiations.php`) et
 * `PortfolioController` : pièces et leur état, accès en ligne, historique, changement de régime,
 * radiation en deux temps, bascule vers le portefeuille CGA avec le droit d'adhésion payé.
 */
type Context = { allows: (permission: string) => boolean };

const TODAY = '2026-10-26';
const NOW = '2026-10-26T09:00:00Z';

/** Champs d'un corps `multipart/form-data` (`champ[clé]` en objet imbriqué), ou du JSON reçu. */
export function formInput(body: unknown): Input {
  if (!(body instanceof FormData)) {
    return (body ?? {}) as Input;
  }

  const input: Input = {};

  for (const [name, value] of body.entries()) {
    const nested = /^([^[]+)\[([^\]]+)\]$/.exec(name);

    if (nested === null) {
      input[name] = value;
    } else {
      const [, parent, key] = nested;
      const group = (input[parent] ?? {}) as Input;

      group[key] = value;
      input[parent] = group;
    }
  }

  return input;
}

function value(input: Input, field: string): string {
  const raw = input[field];

  return typeof raw === 'string' ? raw.trim() : '';
}

function truthy(input: Input, field: string): boolean {
  return input[field] === true || input[field] === '1' || input[field] === 'true';
}

/** Initiateurs et motifs de `config/radiations.php`, libellés de `lang/fr`. */
export const demoRadiationOptions: RadiationOptions = {
  initiators: [
    {
      value: 'cga',
      label: 'CGA / cabinet',
      sp_request_reference: true,
      reasons: [
        {
          value: 'zone_change',
          label: 'Changement de zone géographique',
          proof: { code: 'transfer_proof', label: 'justificatif de transfert' },
          immediate: false,
        },
        {
          value: 'reclassified_real_regime',
          label: 'Reclassement au régime réel',
          proof: null,
          immediate: false,
        },
        { value: 'death', label: 'Décès', proof: null, immediate: true },
        { value: 'other', label: 'Autre', proof: null, immediate: false },
      ],
    },
    {
      value: 'member',
      label: 'Contribuable',
      sp_request_reference: false,
      reasons: [
        {
          value: 'dissatisfaction',
          label: 'Insatisfaction des prestations',
          proof: { code: 'termination_letter', label: 'lettre de résiliation' },
          immediate: true,
        },
      ],
    },
  ],
  outcomes: [
    { value: 'closed', label: 'Dossier clos' },
    { value: 'moved_to_cabinet', label: 'Basculé dans le portefeuille Cabinet' },
  ],
};

const PIECE_LABELS: Record<string, string> = {
  rccm: 'Registre du commerce (RCCM)',
  dfe: 'Déclaration fiscale d’existence (DFE)',
  statutes: 'Statuts',
  location_plan: 'Plan de localisation',
  signed_cga_contract: 'Contrat CGA signé',
};

function piece(type: string, received: boolean, canUpload: boolean): MemberPiece {
  return {
    type,
    type_label: PIECE_LABELS[type],
    status: received ? 'received' : 'expected',
    status_label: received ? 'Reçue' : 'Attendue',
    file: received
      ? {
          id: `01fil-${type}`,
          name: `${type}.pdf`,
          mime_type: 'application/pdf',
          url: `https://files.test/${type}.pdf`,
        }
      : null,
    received_at: received ? '2026-01-10' : null,
    expires_at: null,
    can: { upload: canUpload },
  };
}

function access(overrides: Partial<MemberAccess>): MemberAccess {
  return {
    id: '01acc000000000000000000001',
    role: 'member_owner',
    role_label: 'Accès principal',
    first_name: 'Adjoua',
    last_name: 'Boulangère',
    phone: '+2250707070707',
    email: null,
    status: 'active',
    status_label: 'Actif',
    read_only_until: null,
    activated_at: '2026-01-12T10:00:00Z',
    invitation: null,
    can: { resend_invitation: false, disable: true, enable: false },
    ...overrides,
  };
}

function entry(id: number, overrides: Partial<HistoryEntry>): HistoryEntry {
  return {
    id,
    occurred_at: '2026-01-10T09:00:00Z',
    subject: 'member',
    subject_label: 'Dossier',
    event: 'updated',
    event_label: 'Modification',
    actor: 'Koffi Gérant',
    changes: [],
    justification: null,
    source: null,
    source_label: null,
    ...overrides,
  };
}

export function createMemberRecords(
  save: (member: Member) => Member,
  shown: (member: Member) => Member,
) {
  const pieces = new Map<string, MemberPiece[]>();
  const accesses = new Map<string, MemberAccess[]>([[demoMemberIds.adjoua, [access({})]]]);
  const history = new Map<string, HistoryEntry[]>([
    [
      demoMemberIds.adjoua,
      [
        entry(3, {
          occurred_at: '2026-03-02T14:30:00Z',
          changes: [
            {
              field: 'company_name',
              label: 'Raison sociale',
              before: 'BOULANGERIE ADJOUA SARL',
              after: 'BOULANGERIE ADJOUA',
            },
          ],
          justification: { name: 'kbis.pdf', url: 'https://files.test/kbis.pdf' },
        }),
        entry(2, {
          occurred_at: '2026-02-01T08:00:00Z',
          subject: 'revenue',
          subject_label: 'Chiffre d’affaires',
          event: 'created',
          event_label: 'Création',
          actor: null,
          changes: [{ field: 'amount', label: 'Montant', before: null, after: 9000000 }],
          source: 'compta_flow',
          source_label: 'Compta Flow',
        }),
        entry(1, { event: 'created', event_label: 'Création' }),
      ],
    ],
  ]);
  /** Droit d'adhésion TTC dû à la bascule (RG-PTF-03) : 25 000 F HT, TVA 18 %. */
  const ENTRY_FEE_DUE = 29500;
  let nextId = 100;

  function piecesOf(member: Member, context: Context): MemberPiece[] {
    const canUpload =
      context.allows('members.update') && !['radiated', 'closed'].includes(member.status);
    const types = [
      'rccm',
      'dfe',
      'statutes',
      'location_plan',
      ...(member.portfolio === 'cga' ? ['signed_cga_contract'] : []),
    ];
    const stored =
      pieces.get(member.id) ??
      types.map((type) => piece(type, member.pieces_status === 'complete', canUpload));

    pieces.set(member.id, stored);

    return stored.map((item) => ({ ...item, can: { upload: canUpload } }));
  }

  function log(
    member: Member,
    changes: HistoryEntry['changes'],
    overrides: Partial<HistoryEntry> = {},
  ) {
    history.set(member.id, [
      entry(++nextId, { occurred_at: NOW, changes, ...overrides }),
      ...(history.get(member.id) ?? []),
    ]);
  }

  function uploadPiece(member: Member, type: string, context: Context): ApiReply {
    if (!context.allows('members.update')) {
      return forbidden;
    }

    const current = piecesOf(member, context);

    if (!current.some((item) => item.type === type)) {
      return conflict('piece_not_applicable', 'Cette pièce n’est pas attendue pour ce dossier.');
    }

    const updated = current.map((item) =>
      item.type === type ? { ...piece(type, true, true), received_at: TODAY } : item,
    );

    pieces.set(member.id, updated);

    if (updated.every((item) => item.status === 'received')) {
      save({ ...member, pieces_status: 'complete' });
    }

    return { status: 201, data: { data: updated.find((item) => item.type === type) } };
  }

  function invite(member: Member, input: Input, context: Context): ApiReply {
    if (!context.allows('members.access.manage')) {
      return forbidden;
    }

    const errors: Record<string, string> = {};

    for (const field of ['first_name', 'last_name', 'phone']) {
      if (value(input, field) === '') {
        errors[field] = `Le champ ${field} est obligatoire.`;
      }
    }

    if (Object.keys(errors).length > 0) {
      return invalid(errors);
    }

    const list = accesses.get(member.id) ?? [];

    if (input.role === 'member_owner' && list.some((item) => item.role === 'member_owner')) {
      return conflict('member_owner_exists', 'Cet adhérent a déjà un accès principal.');
    }

    const created = access({
      id: `01acc9${String(++nextId).padStart(20, '0')}`,
      role: value(input, 'role'),
      role_label: input.role === 'member_owner' ? 'Accès principal' : 'Accès secondaire',
      first_name: value(input, 'first_name'),
      last_name: value(input, 'last_name'),
      phone: value(input, 'phone'),
      status: 'invited',
      status_label: 'Invité',
      activated_at: null,
      invitation: {
        channel: value(input, 'channel') || 'sms',
        sent_at: NOW,
        expires_at: '2026-11-02T09:00:00Z',
      },
      can: { resend_invitation: true, disable: true, enable: false },
    });

    accesses.set(member.id, [...list, created]);

    return { status: 201, data: { data: created } };
  }

  function accessAction(
    member: Member,
    accessId: string,
    action: string,
    context: Context,
  ): ApiReply {
    if (!context.allows('members.access.manage')) {
      return forbidden;
    }

    const list = accesses.get(member.id) ?? [];
    const target = list.find((item) => item.id === accessId);

    if (target === undefined) {
      return { status: 404, data: { message: 'Élément introuvable.', code: 'not_found' } };
    }

    const updated: MemberAccess =
      action === 'disable'
        ? {
            ...target,
            status: 'disabled',
            status_label: 'Désactivé',
            can: { resend_invitation: false, disable: false, enable: true },
          }
        : action === 'enable'
          ? {
              ...target,
              status: 'active',
              status_label: 'Actif',
              can: { resend_invitation: false, disable: true, enable: false },
            }
          : {
              ...target,
              invitation: { channel: 'sms', sent_at: NOW, expires_at: '2026-11-02T09:00:00Z' },
            };

    accesses.set(
      member.id,
      list.map((item) => (item.id === accessId ? updated : item)),
    );

    return ok(updated);
  }

  function changeRegime(member: Member, input: Input, context: Context): ApiReply {
    if (!context.allows('members.update')) {
      return forbidden;
    }

    const errors: Record<string, string> = {};

    for (const field of ['regime', 'effective_date', 'reason']) {
      if (value(input, field) === '') {
        errors[field] = `Le champ ${field} est obligatoire.`;
      }
    }

    if (!(input.justification instanceof File)) {
      errors.justification = 'Le champ justificatif est obligatoire.';
    }

    if (value(input, 'regime') === member.regime) {
      errors.regime = 'Choisissez un régime différent du régime actuel.';
    }

    if (Object.keys(errors).length > 0) {
      return invalid(errors);
    }

    const regime = value(input, 'regime');
    const real = regime === 'RSI' || regime === 'RNI';
    const updated = save({
      ...member,
      regime,
      regime_label: regime,
      regime_since: value(input, 'effective_date'),
      rsi_since: member.portfolio === 'cga' && real ? value(input, 'effective_date') : null,
      alerts:
        member.portfolio === 'cga' && real
          ? [
              {
                code: 'radiation_required',
                label: 'Radiation requise — reclassement au régime réel',
                since: value(input, 'effective_date'),
                days: 0,
                overdue: false,
              },
            ]
          : member.alerts.filter((alert) => alert.code !== 'radiation_required'),
    });

    log(updated, [{ field: 'regime', label: 'Régime', before: member.regime, after: regime }], {
      subject: 'regime_change',
      subject_label: 'Régime',
      event: 'created',
      event_label: 'Création',
    });

    return ok(shown(updated));
  }

  function radiationOf(input: Input, validated: boolean): Member['radiation'] {
    const initiator = demoRadiationOptions.initiators.find(
      (item) => item.value === input.initiator,
    );
    const reason = initiator?.reasons.find((item) => item.value === input.reason);
    const outcome = demoRadiationOptions.outcomes.find((item) => item.value === input.outcome);

    return {
      id: `01rad9${String(++nextId).padStart(20, '0')}`,
      status: validated ? 'validated' : 'requested',
      status_label: validated ? 'Radiation validée' : 'Radiation en cours',
      initiator: value(input, 'initiator'),
      initiator_label: initiator?.label ?? '',
      reason: value(input, 'reason'),
      reason_label: reason?.label ?? '',
      reason_other: null,
      effective_date: value(input, 'effective_date'),
      observation: value(input, 'observation'),
      proof: null,
      sp_request_reference: value(input, 'sp_request_reference') || null,
      requested_at: NOW,
      validated_at: validated ? NOW : null,
      validation_reference: null,
      outcome: validated ? value(input, 'outcome') : null,
      outcome_label: validated ? (outcome?.label ?? null) : null,
      report_year: null,
      report_quarter: null,
      cancellable_until: validated ? '2026-11-25T09:00:00Z' : null,
      can: { validate: !validated, cancel: true },
    } as Member['radiation'];
  }

  /** Effets de la validation (F-ADH-06) : radié, ou basculé dans le portefeuille Cabinet (RG-PTF-04). */
  function validated(member: Member, outcome: string): Member {
    return outcome === 'moved_to_cabinet'
      ? {
          ...member,
          status: 'active',
          status_label: 'Actif',
          portfolio: 'cabinet',
          portfolio_label: 'Portefeuille Cabinet',
          client_number: 'CAB-DCK-00009',
          referrer: null,
          contract: { ...member.contract, ended_on: TODAY },
          alerts: [],
          can: { ...member.can, request_radiation: false, move_to_cga: false },
        }
      : {
          ...member,
          status: 'radiated',
          status_label: 'Radié',
          alerts: [],
          can: { ...member.can, update: false, change_regime: false, request_radiation: false },
        };
  }

  function requestRadiation(member: Member, input: Input, context: Context): ApiReply {
    if (!context.allows('members.radiation.request')) {
      return forbidden;
    }

    const errors: Record<string, string> = {};

    for (const field of ['initiator', 'reason', 'effective_date', 'observation']) {
      if (value(input, field) === '') {
        errors[field] = `Le champ ${field} est obligatoire.`;
      }
    }

    const reason = demoRadiationOptions.initiators
      .find((item) => item.value === input.initiator)
      ?.reasons.find((item) => item.value === input.reason);

    if (reason?.proof && !(input.proof instanceof File)) {
      errors.proof = `Joignez la pièce exigée pour ce motif : ${reason.proof.label}.`;
    }

    if (Object.keys(errors).length > 0) {
      return invalid(errors);
    }

    if (member.status !== 'active' || member.portfolio !== 'cga') {
      return conflict(
        'radiation_not_allowed',
        'Seul un dossier actif du portefeuille CGA peut être radié.',
      );
    }

    const immediate = truthy(input, 'validate_now');
    const radiation = radiationOf(input, immediate);
    const updated = save(
      immediate
        ? { ...validated(member, value(input, 'outcome')), radiation }
        : {
            ...member,
            status: 'radiation_pending',
            status_label: 'Radiation en cours',
            alerts: [],
            radiation,
            can: { ...member.can, request_radiation: false },
          },
    );

    log(updated, [], {
      subject: 'radiation',
      subject_label: 'Radiation',
      event: 'radiation_requested',
      event_label: 'Radiation demandée',
    });

    return { status: 201, data: { data: shown(updated) } };
  }

  function validateRadiation(member: Member, input: Input, context: Context): ApiReply {
    if (!context.allows('members.radiation.validate')) {
      return forbidden;
    }

    if (member.radiation?.status !== 'requested') {
      return conflict(
        'radiation_not_requested',
        'Aucune radiation n’est en attente de validation.',
      );
    }

    if (!['closed', 'moved_to_cabinet'].includes(value(input, 'outcome'))) {
      return invalid({ outcome: 'Le champ issue est obligatoire.' });
    }

    const outcome = demoRadiationOptions.outcomes.find((item) => item.value === input.outcome);
    const updated = save({
      ...validated(member, value(input, 'outcome')),
      radiation: {
        ...member.radiation,
        status: 'validated',
        status_label: 'Radiation validée',
        validated_at: NOW,
        validation_reference: value(input, 'validation_reference') || null,
        outcome: value(input, 'outcome'),
        outcome_label: outcome?.label ?? null,
        cancellable_until: '2026-11-25T09:00:00Z',
        can: { validate: false, cancel: context.allows('members.radiation.cancel') },
      },
    });

    return ok(shown(updated));
  }

  function cancelRadiation(member: Member, input: Input, context: Context): ApiReply {
    if (!context.allows('members.radiation.cancel')) {
      return forbidden;
    }

    if (value(input, 'reason') === '') {
      return invalid({ reason: 'Le champ motif est obligatoire.' });
    }

    if (member.radiation === null) {
      return conflict('radiation_not_cancellable', 'Aucune radiation à annuler.');
    }

    return ok(
      shown(
        save({
          ...member,
          status: 'active',
          status_label: 'Actif',
          portfolio: 'cga',
          portfolio_label: 'Portefeuille CGA',
          radiation: null,
          can: { ...member.can, update: true, request_radiation: true, change_regime: true },
        }),
      ),
    );
  }

  function moveToCga(member: Member, input: Input, context: Context): ApiReply {
    if (!context.allows('members.portfolio.move')) {
      return forbidden;
    }

    const errors: Record<string, string> = {};

    if (value(input, 'cga_contract_signed_on') === '') {
      errors.cga_contract_signed_on = 'Le champ date de signature du contrat CGA est obligatoire.';
    }

    if (!truthy(input, 'cga_contract_confirmed')) {
      errors.cga_contract_confirmed = 'Le champ confirmation du contrat doit être accepté.';
    }

    if (Object.keys(errors).length > 0) {
      return invalid(errors);
    }

    const payment = input.entry_fee_payment as Input | undefined;

    if (payment === undefined || Number(payment.amount) < ENTRY_FEE_DUE) {
      return conflict(
        'membership_incomplete',
        'L’adhésion ne peut pas encore être validée : complétez ce qui manque.',
        {
          missing: ['entry_fee_payment'],
          balance: ENTRY_FEE_DUE - (payment === undefined ? 0 : Number(payment.amount)),
        },
      );
    }

    const moved = save({
      ...member,
      portfolio: 'cga',
      portfolio_label: 'Portefeuille CGA',
      membership_number: '2026-DCK-0151',
      contract: {
        signed_on: value(input, 'cga_contract_signed_on'),
        confirmed: true,
        ended_on: null,
      },
      can: { ...member.can, move_to_cga: false, request_radiation: true },
    });

    log(moved, [], {
      subject: 'portfolio_movement',
      subject_label: 'Portefeuille',
      event: 'portfolio_moved',
      event_label: 'Bascule de portefeuille',
    });

    return ok(shown(moved));
  }

  /** Routes `/cga/members/{id}/…` des éléments du dossier ; `undefined` si l'action n'en est pas une. */
  function route(
    member: Member,
    method: string,
    action: string,
    query: URLSearchParams,
    body: unknown,
    context: Context,
  ): ApiReply | undefined {
    const input = formInput(body);

    if (method === 'GET' && action === 'pieces') {
      return ok(piecesOf(member, context));
    }

    if (method === 'POST' && action.startsWith('pieces/')) {
      return uploadPiece(member, action.slice('pieces/'.length), context);
    }

    if (method === 'GET' && action === 'accesses') {
      return ok(accesses.get(member.id) ?? []);
    }

    if (method === 'POST' && action === 'accesses') {
      return invite(member, input, context);
    }

    const accessMatch = /^accesses\/([^/]+)\/(resend|disable|enable)$/.exec(action);

    if (method === 'POST' && accessMatch !== null) {
      return accessAction(member, accessMatch[1], accessMatch[2], context);
    }

    if (method === 'GET' && action === 'history') {
      return paginated(history.get(member.id) ?? [], query);
    }

    const writes: Record<string, (target: Member, data: Input, ctx: Context) => ApiReply> = {
      regimes: changeRegime,
      radiation: requestRadiation,
      'radiation/validate': validateRadiation,
      'radiation/cancel': cancelRadiation,
      'portfolio/cga': moveToCga,
    };

    return method === 'POST' && action in writes
      ? writes[action](member, input, context)
      : undefined;
  }

  return {
    route,
    log,
    /** Historique d'un dossier remplacé (pagination de l'onglet). */
    seedHistory(memberId: string, entries: HistoryEntry[]) {
      history.set(memberId, entries);
    },
    historyEntry: entry,
  };
}
