import type {
  CenterObligation,
  PlanningLine,
  PlanningMember,
  Revenue,
} from '@/features/obligations/api/planning-api';
import { demoObligationTypeIds } from './api-obligations';
import { forbidden, invalid, notFound, ok, text, type ApiReply, type Input } from './api-replies';
import { demoMemberIds } from './demo-members';

/*
 * Planning simulé, d'après `ObligationPlanningController` (`PlanningLineResource`,
 * `PlanningMemberResource`, méta `from`, `to`, `upcoming`) et `CenterObligationController`
 * (`CenterObligationResource`). Droits : `members.view` (planning), `internal.manage` (obligations
 * du centre).
 */
type Context = { allows: (permission: string) => boolean };

const KINDS = { declaration: 'Déclaration', payment: 'Paiement', diligence: 'Diligence' };

function line(
  overrides: Partial<PlanningLine> & Pick<PlanningLine, 'due_date' | 'label'>,
): PlanningLine {
  return {
    obligation_type_id: null,
    category: 'tax',
    category_label: 'Impôts',
    kind: 'payment',
    kind_label: KINDS.payment,
    platform: 'e-impots',
    members: 1,
    done: 0,
    open: 1,
    ...overrides,
  };
}

export function demoPlanningLines(): PlanningLine[] {
  return [
    line({
      due_date: '2026-11-15',
      label: 'CNPS — octobre 2026',
      obligation_type_id: demoObligationTypeIds.cnps,
      category: 'cnps',
      category_label: 'CNPS',
      platform: 'e-CNPS',
      members: 3,
      done: 1,
      open: 2,
    }),
    line({
      due_date: '2026-11-15',
      label: 'CMU — octobre 2026',
      obligation_type_id: demoObligationTypeIds.cmu,
      category: 'cmu',
      category_label: 'CMU',
      platform: null,
      members: 2,
      done: 2,
      open: 0,
    }),
    line({
      due_date: '2026-12-15',
      label: 'TEE — 4e trimestre 2026',
      obligation_type_id: demoObligationTypeIds.tee,
      members: 2,
      done: 0,
      open: 2,
    }),
    line({
      due_date: '2026-12-31',
      label: 'Visite annuelle du centre',
      obligation_type_id: demoObligationTypeIds.visit,
      category: 'other',
      category_label: 'Autres',
      kind: 'diligence',
      kind_label: KINDS.diligence,
      platform: null,
    }),
  ];
}

function member(
  id: string,
  name: string,
  number: string,
  status: string,
  declared: string | null = null,
): PlanningMember {
  const labels: Record<string, string> = {
    to_pay: 'À payer',
    paid: 'Payé',
    not_established: 'Non établie',
  };

  return {
    instance_id: `01oin9${id.slice(-20)}`,
    status,
    status_label: labels[status] ?? status,
    member_declared_status: declared,
    amount_due: 45_000,
    balance: status === 'paid' ? 0 : 45_000,
    member: { id, company_name: name, membership_number: number, client_number: null },
  };
}

/** Adhérents de chaque ligne, par libellé. */
const MEMBERS: Record<string, PlanningMember[]> = {
  'CNPS — octobre 2026': [
    member(demoMemberIds.adjoua, 'BOULANGERIE ADJOUA', '2026-DCK-0001', 'to_pay', 'paid'),
    member(demoMemberIds.kouadio, 'ETS KOUADIO & FILS', '2026-DCK-0003', 'paid'),
    member(demoMemberIds.bamba, 'QUINCAILLERIE BAMBA', '2026-DCK-0002', 'to_pay'),
  ],
  'CMU — octobre 2026': [
    member(demoMemberIds.adjoua, 'BOULANGERIE ADJOUA', '2026-DCK-0001', 'paid'),
    member(demoMemberIds.bamba, 'QUINCAILLERIE BAMBA', '2026-DCK-0002', 'paid'),
  ],
};

