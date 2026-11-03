import type {
  CategorySummary,
  InstanceStatus,
  MemberObligation,
  ObligationCategory,
  ObligationInstance,
  ObligationType,
} from '@/features/obligations/api/obligations-api';
import { formInput } from './api-member-records';
import {
  conflict,
  forbidden,
  invalid,
  notFound,
  ok,
  text,
  type ApiReply,
  type Input,
} from './api-replies';

/*
 * Obligations simulées, d'après `ObligationTypeController`, `MemberObligationController` et
 * `ObligationInstanceController` (`ObligationTypeResource`, `MemberObligationResource`,
 * `ObligationInstanceResource`, récapitulatif `ObligationSummary`) : catalogue du centre, propositions
 * du moteur d'applicabilité (régime, effectif), confirmation ou retrait des propositions, échéances
 * (faite, montant dû, paiement, diligence, déclaration de l'adhérent à confirmer ou rejeter, autre
 * administration). Droits : `members.view` (lecture), `obligations.manage` (gestion).
 */
/** `memberId` : dossier de l'accès adhérent actif (`TenantContext::memberId()`). */
type Context = { allows: (permission: string) => boolean; memberId?: string | null };

/** Ce que le moteur lit du dossier : régime et effectif. */
export type MemberFacts = { regime: string; employees_count: number | null };

export const demoObligationTypeIds = {
  tee: '01obt000000000000000000tee',
  rme: '01obt000000000000000000rme',
  dsf: '01obt000000000000000000dsf',
  cnps: '01obt00000000000000000cnps',
  cmu: '01obt000000000000000000cmu',
  patente: '01obt0000000000000000ptnte',
  visit: '01obt0000000000000000visit',
};

export const demoInstanceIds = {
  teeT3: '01oin00000000000000000tee3',
  teeT4: '01oin00000000000000000tee4',
  dsf: '01oin000000000000000000dsf',
  cnps: '01oin00000000000000000cnps',
  cmu: '01oin000000000000000000cmu',
  visit: '01oin0000000000000000visit',
  cnpsDeclaration: '01oin00000000000000000cnpd',
};

const CATEGORY_LABELS: Record<ObligationCategory, string> = {
  tax: 'Impôts',
  cnps: 'CNPS',
  cmu: 'CMU',
  other: 'Autres',
};

const KIND_LABELS = { declaration: 'Déclaration', payment: 'Paiement', diligence: 'Diligence' };

const STATUS_LABELS: Record<InstanceStatus, string> = {
  todo: 'À faire',
  done: 'Faite',
  to_pay: 'À payer',
  partially_paid: 'Payé en partie',
  paid: 'Payé',
  not_established: 'Non établie',
  in_progress: 'En cours',
  established: 'Établie',
  cancelled: 'Annulée',
};

function type(overrides: Partial<ObligationType> & Pick<ObligationType, 'id' | 'code' | 'label'>) {
  const category = overrides.category ?? 'tax';
  const kind = overrides.kind ?? 'payment';

  return {
    local: false,
    catalog_version: '2026.1',
    category,
    category_label: CATEGORY_LABELS[category],
    authority: 'DGI',
    platform: 'e-impots',
    kind,
    kind_label: KIND_LABELS[kind],
    periodicity: 'quarterly',
    periodicity_label: 'Trimestrielle',
    tax_nature: null,
    tax_nature_label: null,
    has_abatement: false,
    active: true,
    data_status: 'provisional',
    can: { update: false },
    ...overrides,
  } satisfies ObligationType;
}

