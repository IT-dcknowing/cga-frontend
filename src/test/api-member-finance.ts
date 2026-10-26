import type { MemberSpaceDocument } from '@/features/member-space/api/member-finance-api';
import type { Charge, Payment } from '@/features/members/api/dossier-api';
import { formInput } from './api-member-records';
import { forbidden, invalid, ok, text, type ApiReply } from './api-replies';

/*
 * Espace adhérent simulé, d'après `MemberSpaceDocumentController` (documents visibles, valides ou
 * annulés, PDF seulement) et `MemberSpacePaymentController` (échéances, paiements, déclaration
 * avec preuve obligatoire, « À confirmer »). Le dossier est celui de l'accès actif.
 */
type Context = { allows: (permission: string) => boolean; memberId: string | null };

const NOW = '2026-10-26T09:00:00Z';

function pdf(name: string) {
  return { id: `01fil-${name}`, name, url: `https://files.test/${name}` };
}

function document(overrides: Partial<MemberSpaceDocument>): MemberSpaceDocument {
  return {
    id: '01doc000000000000000000001',
    type: 'membership_contract',
    type_label: 'Contrat d’adhésion',
    title: 'Contrat d’adhésion',
    category_label: null,
    number: 'CTR-DCK-2026-00001',
    version: 1,
    status: 'valid',
    status_label: 'Valide',
    issued_at: '2026-01-12T09:00:00Z',
    valid_until: null,
    cancelled_at: null,
    pdf: pdf('contrat.pdf'),
    ...overrides,
  };
}

function charges(): Charge[] {
  const base = {
    tax_rate: '18.00',
    invoice_id: null,
    overdue_since: null,
  };

  return [
    {
      ...base,
      id: '01chg000000000000000000002',
      kind: 'fees',
      kind_label: 'Honoraires',
      period_start: '2026-10-01',
      period_end: '2026-10-31',
      due_date: '2026-10-05',
      amount_excl_tax: 15000,
      tax_amount: 2700,
      amount: 17700,
      amount_paid: 0,
      balance: 17700,
      status: 'due',
      status_label: 'À payer',
    },
    {
      ...base,
      id: '01chg000000000000000000001',
      kind: 'entry_fee',
      kind_label: 'Droit d’adhésion',
      period_start: null,
      period_end: null,
      due_date: '2026-01-10',
      amount_excl_tax: 25000,
      tax_amount: 4500,
      amount: 29500,
      amount_paid: 29500,
      balance: 0,
      status: 'paid',
      status_label: 'Payée',
    },
  ];
}

function payment(overrides: Partial<Payment>): Payment {
  return {
    id: '01pay000000000000000000001',
    amount: 29500,
    paid_on: '2026-01-10',
    method: 'mobile_money',
    method_label: 'Mobile money',
    reference: 'OM-001',
    source: 'cga_entry',
    source_label: 'Saisi par le CGA',
    status: 'confirmed',
    status_label: 'Confirmé',
    rejection_reason: null,
    receipt_number: 'REC-DCK-2026-00001',
    confirmed_at: '2026-01-10T09:00:00Z',
    proof: null,
    allocations: [],
    created_at: '2026-01-10T09:00:00Z',
    can: { confirm: false, reject: false },
    ...overrides,
  };
}

export function createMemberFinanceBackend() {
  const documents: MemberSpaceDocument[] = [
    document({}),
    document({
      id: '01doc000000000000000000002',
      type: 'membership_certificate',
      type_label: 'Attestation d’adhésion',
      title: 'Attestation d’adhésion 2025',
      number: 'ATT-DCK-2025-00001',
      status: 'cancelled',
      status_label: 'Annulé',
      cancelled_at: '2026-02-01T09:00:00Z',
      pdf: pdf('attestation-2025.pdf'),
    }),
  ];
  let payments: Payment[] = [payment({})];
  let nextId = 0;

  function declare(body: unknown): ApiReply {
    const input = formInput(body);
    const errors: Record<string, string> = {};
    const amount = Number(input.amount);

    if (!Number.isInteger(amount) || amount < 1) {
      errors.amount = 'Le montant doit être un entier positif.';
    }

    if (text(input, 'paid_on') === '') {
      errors.paid_on = 'La date du paiement est obligatoire.';
    }

    if (!(input.proof instanceof File)) {
      errors.proof = 'La preuve du paiement est obligatoire.';
    }

    if (Object.keys(errors).length > 0) {
      return invalid(errors);
    }

    const created = payment({
      id: `01pay9${String(++nextId).padStart(20, '0')}`,
      amount,
      paid_on: text(input, 'paid_on'),
      method: text(input, 'method'),
      method_label: 'Mobile money',
      reference: text(input, 'reference') === '' ? null : text(input, 'reference'),
      source: 'member_declaration',
      source_label: 'Déclaré par l’adhérent',
      status: 'pending_confirmation',
      status_label: 'À confirmer',
      receipt_number: null,
      confirmed_at: null,
      created_at: NOW,
    });

    payments = [created, ...payments];

    return ok(created, 201);
  }

  /** Routes `/member/documents`, `/member/charges`, `/member/payments` ; `undefined` sinon. */
  function route(
    method: string,
    path: string,
    body: unknown,
    context: Context,
  ): ApiReply | undefined {
    if (!['/member/documents', '/member/charges', '/member/payments'].includes(path)) {
      return undefined;
    }

    if (context.memberId === null) {
      return forbidden;
    }

    if (path === '/member/documents') {
      return context.allows('member.documents.view') ? ok(documents) : forbidden;
    }

    if (!context.allows('member.payments.declare')) {
      return forbidden;
    }

    if (path === '/member/charges') {
      return ok(charges());
    }

    return method === 'POST' ? declare(body) : ok(payments);
  }

  return { route };
}
