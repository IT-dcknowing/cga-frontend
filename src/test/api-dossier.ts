import type { Charge, MemberDocument, Payment } from '@/features/members/api/dossier-api';
import type { Member } from '@/features/members/api/members-api';
import {
  conflict,
  forbidden,
  invalid,
  notFound,
  ok,
  type ApiReply,
  type Input,
} from './api-replies';
import { demoMemberIds } from './demo-members';

/*
 * Honoraires, paiements, documents et blocage d'attestation d'un dossier simulés, d'après
 * `MemberPaymentController` (`RecordPayment` : confirmé d'office, reçu numéroté), `MemberDocumentController`
 * et `DocumentController` (production en file : « en production », puis « valide » à la lecture
 * suivante), `AttestationBlockController` (blocage manuel, RG-DOC-10). Montants TTC : TVA 18 %.
 */
type Context = { allows: (permission: string) => boolean };

const NOW = '2026-10-26T09:00:00Z';

function charge(overrides: Partial<Charge>): Charge {
  return {
    id: '01chg000000000000000000001',
    kind: 'fees',
    kind_label: 'Honoraires',
    period_start: '2026-10-01',
    period_end: '2026-10-31',
    due_date: '2026-10-05',
    amount_excl_tax: 15000,
    tax_rate: '18.00',
    tax_amount: 2700,
    amount: 17700,
    invoice_id: null,
    amount_paid: 0,
    balance: 17700,
    status: 'due',
    status_label: 'À payer',
    overdue_since: null,
    ...overrides,
  };
}