export function demoObligationTypes(): ObligationType[] {
  return [
    type({
      id: demoObligationTypeIds.tee,
      code: 'TEE',
      label: 'Taxe d’État de l’entreprenant (TEE)',
      tax_nature: 'tee',
      tax_nature_label: 'TEE',
      has_abatement: true,
    }),
    type({
      id: demoObligationTypeIds.rme,
      code: 'IME',
      label: 'Impôt des microentreprises',
      tax_nature: 'rme',
      tax_nature_label: 'Impôt microentreprise',
    }),
    type({
      id: demoObligationTypeIds.dsf,
      code: 'DSF',
      label: 'Déclaration statistique et fiscale',
      kind: 'declaration',
      periodicity: 'annual',
      periodicity_label: 'Annuelle',
    }),
    type({
      id: demoObligationTypeIds.cnps,
      code: 'CNPS',
      label: 'Cotisations sociales CNPS',
      category: 'cnps',
      authority: 'CNPS',
      platform: 'e-CNPS',
      periodicity: 'monthly',
      periodicity_label: 'Mensuelle',
    }),
    type({
      id: demoObligationTypeIds.cmu,
      code: 'CMU',
      label: 'Cotisation CMU',
      category: 'cmu',
      authority: 'CNAM',
      platform: null,
      periodicity: 'monthly',
      periodicity_label: 'Mensuelle',
    }),
    type({
      id: demoObligationTypeIds.patente,
      code: 'PAT',
      label: 'Patente',
      periodicity: 'annual',
      periodicity_label: 'Annuelle',
      tax_nature: 'patente',
      tax_nature_label: 'Patente',
    }),
    type({
      id: demoObligationTypeIds.visit,
      code: 'LOC-VISITE',
      label: 'Visite annuelle du centre',
      local: true,
      catalog_version: null,
      category: 'other',
      kind: 'diligence',
      authority: null,
      platform: null,
      periodicity: 'annual',
      periodicity_label: 'Annuelle',
      can: { update: true },
    }),
  ];
}

/** `ApplicabilityEngine` simplifié : TEE ou RME selon le régime, CNPS et CMU avec des salariés. */
export function suggestedTypeIds(regime: string, employees: number | null): string[] {
  const ids =
    regime === 'TEE'
      ? [demoObligationTypeIds.tee]
      : [demoObligationTypeIds.rme, demoObligationTypeIds.dsf];

  return employees !== null && employees > 0
    ? [...ids, demoObligationTypeIds.cnps, demoObligationTypeIds.cmu]
    : ids;
}

function instance(
  overrides: Partial<ObligationInstance> & Pick<ObligationInstance, 'id' | 'label'>,
): ObligationInstance {
  const category = overrides.category ?? 'tax';
  const kind = overrides.kind ?? 'payment';
  const status = overrides.status ?? (kind === 'payment' ? 'to_pay' : 'todo');

  return {
    category,
    category_label: CATEGORY_LABELS[category],
    kind,
    kind_label: KIND_LABELS[kind],
    authority_name: null,
    period_label: '2026-T3',
    period_start: '2026-07-01',
    period_end: '2026-09-30',
    due_date: '2026-09-15',
    overdue: false,
    platform: 'e-impots',
    tax_nature: null,
    tax_nature_label: null,
    amount_gross: null,
    amount_due: null,
    amount_paid: 0,
    balance: null,
    status,
    status_label: STATUS_LABELS[status],
    member_declared_status: null,
    member_declared_status_label: null,
    member_declared_at: null,
    member_declaration_rejection: null,
    parent_instance_id: null,
    done_at: null,
    payments: [],
    can: {},
    ...overrides,
  };
}