function amounts(due: number, paid: number, toEnter = 0) {
  return {
    amount_due: due,
    amount_paid: paid,
    balance: due - paid,
    recovery_rate: due > 0 ? Math.round((paid / due) * 1000) / 10 : null,
    amounts_to_enter: toEnter,
  };
}

/** Mobilisation des recettes (`RevenueMobilization`) : TEE, CNPS ; trois contribuables. */
export function demoRevenue(from: string, to: string): Revenue {
  // Sans échéance de paiement après le 1er octobre 2026.
  if (from >= '2026-10-01') {
    return { from, to, totals: amounts(0, 0), natures: [], members: [], members_total: 0 };
  }

  return {
    from,
    to,
    totals: amounts(120_000, 75_000, 1),
    natures: [
      { tax_nature: 'tee', tax_nature_label: 'TEE', ...amounts(75_000, 30_000, 1) },
      { tax_nature: 'cnps', tax_nature_label: 'CNPS', ...amounts(45_000, 45_000) },
    ],
    members: [
      {
        member: {
          id: demoMemberIds.adjoua,
          company_name: 'BOULANGERIE ADJOUA',
          membership_number: '2026-DCK-0001',
          client_number: null,
        },
        ...amounts(60_000, 20_000),
      },
      {
        member: {
          id: demoMemberIds.bamba,
          company_name: 'QUINCAILLERIE BAMBA',
          membership_number: '2026-DCK-0002',
          client_number: null,
        },
        ...amounts(15_000, 10_000, 1),
      },
    ],
    members_total: 3,
  };
}

const CENTER_KINDS: Record<string, string> = {
  tax: 'Impôts du centre',
  cnps: 'CNPS',
  cmu: 'CMU',
  agreement_renewal: 'Renouvellement d’agrément',
  smt: 'SMT',
  other: 'Autre',
};

const CENTER_STATUSES: Record<string, string> = {
  todo: 'À faire',
  done: 'Faite',
  to_pay: 'À payer',
  paid: 'Payée',
};

export const demoCenterObligationIds = {
  tax: '01cob000000000000000000001',
  agreement: '01cob000000000000000000002',
  cnps: '01cob000000000000000000003',
};

export function demoCenterObligations(): CenterObligation[] {
  return [
    {
      id: demoCenterObligationIds.cnps,
      label: 'CNPS du centre — octobre 2026',
      kind: 'cnps',
      kind_label: CENTER_KINDS.cnps,
      due_date: '2026-11-15',
      overdue: false,
      amount: 180_000,
      status: 'to_pay',
      status_label: CENTER_STATUSES.to_pay,
      notes: null,
      reminder_sent_at: null,
    },
    {
      id: demoCenterObligationIds.agreement,
      label: 'Renouvellement de l’agrément',
      kind: 'agreement_renewal',
      kind_label: CENTER_KINDS.agreement_renewal,
      due_date: '2026-10-31',
      overdue: true,
      amount: null,
      status: 'todo',
      status_label: CENTER_STATUSES.todo,
      notes: 'Dossier à déposer à la DGI.',
      reminder_sent_at: '2026-10-17T08:00:00Z',
    },
  ];
}