function entryFee(id: string, paid: boolean): Charge {
  return charge({
    id,
    kind: 'entry_fee',
    kind_label: 'Droit d’adhésion',
    period_start: null,
    period_end: null,
    due_date: '2026-01-10',
    amount_excl_tax: 25000,
    tax_amount: 4500,
    amount: 29500,
    amount_paid: paid ? 29500 : 0,
    balance: paid ? 0 : 29500,
    status: paid ? 'paid' : 'due',
    status_label: paid ? 'Payée' : 'À payer',
  });
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

function file(name: string) {
  return { id: `01fil-${name}`, name, size_bytes: 1024, url: `https://files.test/${name}` };
}

function document(overrides: Partial<MemberDocument>): MemberDocument {
  return {
    id: '01doc000000000000000000001',
    type: 'membership_contract',
    type_label: 'Contrat d’adhésion',
    title: 'Contrat d’adhésion',
    category: null,
    category_label: null,
    number: 'CTR-DCK-2026-00001',
    version: 1,
    replaces_document_id: null,
    status: 'valid',
    status_label: 'Valide',
    issued_at: '2026-01-12T09:00:00Z',
    valid_until: null,
    fiscal_year: null,
    cancelled_at: null,
    cancel_reason: null,
    visible_to_member: true,
    sha256: null,
    verification_url: 'https://cga-connect.test/verifier/abc',
    files: { pdf: file('contrat.pdf'), docx: file('contrat.docx') },
    created_at: '2026-01-12T09:00:00Z',
    can: { retry: false, regenerate: true, cancel: true },
    ...overrides,
  };
}

const LABELS: Record<string, string> = {
  membership_contract: 'Contrat d’adhésion',
  membership_certificate: 'Attestation d’adhésion',
};

export function createDossierBackend(
  find: (id: string) => Member | undefined,
  save: (member: Member) => Member,
  entryFeePaid: (memberId: string) => void,
) {
  const charges = new Map<string, Charge[]>([
    [
      demoMemberIds.adjoua,
      [charge({ id: '01chg000000000000000000002' }), entryFee('01chg000000000000000000001', true)],
    ],
    [demoMemberIds.kouadio, [entryFee('01chg000000000000000000003', false)]],
  ]);
  const payments = new Map<string, Payment[]>([
    [
      demoMemberIds.adjoua,
      [
        payment({
          id: '01pay000000000000000000002',
          amount: 17700,
          paid_on: '2026-10-20',
          reference: 'OM-OCT',
          source: 'member_declaration',
          source_label: 'Déclaré par l’adhérent',
          status: 'pending_confirmation',
          status_label: 'À confirmer',
          receipt_number: null,
          confirmed_at: null,
          proof: { id: '01fil-preuve', name: 'preuve.jpg', url: 'https://files.test/preuve.jpg' },
          can: { confirm: true, reject: true },
        }),
        payment({}),
      ],
    ],
  ]);
  const documents = new Map<string, MemberDocument[]>([
    [
      demoMemberIds.adjoua,
      [
        document({}),
        document({
          id: '01doc000000000000000000002',
          type: 'membership_certificate',
          type_label: 'Attestation d’adhésion',
          title: 'Attestation d’adhésion 2026',
          number: 'ATT-DCK-2026-00001',
          files: { pdf: file('attestation.pdf'), docx: null },
        }),
      ],
    ],
  ]);
  /** Échéances d'un dossier ; un brouillon CGA a son droit d'adhésion dû dès la création (3.2). */
  function chargesOf(member: Member): Charge[] {
    if (!charges.has(member.id)) {
      charges.set(
        member.id,
        member.status === 'draft' && member.portfolio === 'cga' && member.entry_fee_amount > 0
          ? [entryFee(`01chg9${member.id.slice(-20)}`, false)]
          : [],
      );
    }

    return charges.get(member.id) ?? [];
  }

  let receipts = 1;
  let nextId = 100;

  /** Paiement saisi par le CGA (`RecordPayment`) : ventilé sur les échéances cochées, reçu numéroté. */
  function record(member: Member, input: Input, context: Context): ApiReply {
    if (!context.allows('member_payments.manage')) {
      return forbidden;
    }

    const amount = Number(input.amount);

    if (!Number.isInteger(amount) || amount < 1) {
      return invalid({ amount: 'Le montant doit être un entier positif.' });
    }

    // `charge_ids[0]`, `charge_ids[1]`… du corps multipart, rangés par `formInput`.
    const chosen = Object.values((input.charge_ids ?? {}) as Record<string, unknown>).map(String);
    let left = amount;
    const updated = chargesOf(member).map((item) => {
      if (!chosen.includes(item.id) || left === 0 || item.balance === 0) {
        return item;
      }

      const paid = Math.min(left, item.balance);

      left -= paid;

      const balance = item.balance - paid;

      if (item.kind === 'entry_fee' && balance === 0) {
        entryFeePaid(member.id);
      }

      return {
        ...item,
        amount_paid: item.amount_paid + paid,
        balance,
        status: balance === 0 ? 'paid' : 'partial',
        status_label: balance === 0 ? 'Payée' : 'Payée en partie',
      };
    });

    charges.set(member.id, updated);

    const created = payment({
      id: `01pay9${String(++nextId).padStart(20, '0')}`,
      amount,
      paid_on: String(input.paid_on),
      method: String(input.method),
      method_label: String(input.method),
      reference:
        typeof input.reference === 'string' && input.reference !== '' ? input.reference : null,
      receipt_number: `REC-DCK-2026-${String(++receipts).padStart(5, '0')}`,
      confirmed_at: NOW,
      created_at: NOW,
    });

    payments.set(member.id, [created, ...(payments.get(member.id) ?? [])]);

    return { status: 201, data: { data: created } };
  }

  function review(
    member: Member,
    paymentId: string,
    action: string,
    input: Input,
    context: Context,
  ): ApiReply {
    if (!context.allows('member_payments.manage')) {
      return forbidden;
    }

    const list = payments.get(member.id) ?? [];
    const target = list.find((item) => item.id === paymentId);

    if (target === undefined) {
      return notFound;
    }

    if (target.status !== 'pending_confirmation') {
      return conflict('payment_not_pending', 'Ce paiement a déjà été examiné.');
    }

    if (action === 'reject' && (typeof input.reason !== 'string' || input.reason.trim() === '')) {
      return invalid({ reason: 'Le champ motif est obligatoire.' });
    }

    const reviewed: Payment =
      action === 'confirm'
        ? {
            ...target,
            status: 'confirmed',
            status_label: 'Confirmé',
            receipt_number: `REC-DCK-2026-${String(++receipts).padStart(5, '0')}`,
            confirmed_at: NOW,
            can: { confirm: false, reject: false },
          }
        : {
            ...target,
            status: 'rejected',
            status_label: 'Rejeté',
            rejection_reason: String(input.reason),
            can: { confirm: false, reject: false },
          };

    payments.set(
      member.id,
      list.map((item) => (item.id === paymentId ? reviewed : item)),
    );

    return ok(reviewed);
  }

  /** Lecture : une production en cours est prête à la lecture suivante (`GenerateDocument`). */
  function listDocuments(member: Member): ApiReply {
    const list = documents.get(member.id) ?? [];

    documents.set(
      member.id,
      list.map((item) =>
        item.status === 'generating'
          ? {
              ...item,
              status: 'valid',
              status_label: 'Valide',
              files: { pdf: file(`${item.type}.pdf`), docx: file(`${item.type}.docx`) },
              can: { retry: false, regenerate: true, cancel: true },
            }
          : item,
      ),
    );

    return ok(list);
  }

  function produce(member: Member, input: Input, context: Context): ApiReply {
    if (!context.allows('documents.produce')) {
      return forbidden;
    }

    const type = String(input.type);

    if (!(type in LABELS)) {
      return invalid({ type: 'Le type de document est invalide.' });
    }

    if (type === 'membership_certificate' && member.attestation_blocked) {
      return conflict('attestation_blocked', 'L’attestation de ce dossier est bloquée.');
    }

    const created = document({
      id: `01doc9${String(++nextId).padStart(20, '0')}`,
      type,
      type_label: LABELS[type],
      title: LABELS[type],
      number: null,
      status: 'generating',
      status_label: 'En production',
      issued_at: null,
      files: { pdf: null, docx: null },
      can: { retry: false, regenerate: false, cancel: false },
    });

    documents.set(member.id, [created, ...(documents.get(member.id) ?? [])]);

    return { status: 202, data: { data: created } };
  }

  function upload(member: Member, input: Input, context: Context): ApiReply {
    if (!context.allows('documents.produce')) {
      return forbidden;
    }

    if (typeof input.title !== 'string' || input.title.trim() === '') {
      return invalid({ title: 'Le champ titre est obligatoire.' });
    }

    if (!(input.file instanceof File)) {
      return invalid({ file: 'Le champ fichier est obligatoire.' });
    }

    const created = document({
      id: `01doc9${String(++nextId).padStart(20, '0')}`,
      type: 'uploaded',
      type_label: 'Document déposé',
      title: input.title,
      category: String(input.category),
      number: null,
      files: { pdf: file(input.file.name), docx: null },
      can: { retry: false, regenerate: false, cancel: true },
    });

    documents.set(member.id, [created, ...(documents.get(member.id) ?? [])]);

    return { status: 201, data: { data: created } };
  }

  function documentRoute(
    method: string,
    path: string,
    input: Input,
    context: Context,
  ): ApiReply | undefined {
    const match = /^\/cga\/documents\/([^/]+)(?:\/(retry|regenerate|cancel))?$/.exec(path);

    if (match === null) {
      return undefined;
    }

    const [, id, action] = match;
    const owner = [...documents.entries()].find(([, list]) => list.some((item) => item.id === id));

    if (owner === undefined) {
      return notFound;
    }

    const [memberId, list] = owner;
    const target = list.find((item) => item.id === id) as MemberDocument;

    if (method === 'GET' && action === undefined) {
      return ok(target);
    }

    if (action === 'cancel') {
      if (!context.allows('documents.cancel')) {
        return forbidden;
      }

      if (typeof input.reason !== 'string' || input.reason.trim() === '') {
        return invalid({ reason: 'Le champ motif est obligatoire.' });
      }

      const cancelled = {
        ...target,
        status: 'cancelled',
        status_label: 'Annulé',
        cancelled_at: NOW,
        cancel_reason: input.reason,
        can: { retry: false, regenerate: false, cancel: false },
      };

      documents.set(
        memberId,
        list.map((item) => (item.id === id ? cancelled : item)),
      );

      return ok(cancelled);
    }

    // Réédition ou relance : une nouvelle production, en file.
    const version = document({
      ...target,
      id: `01doc9${String(++nextId).padStart(20, '0')}`,
      version: target.version + 1,
      status: 'generating',
      status_label: 'En production',
      files: { pdf: null, docx: null },
      can: { retry: false, regenerate: false, cancel: false },
    });

    documents.set(memberId, [version, ...list]);

    return { status: 202, data: { data: version } };
  }

  function block(member: Member, action: string, input: Input, context: Context): ApiReply {
    if (!context.allows('attestations.block')) {
      return forbidden;
    }

    if (typeof input.reason !== 'string' || input.reason.trim() === '') {
      return invalid({ reason: 'Le champ motif est obligatoire.' });
    }

    if (action === 'release') {
      save({
        ...member,
        attestation_blocked: false,
        attestation_block: null,
        can: { ...member.can, block_attestation: true, release_attestation: false },
      });

      return ok({ released_at: NOW });
    }

    if (member.attestation_blocked) {
      return conflict(
        'attestation_already_blocked',
        'L’attestation de ce dossier est déjà bloquée.',
      );
    }

    const trigger = String(input.trigger);

    save({
      ...member,
      attestation_blocked: true,
      attestation_block: {
        trigger,
        trigger_label: trigger === 'fees_overdue' ? 'Honoraires impayés' : 'Décision du gérant',
        reason: input.reason,
        blocked_at: NOW,
      },
      can: { ...member.can, block_attestation: false, release_attestation: true },
    });

    return { status: 201, data: { data: { trigger, reason: input.reason } } };
  }

  /** Routes `/cga/members/{id}/…` du dossier financier et documentaire ; `undefined` sinon. */
  function route(
    member: Member,
    method: string,
    action: string,
    input: Input,
    context: Context,
  ): ApiReply | undefined {
    if (method === 'GET' && action === 'charges') {
      return ok(chargesOf(member));
    }

    if (method === 'GET' && action === 'payments') {
      return ok(payments.get(member.id) ?? []);
    }

    if (method === 'POST' && action === 'payments') {
      return record(member, input, context);
    }

    const reviewed = /^payments\/([^/]+)\/(confirm|reject)$/.exec(action);

    if (method === 'POST' && reviewed !== null) {
      return review(member, reviewed[1], reviewed[2], input, context);
    }

    if (method === 'GET' && action === 'documents') {
      return listDocuments(member);
    }

    if (method === 'POST' && action === 'documents') {
      return produce(member, input, context);
    }

    if (method === 'POST' && action === 'documents/upload') {
      return upload(member, input, context);
    }

    if (
      method === 'POST' &&
      (action === 'attestation-blocks' || action === 'attestation-blocks/release')
    ) {
      return block(member, action.endsWith('release') ? 'release' : 'block', input, context);
    }

    return undefined;
  }

  return {
    route,
    documentRoute,
    find,
    /** Documents d'un dossier, dans leur état courant. */
    documents: (memberId: string) => documents.get(memberId) ?? [],
  };
}