/** Échéances du dossier d'Adjoua (TEE, deux salariés) : une ligne de chaque cas du bloc. */
export function demoInstances(): ObligationInstance[] {
  return [
    instance({
      id: demoInstanceIds.teeT3,
      label: 'TEE — 3e trimestre 2026',
      tax_nature: 'tee',
      tax_nature_label: 'TEE',
      amount_gross: 60_000,
      amount_due: 30_000,
      amount_paid: 10_000,
      balance: 20_000,
      status: 'partially_paid',
      overdue: true,
      payments: [
        {
          id: '01opy000000000000000000001',
          amount: 10_000,
          paid_on: '2026-09-10',
          source: 'cga_entry',
          source_label: 'Saisie du CGA',
          status: 'confirmed',
          status_label: 'Confirmé',
          confirmed_at: '2026-09-10T10:00:00Z',
          proof: null,
        },
      ],
    }),
    instance({
      id: demoInstanceIds.teeT4,
      label: 'TEE — 4e trimestre 2026',
      tax_nature: 'tee',
      tax_nature_label: 'TEE',
      period_label: '2026-T4',
      period_start: '2026-10-01',
      period_end: '2026-12-31',
      due_date: '2026-12-15',
    }),
    instance({
      id: demoInstanceIds.dsf,
      label: 'Déclaration statistique et fiscale 2025',
      kind: 'declaration',
      period_label: '2025',
      period_start: '2025-01-01',
      period_end: '2025-12-31',
      due_date: '2026-06-30',
      member_declared_status: 'done',
      member_declared_status_label: 'Déclarée faite',
      member_declared_at: '2026-10-28T09:00:00Z',
    }),
    instance({
      id: demoInstanceIds.cnps,
      label: 'CNPS — octobre 2026',
      category: 'cnps',
      platform: 'e-CNPS',
      period_label: '2026-10',
      period_start: '2026-10-01',
      period_end: '2026-10-31',
      due_date: '2026-11-15',
      amount_due: 45_000,
      balance: 45_000,
      member_declared_status: 'paid',
      member_declared_status_label: 'Déclarée payée',
      member_declared_at: '2026-11-02T09:00:00Z',
      // Paiement déclaré par l'adhérent, avec sa preuve : en attente de confirmation (RG-OBL-09).
      payments: [
        {
          id: '01opy000000000000000000002',
          amount: 45_000,
          paid_on: '2026-11-01',
          source: 'member_declaration',
          source_label: 'Déclaration de l’adhérent',
          status: 'pending_confirmation',
          status_label: 'À confirmer',
          confirmed_at: null,
          proof: {
            id: '01fil000000000000000000001',
            name: 'releve-cnps.pdf',
            url: 'https://files.test/releve-cnps.pdf',
          },
        },
      ],
    }),
    instance({
      id: demoInstanceIds.cnpsDeclaration,
      label: 'Déclaration CNPS — octobre 2026',
      category: 'cnps',
      kind: 'declaration',
      platform: 'e-CNPS',
      period_label: '2026-10',
      period_start: '2026-10-01',
      period_end: '2026-10-31',
      due_date: '2026-11-15',
    }),
    instance({
      id: demoInstanceIds.cmu,
      label: 'CMU — octobre 2026',
      category: 'cmu',
      platform: null,
      period_label: '2026-10',
      period_start: '2026-10-01',
      period_end: '2026-10-31',
      due_date: '2026-11-15',
      amount_due: 2_000,
      amount_paid: 2_000,
      balance: 0,
      status: 'paid',
    }),
    instance({
      id: demoInstanceIds.visit,
      label: 'Visite annuelle du centre',
      category: 'other',
      kind: 'diligence',
      platform: null,
      period_label: '2026',
      period_start: '2026-01-01',
      period_end: '2026-12-31',
      due_date: '2026-12-31',
      status: 'not_established',
    }),
  ];
}

const OPEN: InstanceStatus[] = [
  'todo',
  'to_pay',
  'partially_paid',
  'not_established',
  'in_progress',
];

export function summaryOf(
  instances: ObligationInstance[],
): Record<ObligationCategory, CategorySummary> {
  const summary = {} as Record<ObligationCategory, CategorySummary>;

  for (const category of Object.keys(CATEGORY_LABELS) as ObligationCategory[]) {
    const lines = instances.filter(
      (item) => item.category === category && item.status !== 'cancelled',
    );
    const open = lines.filter((item) => OPEN.includes(item.status));

    summary[category] = {
      total_due: lines
        .filter((item) => item.kind === 'payment')
        .reduce((sum, item) => sum + (item.balance ?? 0), 0),
      amounts_to_enter: lines.filter((item) => item.kind === 'payment' && item.amount_due === null)
        .length,
      open: open.length,
      overdue: open.filter((item) => item.overdue).length,
    };
  }

  return summary;
}

