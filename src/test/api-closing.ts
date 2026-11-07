import {
  CLOSING_STEPS,
  type ClosingCampaign,
  type ClosingItem,
  type ClosingStep,
} from '@/features/closing/api/closing-api';
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
 * Campagne de clôture simulée, d'après `ClosingCampaignController` (`ClosingCampaignResource` et méta
 * `board` / `report`, `ClosingItemResource`, `ClosingAgentResource`) et `MemberClosingController`,
 * avec les règles de la décision 0006 : étapes dans l'ordre (409 `closing_step_out_of_order`), dépôt
 * légal avec référence et accusé, campagne close en lecture seule. Droits : `closing.view`,
 * `closing.manage`, `member.closing.view` ; le dépôt de pièces passe par les préoccupations (`api-concerns.ts`).
 * Aujourd’hui : 2027-03-10.
 */
type Context = { allows: (permission: string) => boolean; memberId?: string | null };

export const TODAY = '2027-03-10';

const STEP_LABELS: Record<ClosingStep, string> = {
  pieces: 'Pièces',
  regularisation: 'Régularisation',
  finalisation: 'Finalisation',
  filing: 'Dépôt',
};

const DUE: Record<ClosingStep, string> = {
  pieces: '2027-01-30',
  regularisation: '2027-02-28',
  finalisation: '2027-03-31',
  filing: '2027-05-30',
};

export const demoClosingIds = {
  campaign2026: '01clc000000000000000002026',
  campaign2025: '01clc000000000000000002025',
  adjoua: '01cli000000000000000000001',
  bamba: '01cli000000000000000000002',
  kouadio: '01cli000000000000000000003',
  cabinet: '01cli000000000000000000004',
  adjoua2025: '01cli000000000000000000005',
};

export const demoClosingAgents = [
  { id: '01usr0000000000000000agent1', name: 'Awa Diallo' },
  { id: '01usr0000000000000000agent2', name: 'Koffi Yao' },
];

type StoredItem = {
  id: string;
  campaignId: string;
  memberId: string;
  company: string;
  number: string | null;
  portfolio: 'cga' | 'cabinet';
  deliverable: 'smt' | 'financial_statements';
  done: Partial<Record<ClosingStep, string>>;
  assignedTo: string | null;
  filingReference: string | null;
};

function campaign(id: string, year: number, status: 'open' | 'closed'): ClosingCampaign {
  const shift = (date: string) => date.replace(/^\d{4}/, String(year + 1));

  return {
    id,
    fiscal_year: year,
    status,
    status_label: status === 'open' ? 'Ouverte' : 'Close',
    opened_at: `${year + 1}-01-02T00:45:00Z`,
    closed_at: status === 'open' ? null : `${year + 1}-06-30T00:00:00Z`,
    steps: CLOSING_STEPS.map((code) => ({ code, label: STEP_LABELS[code], due: shift(DUE[code]) })),
  };
}