export function createPlanningBackend({
  lines = demoPlanningLines(),
  center: initialCenter = demoCenterObligations(),
}: { lines?: PlanningLine[]; center?: CenterObligation[] } = {}) {
  let center = initialCenter;
  let sequence = 10;

  function planning(query: URLSearchParams): ApiReply {
    const from = query.get('from') ?? '2026-11-03';
    const to = query.get('to') ?? '2027-05-03';
    const type = query.get('obligation_type_id');
    const progress = query.get('progress');
    const shown = lines
      .filter((item) => item.due_date >= from && item.due_date <= to)
      .filter((item) => type === null || item.obligation_type_id === type)
      .flatMap((item): PlanningLine[] => {
        if (progress === 'open') {
          return item.open > 0 ? [{ ...item, members: item.open, done: 0 }] : [];
        }
        if (progress === 'done') {
          return item.done > 0 ? [{ ...item, members: item.done, open: 0 }] : [];
        }

        return [item];
      });

    return {
      status: 200,
      data: { data: shown, meta: { from, to, upcoming: { days: 15, count: 2, members: 2 } } },
    };
  }

  function validate(input: Input): Record<string, string> {
    const errors: Record<string, string> = {};

    if (text(input, 'label') === '') {
      errors.label = 'Le champ libellé est obligatoire.';
    }
    if (!(text(input, 'kind') in CENTER_KINDS)) {
      errors.kind = 'Le type est invalide.';
    }
    if (text(input, 'due_date') === '') {
      errors.due_date = 'Le champ échéance est obligatoire.';
    }
    if (!(text(input, 'status') in CENTER_STATUSES)) {
      errors.status = 'Le statut est invalide.';
    }
    const amount = input.amount;

    if (
      amount !== null &&
      amount !== undefined &&
      (!Number.isInteger(amount) || (amount as number) < 0)
    ) {
      errors.amount = 'Le montant doit être un entier positif.';
    }

    return errors;
  }

  function saved(id: string, input: Input): CenterObligation {
    const status = text(input, 'status') as CenterObligation['status'];

    return {
      id,
      label: text(input, 'label'),
      kind: text(input, 'kind') as CenterObligation['kind'],
      kind_label: CENTER_KINDS[text(input, 'kind')],
      due_date: text(input, 'due_date'),
      overdue: !['done', 'paid'].includes(status) && text(input, 'due_date') < '2026-11-03',
      amount: typeof input.amount === 'number' ? input.amount : null,
      status,
      status_label: CENTER_STATUSES[status],
      notes: typeof input.notes === 'string' && input.notes !== '' ? input.notes : null,
      reminder_sent_at: null,
    };
  }

  function centerRoute(method: string, path: string, body: unknown, context: Context): ApiReply {
    if (!context.allows('internal.manage')) {
      return forbidden;
    }
    if (method === 'GET' && path === '/cga/center-obligations') {
      return ok([...center].sort((a, b) => a.due_date.localeCompare(b.due_date)));
    }
    const input = (body ?? {}) as Input;
    const errors = validate(input);
    const id = /^\/cga\/center-obligations\/([^/]+)$/.exec(path)?.[1];

    if (id !== undefined && !center.some((item) => item.id === id)) {
      return notFound;
    }
    if (Object.keys(errors).length > 0) {
      return invalid(errors);
    }
    if (id === undefined) {
      sequence += 1;
      const created = saved(`01cob${String(sequence).padStart(21, '0')}`, input);

      center = [...center, created];

      return ok(created, 201);
    }
    const updated = saved(id, input);

    center = center.map((item) => (item.id === id ? updated : item));

    return ok(updated);
  }

  function route(
    method: string,
    path: string,
    query: URLSearchParams,
    body: unknown,
    context: Context,
  ): ApiReply | undefined {
    if (path.startsWith('/cga/center-obligations')) {
      return centerRoute(method, path, body, context);
    }
    if (!path.startsWith('/cga/obligation-planning')) {
      return undefined;
    }
    if (!context.allows('members.view')) {
      return forbidden;
    }
    if (path === '/cga/obligation-planning') {
      return planning(query);
    }
    if (path === '/cga/obligation-planning/revenue') {
      const from = query.get('from') ?? '2026-01-01';
      const to = query.get('to') ?? '2026-11-03';

      return to < from
        ? invalid({ to: 'La date de fin doit être postérieure ou égale à la date de début.' })
        : ok(demoRevenue(from, to));
    }
    if (path === '/cga/obligation-planning/members') {
      for (const field of ['due_date', 'kind', 'label']) {
        if ((query.get(field) ?? '') === '') {
          return invalid({ [field]: `Le champ ${field} est obligatoire.` });
        }
      }

      return ok(MEMBERS[query.get('label') ?? ''] ?? []);
    }

    return notFound;
  }

  return { route, center: () => center };
}