function integer(input: Input, field: string): number | null {
  const raw = input[field];

  if (raw === null || raw === undefined || raw === '') {
    return null;
  }
  const value = Number(raw);

  return Number.isInteger(value) && value >= 0 ? value : Number.NaN;
}

const TODAY = '2026-11-03';

function statusOfPayment(item: ObligationInstance): InstanceStatus {
  if (item.amount_due === null || item.amount_paid === 0) {
    return 'to_pay';
  }

  return item.amount_paid >= item.amount_due ? 'paid' : 'partially_paid';
}

export function createObligationsBackend({
  memberOf = () => ({ regime: 'TEE', employees_count: 2 }),
  types = demoObligationTypes(),
  instances: initialInstances = { '01mbr000000000000000000001': demoInstances() },
}: {
  /** Régime et effectif d'un dossier du centre, `null` s'il n'existe pas. */
  memberOf?: (memberId: string) => MemberFacts | null;
  types?: ObligationType[];
  instances?: Record<string, ObligationInstance[]>;
} = {}) {
  const assigned = new Map<string, MemberObligation[]>();
  const schedules = new Map<string, ObligationInstance[]>(Object.entries(initialInstances));
  let sequence = 0;

  function nextId(prefix: string): string {
    sequence += 1;

    return `${prefix}${String(sequence).padStart(26 - prefix.length, '0')}`;
  }

  /** Obligations d'un dossier ; à la première lecture, les propositions du moteur (inscription). */
  function obligationsOf(memberId: string, facts: MemberFacts): MemberObligation[] {
    const existing = assigned.get(memberId);

    if (existing !== undefined) {
      return existing;
    }
    const proposed = suggestedTypeIds(facts.regime, facts.employees_count).map(
      (typeId): MemberObligation => ({
        id: nextId('01mob'),
        status: 'suggested',
        status_label: 'Proposée',
        source: 'suggested',
        source_label: 'Proposée par la plateforme',
        start_date: TODAY,
        end_date: null,
        confirmed_at: null,
        type: types.find((item) => item.id === typeId) as ObligationType,
        can: { confirm: false, remove: false },
      }),
    );

    assigned.set(memberId, proposed);

    return proposed;
  }

  function shownObligation(item: MemberObligation, manages: boolean): MemberObligation {
    return {
      ...item,
      can: {
        confirm: manages && item.status === 'suggested',
        remove: manages && item.status !== 'removed',
      },
    };
  }

  function shownInstance(item: ObligationInstance, manages: boolean): ObligationInstance {
    const live = manages && item.status !== 'cancelled';

    return {
      ...item,
      status_label: STATUS_LABELS[item.status],
      can: {
        mark_done: live && item.kind === 'declaration' && item.status === 'todo',
        set_amount: live && item.kind === 'payment',
        record_payment:
          live && item.kind === 'payment' && item.amount_due !== null && (item.balance ?? 0) > 0,
        set_diligence: live && item.kind === 'diligence',
        review_declaration: live && item.member_declared_status !== null,
      },
    };
  }

  /** Ligne vue de l'espace adhérent : seule action, « Signaler comme fait / payé » (RG-OBL-09). */
  function memberView(item: ObligationInstance): ObligationInstance {
    const declarable =
      item.member_declared_status === null &&
      ((item.kind === 'declaration' && item.status === 'todo') ||
        (item.kind === 'payment' && ['to_pay', 'partially_paid'].includes(item.status)));

    return { ...item, status_label: STATUS_LABELS[item.status], can: { declare: declarable } };
  }

  function memberRoute(method: string, path: string, body: unknown, context: Context): ApiReply {
    if (
      !context.allows('member.obligations.view') ||
      context.memberId === null ||
      context.memberId === undefined
    ) {
      return forbidden;
    }
    const memberId = context.memberId;
    const list = (schedules.get(memberId) ?? []).filter((item) => item.status !== 'cancelled');

    if (method === 'GET' && path === '/member/obligations') {
      return { status: 200, data: { data: list.map(memberView), summary: summaryOf(list) } };
    }
    const target = list.find(
      (item) => item.id === /^\/member\/obligations\/([^/]+)\/declare$/.exec(path)?.[1],
    );

    if (method !== 'POST' || target === undefined) {
      return notFound;
    }
    if (!context.allows('member.obligations.declare')) {
      return forbidden;
    }
    if (target.member_declared_status !== null) {
      return conflict(
        'member_declaration_pending',
        'Une déclaration attend déjà la confirmation de votre CGA.',
      );
    }
    if (target.kind === 'diligence') {
      return conflict('instance_not_declarable', 'Cette échéance ne se déclare pas.');
    }
    const declared = {
      member_declared_at: `${TODAY}T10:00:00Z`,
      member_declaration_rejection: null,
    };

    if (target.kind === 'declaration') {
      if (target.status !== 'todo') {
        return conflict('instance_already_done', 'Cette déclaration est déjà faite.');
      }

      return ok(
        memberView(
          saveRaw(memberId, {
            ...target,
            ...declared,
            member_declared_status: 'done',
            member_declared_status_label: 'Déclarée faite',
          }),
        ),
      );
    }
    const input = formInput(body);
    const amount = integer(input, 'amount');

    if (amount === null || Number.isNaN(amount) || amount < 1) {
      return invalid({ amount: 'Le montant doit être un entier positif.' });
    }
    if (text(input, 'paid_on') === '') {
      return invalid({ paid_on: 'Le champ date du paiement est obligatoire.' });
    }
    if (target.balance !== null && amount > target.balance) {
      return conflict(
        'obligation_payment_exceeds_balance',
        `Le paiement dépasse le reste dû (${String(target.balance)} F CFA).`,
      );
    }

    return ok(
      memberView(
        saveRaw(memberId, {
          ...target,
          ...declared,
          member_declared_status: 'paid',
          member_declared_status_label: 'Déclarée payée',
          payments: [
            ...target.payments,
            {
              id: nextId('01opy'),
              amount,
              paid_on: text(input, 'paid_on'),
              source: 'member_declaration',
              source_label: 'Déclaration de l’adhérent',
              status: 'pending_confirmation',
              status_label: 'À confirmer',
              confirmed_at: null,
              proof:
                input.proof instanceof File
                  ? {
                      id: nextId('01fil'),
                      name: input.proof.name,
                      url: `https://files.test/${input.proof.name}`,
                    }
                  : null,
            },
          ],
        }),
      ),
    );
  }

  /** Enregistre la ligne telle quelle (déclaration de l'adhérent : montants inchangés). */
  function saveRaw(memberId: string, updated: ObligationInstance): ObligationInstance {
    schedules.set(
      memberId,
      (schedules.get(memberId) ?? []).map((item) => (item.id === updated.id ? updated : item)),
    );

    return updated;
  }

  function saveInstance(memberId: string, updated: ObligationInstance): ObligationInstance {
    const withBalance: ObligationInstance =
      updated.kind === 'payment'
        ? {
            ...updated,
            balance:
              updated.amount_due === null
                ? null
                : Math.max(0, updated.amount_due - updated.amount_paid),
          }
        : updated;
    const computed: ObligationInstance =
      withBalance.kind === 'payment'
        ? { ...withBalance, status: statusOfPayment(withBalance) }
        : withBalance;

    schedules.set(
      memberId,
      (schedules.get(memberId) ?? []).map((item) => (item.id === computed.id ? computed : item)),
    );

    return shownInstance(computed, true);
  }

  function addPayment(
    item: ObligationInstance,
    amount: number,
    paidOn: string,
    source: string,
  ): ObligationInstance {
    return {
      ...item,
      amount_paid: item.amount_paid + amount,
      payments: [
        ...item.payments,
        {
          id: nextId('01opy'),
          amount,
          paid_on: paidOn,
          source,
          source_label:
            source === 'member_declaration' ? 'Déclaration de l’adhérent' : 'Saisie du CGA',
          status: 'confirmed',
          status_label: 'Confirmé',
          confirmed_at: `${TODAY}T10:00:00Z`,
          proof: null,
        },
      ],
    };
  }

  function obligationsRoute(
    method: string,
    memberId: string,
    action: string | undefined,
    body: unknown,
    manages: boolean,
    facts: MemberFacts,
  ): ApiReply {
    const list = obligationsOf(memberId, facts);

    if (method === 'GET' && action === undefined) {
      return ok(list.map((item) => shownObligation(item, manages)));
    }
    if (!manages) {
      return forbidden;
    }
    const input = (body ?? {}) as Input;

    if (action === 'review') {
      const confirm = Array.isArray(input.confirm) ? (input.confirm as string[]) : [];
      const remove = Array.isArray(input.remove) ? (input.remove as string[]) : [];

      if (confirm.length === 0 && remove.length === 0) {
        return invalid({
          confirm: 'Le champ confirm est obligatoire quand remove n’est pas présent.',
        });
      }
      for (const id of confirm) {
        if (list.find((item) => item.id === id)?.status !== 'suggested') {
          return conflict(
            'obligation_not_reviewable',
            'Cette obligation a déjà été traitée : rechargez le dossier.',
          );
        }
      }
      for (const id of remove) {
        const found = list.find((item) => item.id === id);

        if (found === undefined || found.status === 'removed') {
          return conflict(
            'obligation_not_reviewable',
            'Cette obligation a déjà été traitée : rechargez le dossier.',
          );
        }
      }
      const reviewed = list.map((item): MemberObligation => {
        if (confirm.includes(item.id)) {
          return {
            ...item,
            status: 'active',
            status_label: 'Active',
            confirmed_at: `${TODAY}T10:00:00Z`,
          };
        }

        return remove.includes(item.id)
          ? { ...item, status: 'removed', status_label: 'Retirée', end_date: TODAY }
          : item;
      });

      assigned.set(memberId, reviewed);

      return ok(reviewed.map((item) => shownObligation(item, true)));
    }

    const chosen = types.find((item) => item.id === text(input, 'obligation_type_id'));

    if (chosen === undefined || !chosen.active) {
      return conflict(
        'obligation_type_unavailable',
        'Cette obligation n’est pas proposée à votre centre : choisissez une obligation du catalogue en vigueur ou une obligation locale active.',
      );
    }
    if (list.some((item) => item.type.id === chosen.id && item.status !== 'removed')) {
      return conflict(
        'obligation_already_assigned',
        'Cette obligation est déjà attribuée à ce dossier.',
      );
    }
    const added: MemberObligation = {
      id: nextId('01mob'),
      status: 'active',
      status_label: 'Active',
      source: 'manual',
      source_label: 'Ajoutée par le CGA',
      start_date: TODAY,
      end_date: null,
      confirmed_at: `${TODAY}T10:00:00Z`,
      type: chosen,
      can: { confirm: false, remove: true },
    };

    assigned.set(memberId, [...list, added]);

    return ok(shownObligation(added, true), 201);
  }

  function instanceAction(
    memberId: string,
    target: ObligationInstance,
    action: string,
    body: unknown,
  ): ApiReply {
    const input = formInput(body);

    switch (action) {
      case 'done': {
        if (target.kind !== 'declaration') {
          return conflict('instance_not_declaration', 'Cette échéance n’est pas une déclaration.');
        }
        if (target.status !== 'todo') {
          return conflict('instance_already_done', 'Cette déclaration est déjà faite.');
        }
        if (text(input, 'done_on') === '') {
          return invalid({ done_on: 'Le champ date est obligatoire.' });
        }

        return ok(
          saveInstance(memberId, { ...target, status: 'done', done_at: text(input, 'done_on') }),
        );
      }
      case 'amount': {
        const due = integer(input, 'amount_due');
        const gross = integer(input, 'amount_gross');

        if (due === null || Number.isNaN(due)) {
          return invalid({ amount_due: 'Le montant dû doit être un entier positif.' });
        }
        if (gross !== null && (Number.isNaN(gross) || gross < due)) {
          return invalid({
            amount_gross: 'Le montant brut doit être supérieur ou égal au montant dû.',
          });
        }
        if (due < target.amount_paid) {
          return conflict(
            'obligation_amount_below_paid',
            `Le montant dû ne peut pas être inférieur au montant déjà payé (${target.amount_paid.toLocaleString('fr-FR')} F CFA).`,
          );
        }

        return ok(saveInstance(memberId, { ...target, amount_due: due, amount_gross: gross }));
      }
      case 'payments': {
        const amount = integer(input, 'amount');

        if (amount === null || Number.isNaN(amount) || amount < 1) {
          return invalid({ amount: 'Le montant doit être un entier positif.' });
        }
        if (text(input, 'paid_on') === '') {
          return invalid({ paid_on: 'Le champ date du paiement est obligatoire.' });
        }
        if (target.amount_due === null) {
          return conflict(
            'obligation_amount_unknown',
            'Saisissez d’abord le montant dû de cette échéance.',
          );
        }
        if (amount > (target.balance ?? 0)) {
          return conflict(
            'obligation_payment_exceeds_balance',
            `Le paiement dépasse le reste dû (${String(target.balance)} F CFA).`,
          );
        }

        return ok(
          saveInstance(memberId, addPayment(target, amount, text(input, 'paid_on'), 'cga_entry')),
          201,
        );
      }
      case 'diligence': {
        const status = text(input, 'status') as InstanceStatus;

        if (!['not_established', 'in_progress', 'established'].includes(status)) {
          return invalid({ status: 'Le statut est invalide.' });
        }

        return ok(saveInstance(memberId, { ...target, status }));
      }
      case 'member-declaration/confirm': {
        if (target.member_declared_status === null) {
          return conflict(
            'member_declaration_missing',
            'Aucune déclaration de l’adhérent n’attend de confirmation.',
          );
        }
        const cleared = {
          ...target,
          member_declared_status: null,
          member_declared_status_label: null,
          member_declared_at: null,
        };

        if (target.kind === 'declaration') {
          return ok(
            saveInstance(memberId, {
              ...cleared,
              status: 'done',
              done_at: text(input, 'done_on') || TODAY,
            }),
          );
        }
        const pending = target.payments.find((item) => item.status === 'pending_confirmation');
        const due = integer(input, 'amount_due');
        const corrected = integer(input, 'amount');
        const withDue =
          due === null || Number.isNaN(due) ? cleared : { ...cleared, amount_due: due };
        const amount =
          corrected === null || Number.isNaN(corrected) ? (pending?.amount ?? 0) : corrected;

        if (withDue.amount_due === null) {
          return conflict(
            'obligation_amount_unknown',
            'Saisissez d’abord le montant dû de cette échéance.',
          );
        }
        if (amount > withDue.amount_due - withDue.amount_paid) {
          return conflict(
            'obligation_payment_exceeds_balance',
            `Le paiement dépasse le reste dû (${String(withDue.amount_due - withDue.amount_paid)} F CFA).`,
          );
        }

        return ok(
          saveInstance(memberId, {
            ...withDue,
            amount_paid: withDue.amount_paid + amount,
            payments: withDue.payments.map((item) =>
              item.id === pending?.id
                ? {
                    ...item,
                    amount,
                    paid_on: text(input, 'paid_on') || item.paid_on,
                    status: 'confirmed',
                    status_label: 'Confirmé',
                    confirmed_at: `${TODAY}T10:00:00Z`,
                  }
                : item,
            ),
          }),
        );
      }
      case 'member-declaration/reject': {
        if (target.member_declared_status === null) {
          return conflict(
            'member_declaration_missing',
            'Aucune déclaration de l’adhérent n’attend de confirmation.',
          );
        }
        if (text(input, 'reason') === '') {
          return invalid({ reason: 'Le champ motif est obligatoire.' });
        }

        return ok(
          saveInstance(memberId, {
            ...target,
            payments: target.payments.map((item) =>
              item.status === 'pending_confirmation'
                ? { ...item, status: 'rejected', status_label: 'Rejeté' }
                : item,
            ),
            member_declared_status: null,
            member_declared_status_label: null,
            member_declared_at: null,
            member_declaration_rejection: text(input, 'reason'),
          }),
        );
      }
      default:
        return notFound;
    }
  }

  function instancesRoute(
    method: string,
    memberId: string,
    rest: string | undefined,
    body: unknown,
    manages: boolean,
  ): ApiReply {
    const list = schedules.get(memberId) ?? [];

    if (rest === undefined) {
      if (method === 'GET') {
        return {
          status: 200,
          data: {
            data: list.map((item) => shownInstance(item, manages)),
            summary: summaryOf(list),
          },
        };
      }
      if (!manages) {
        return forbidden;
      }
      const input = (body ?? {}) as Input;
      const errors: Record<string, string> = {};
      const due = integer(input, 'amount_due');

      if (text(input, 'authority') === '') {
        errors.authority = 'Le champ administration est obligatoire.';
      }
      if (due === null || Number.isNaN(due)) {
        errors.amount_due = 'Le montant dû doit être un entier positif.';
      }
      if (text(input, 'due_date') === '') {
        errors.due_date = 'Le champ échéance est obligatoire.';
      }
      if (Object.keys(errors).length > 0) {
        return invalid(errors);
      }
      const created = instance({
        id: nextId('01oin'),
        label: text(input, 'label') || text(input, 'authority'),
        category: 'other',
        authority_name: text(input, 'authority'),
        platform: null,
        period_label: text(input, 'due_date').slice(0, 4),
        due_date: text(input, 'due_date'),
        amount_due: due,
        balance: due,
      });

      schedules.set(memberId, [...list, created]);

      return ok(shownInstance(created, true), 201);
    }

    const match = /^([^/]+)\/(.+)$/.exec(rest);
    const target = match === null ? undefined : list.find((item) => item.id === match[1]);

    if (match === null || target === undefined) {
      return notFound;
    }
    if (!manages) {
      return forbidden;
    }

    return instanceAction(memberId, target, match[2], body);
  }

  function route(
    method: string,
    path: string,
    query: URLSearchParams,
    body: unknown,
    context: Context,
  ): ApiReply | undefined {
    if (path.startsWith('/member/obligations')) {
      return memberRoute(method, path, body, context);
    }
    if (path.startsWith('/cga/obligation-types')) {
      if (!context.allows('members.view') && !context.allows('obligations.manage')) {
        return forbidden;
      }
      if (path === '/cga/obligation-types/suggestions') {
        const regime = query.get('regime') ?? '';

        if (regime === '') {
          return invalid({ regime: 'Le champ régime est obligatoire.' });
        }
        const employees = query.get('employees_count');
        const ids = suggestedTypeIds(regime, employees === null ? null : Number(employees));

        return ok(types.filter((item) => ids.includes(item.id)));
      }

      return ok(types.filter((item) => item.active));
    }

    const match = /^\/cga\/members\/([^/]+)\/(obligations|obligation-instances)(?:\/(.+))?$/.exec(
      path,
    );

    if (match === null) {
      return undefined;
    }
    if (!context.allows('members.view')) {
      return forbidden;
    }
    const [, memberId, resource, rest] = match;
    const facts = memberOf(memberId);

    if (facts === null) {
      return notFound;
    }
    const manages = context.allows('obligations.manage');

    return resource === 'obligations'
      ? obligationsRoute(method, memberId, rest, body, manages, facts)
      : instancesRoute(method, memberId, rest, body, manages);
  }

  return {
    route,
    /** Obligations attribuées d'un dossier, dans leur état courant. */
    obligations: (memberId: string) => assigned.get(memberId) ?? [],
    /** Échéances d'un dossier, dans leur état courant. */
    instances: (memberId: string) => schedules.get(memberId) ?? [],
  };
}