function demoItems(): StoredItem[] {
  return [
    {
      id: demoClosingIds.adjoua,
      campaignId: demoClosingIds.campaign2026,
      memberId: demoMemberIds.adjoua,
      company: 'BOULANGERIE ADJOUA',
      number: '2026-DCK-0001',
      portfolio: 'cga',
      deliverable: 'smt',
      done: { pieces: '2027-01-20', regularisation: '2027-02-20', finalisation: '2027-03-05' },
      assignedTo: demoClosingAgents[0].id,
      filingReference: null,
    },
    {
      id: demoClosingIds.bamba,
      campaignId: demoClosingIds.campaign2026,
      memberId: demoMemberIds.bamba,
      company: 'QUINCAILLERIE BAMBA',
      number: '2026-DCK-0002',
      portfolio: 'cga',
      deliverable: 'smt',
      done: { pieces: '2027-01-25' },
      assignedTo: null,
      filingReference: null,
    },
    {
      id: demoClosingIds.kouadio,
      campaignId: demoClosingIds.campaign2026,
      memberId: demoMemberIds.kouadio,
      company: 'ETS KOUADIO & FILS',
      number: '2026-DCK-0003',
      portfolio: 'cga',
      deliverable: 'financial_statements',
      done: {},
      assignedTo: null,
      filingReference: null,
    },
    {
      id: demoClosingIds.cabinet,
      campaignId: demoClosingIds.campaign2026,
      memberId: demoMemberIds.cabinet,
      company: 'CABINET CLIENT',
      number: 'CAB-DCK-00001',
      portfolio: 'cabinet',
      deliverable: 'smt',
      done: {},
      assignedTo: null,
      filingReference: null,
    },
    {
      id: demoClosingIds.adjoua2025,
      campaignId: demoClosingIds.campaign2025,
      memberId: demoMemberIds.adjoua,
      company: 'BOULANGERIE ADJOUA',
      number: '2026-DCK-0001',
      portfolio: 'cga',
      deliverable: 'smt',
      done: {
        pieces: '2026-01-15',
        regularisation: '2026-02-15',
        finalisation: '2026-03-15',
        filing: '2026-05-10',
      },
      assignedTo: demoClosingAgents[1].id,
      filingReference: 'DGI-2026-778',
    },
  ];
}

export function createClosingBackend() {
  const campaigns = [
    campaign(demoClosingIds.campaign2026, 2026, 'open'),
    campaign(demoClosingIds.campaign2025, 2025, 'closed'),
  ];
  const items = demoItems();

  function campaignOf(id: string): ClosingCampaign | undefined {
    return campaigns.find((candidate) => candidate.id === id);
  }

  function nextStep(item: StoredItem): ClosingStep | null {
    return CLOSING_STEPS.find((step) => item.done[step] === undefined) ?? null;
  }

  function lateStep(item: StoredItem, owner: ClosingCampaign): ClosingStep | null {
    const next = nextStep(item);
    const due = owner.steps.find((step) => step.code === next)?.due;

    return next !== null && due !== undefined && due < TODAY && owner.status === 'open'
      ? next
      : null;
  }

  function resource(item: StoredItem, manages: boolean, forMember = false): ClosingItem {
    const owner = campaignOf(item.campaignId) as ClosingCampaign;
    const late = lateStep(item, owner);
    const agent = demoClosingAgents.find((candidate) => candidate.id === item.assignedTo) ?? null;
    const data: ClosingItem = {
      id: item.id,
      campaign: { id: owner.id, fiscal_year: owner.fiscal_year, status: owner.status },
      deliverable: item.deliverable,
      deliverable_label: item.deliverable === 'smt' ? 'SMT' : 'États financiers',
      steps: owner.steps.map((step) => ({
        ...step,
        done_on: item.done[step.code] ?? null,
        late: step.code === late,
      })),
      next_step: nextStep(item),
      late_step: late,
      filing_reference: item.filingReference,
      filing_receipt:
        item.filingReference === null
          ? null
          : {
              id: '01fil0000000000000000000rc',
              name: 'accuse.pdf',
              url: 'https://files.test/accuse.pdf',
            },
    };

    if (forMember) {
      return data;
    }

    return {
      ...data,
      member: {
        id: item.memberId,
        company_name: item.company,
        membership_number: item.portfolio === 'cga' ? item.number : null,
        client_number: item.portfolio === 'cabinet' ? item.number : null,
      },
      portfolio: item.portfolio,
      portfolio_label: item.portfolio === 'cga' ? 'Portefeuille CGA' : 'Portefeuille Cabinet',
      assigned_to: agent,
      can: {
        mark_step: manages && owner.status === 'open' && nextStep(item) !== null,
        update: manages && owner.status === 'open',
      },
    };
  }

  /** Dossiers de la campagne filtrés par portefeuille et agent (`portfolio` ou `filter[portfolio]`). */
  function filtered(campaignId: string, query: URLSearchParams, prefix = ''): StoredItem[] {
    const suffix = prefix === '' ? '' : ']';
    const portfolio = query.get(`${prefix}portfolio${suffix}`);
    const agent = query.get(`${prefix}assigned_to${suffix}`);

    return items
      .filter((item) => item.campaignId === campaignId)
      .filter((item) => portfolio === null || item.portfolio === portfolio)
      .filter((item) => agent === null || item.assignedTo === agent);
  }

  function board(owner: ClosingCampaign, query: URLSearchParams) {
    const shown = filtered(owner.id, query);
    const steps = owner.steps.map((step, index) => {
      const previous = index === 0 ? null : CLOSING_STEPS[index - 1];
      const late =
        step.due < TODAY
          ? shown.filter(
              (item) =>
                item.done[step.code] === undefined &&
                (previous === null || item.done[previous] !== undefined),
            ).length
          : 0;

      return {
        code: step.code,
        done: shown.filter((item) => item.done[step.code] !== undefined).length,
        late,
      };
    });
    const regulatory = items.filter(
      (item) => item.campaignId === owner.id && item.portfolio === 'cga',
    );
    const count = (deliverable: StoredItem['deliverable'], step: ClosingStep) =>
      regulatory.filter((item) => item.deliverable === deliverable && item.done[step] !== undefined)
        .length;

    return {
      board: { items: shown.length, steps },
      report: {
        smt_established: count('smt', 'finalisation'),
        smt_transmitted: count('smt', 'filing'),
        financial_statements_established: count('financial_statements', 'finalisation'),
        financial_statements_transmitted: count('financial_statements', 'filing'),
      },
    };
  }

  /** Motif d'un refus (décision 0006), `null` si l'étape peut être marquée. */
  function refusal(item: StoredItem, step: ClosingStep): string | null {
    if (item.done[step] !== undefined) {
      return 'closing_step_already_done';
    }
    const index = CLOSING_STEPS.indexOf(step);

    return index > 0 && item.done[CLOSING_STEPS[index - 1]] === undefined
      ? 'closing_step_out_of_order'
      : null;
  }

  const MESSAGES: Record<string, string> = {
    closing_step_already_done: 'Cette étape est déjà faite.',
    closing_step_out_of_order: 'L’étape précédente doit d’abord être faite.',
  };

  function dateError(input: Input): Record<string, string> {
    const doneOn = text(input, 'done_on');

    return doneOn === '' || doneOn > TODAY
      ? { done_on: 'La date doit être aujourd’hui ou avant.' }
      : {};
  }

  function campaignRoute(
    method: string,
    rest: string[],
    query: URLSearchParams,
    input: Input,
    context: Context,
  ): ApiReply | undefined {
    const owner = campaignOf(rest[0]);

    if (owner === undefined) {
      return notFound;
    }

    const manages = context.allows('closing.manage');

    if (method === 'GET' && rest.length === 1) {
      return { status: 200, data: { data: owner, meta: board(owner, query) } };
    }

    if (method === 'GET' && rest[1] === 'items' && rest.length === 2) {
      const step = query.get('filter[step]');
      const shown = filtered(owner.id, query, 'filter[')
        .filter(
          (item) =>
            step === null || (step === 'done' ? nextStep(item) === null : nextStep(item) === step),
        )
        .filter((item) => query.get('filter[late]') !== '1' || lateStep(item, owner) !== null);

      return paginated(
        shown.map((item) => resource(item, manages)),
        query,
      );
    }

    if (!manages) {
      return forbidden;
    }
    if (owner.status === 'closed') {
      return conflict('closing_campaign_closed', 'La campagne de cet exercice est close.');
    }

    if (method === 'POST' && rest[1] === 'bulk' && rest[2] === 'steps') {
      const step = rest[3] as ClosingStep;
      const ids = Array.isArray(input.item_ids) ? (input.item_ids as string[]) : [];
      const errors = {
        ...dateError(input),
        ...(ids.length === 0 ? { item_ids: 'Choisissez au moins un dossier.' } : {}),
      };

      if (Object.keys(errors).length > 0) {
        return invalid(errors);
      }

      const done: ClosingItem[] = [];
      const skipped: { id: string; code: string; message: string }[] = [];

      for (const item of items.filter((candidate) => ids.includes(candidate.id))) {
        const code = step === 'filing' ? 'closing_filing_requires_receipt' : refusal(item, step);

        if (code !== null) {
          skipped.push({
            id: item.id,
            code,
            message: `${item.company} : ${MESSAGES[code] ?? 'Le dépôt se marque dossier par dossier.'}`,
          });
        } else {
          item.done[step] = text(input, 'done_on');
          done.push(resource(item, true));
        }
      }

      return { status: 200, data: { data: done, meta: { skipped } } };
    }

    if (method === 'POST' && rest[1] === 'bulk' && rest[2] === 'assign') {
      const ids = Array.isArray(input.item_ids) ? (input.item_ids as string[]) : [];
      const agent = (input.assigned_to as string | null | undefined) ?? null;
      const changed = items.filter((candidate) => ids.includes(candidate.id));

      for (const item of changed) {
        item.assignedTo = agent;
      }

      return ok(changed.map((item) => resource(item, true)));
    }

    const item = items.find(
      (candidate) => candidate.id === rest[2] && candidate.campaignId === owner.id,
    );

    if (rest[1] !== 'items' || item === undefined) {
      return notFound;
    }

    if (method === 'PUT' && rest.length === 3) {
      const deliverable = text(input, 'deliverable');

      if (deliverable !== 'smt' && deliverable !== 'financial_statements') {
        return invalid({ deliverable: 'Le livrable est invalide.' });
      }
      item.deliverable = deliverable;
      item.assignedTo = (input.assigned_to as string | null | undefined) ?? null;

      return ok(resource(item, true));
    }

    if (method === 'POST' && rest[3] === 'steps') {
      const step = rest[4] as ClosingStep;
      const errors: Record<string, string> = dateError(input);

      if (step === 'filing') {
        if (text(input, 'reference') === '') {
          errors.reference = 'La référence du dépôt est obligatoire.';
        }
        if (!(input.receipt instanceof File)) {
          errors.receipt = 'L’accusé de dépôt est obligatoire.';
        }
      }
      if (Object.keys(errors).length > 0) {
        return invalid(errors);
      }
      const code = refusal(item, step);

      if (code !== null) {
        return conflict(code, MESSAGES[code]);
      }
      item.done[step] = text(input, 'done_on');
      if (step === 'filing') {
        item.filingReference = text(input, 'reference');
      }

      return ok(resource(item, true));
    }

    return undefined;
  }

  return {
    items: () => items,
    route(
      method: string,
      path: string,
      query: URLSearchParams,
      body: unknown,
      context: Context,
    ): ApiReply | undefined {
      const input = formInput(body);
      const memberClosing = /^\/cga\/members\/([^/]+)\/closing$/.exec(path);

      if (memberClosing !== null && method === 'GET') {
        if (!context.allows('closing.view')) {
          return forbidden;
        }
        const manages = context.allows('closing.manage');

        return ok(
          items
            .filter((item) => item.memberId === memberClosing[1])
            .map((item) => resource(item, manages)),
        );
      }

      if (path === '/member/closing' && method === 'GET') {
        if (!context.allows('member.closing.view')) {
          return forbidden;
        }

        return ok(
          items
            .filter((item) => item.memberId === context.memberId)
            .map((item) => resource(item, false, true)),
        );
      }

      if (!path.startsWith('/cga/closing-campaigns')) {
        return undefined;
      }
      if (!context.allows('closing.view')) {
        return forbidden;
      }

      const rest = path
        .replace(/^\/cga\/closing-campaigns\/?/, '')
        .split('/')
        .filter(Boolean);

      if (rest.length === 0 && method === 'GET') {
        return ok(campaigns);
      }
      if (rest[0] === 'agents' && method === 'GET') {
        return ok(demoClosingAgents);
      }

      return campaignRoute(method, rest, query, input, context);
    },
  };
}
