import type { DuesPayment, NetworkDue } from '@/features/dues/api/dues-api';
import { formInput } from './api-member-records';
import { conflict, forbidden, invalid, notFound, ok, text, type ApiReply } from './api-replies';

/*
 * Cotisations simulées, d'après `NetworkDuesController` et `CgaDuesController` (`NetworkDueResource`) :
 * suivi réseau par année (totaux, comptes par statut), paiement déclaré par le centre (preuve
 * obligatoire), confirmation avec reçu `CNC-AAAA-NNNNN` ou rejet motivé, paiement saisi, relance,
 * facture de cotisation (une seule, visible du centre une fois certifiée). Droits : `dues.view`,
 * `dues.payments.manage`, `dues.remind`, `invoices.issue`, `dues.own.view`, `dues.own.declare`.
 */
type Context = { allows: (permission: string) => boolean; organizationId: string | null };

const YEAR = new Date().getFullYear();
const NOW = `${String(YEAR)}-03-10T09:00:00Z`;

export const demoDuesIds = {
  dck: '01due000000000000000000001',
  bouake: '01due000000000000000000002',
  declared: '01dpy000000000000000000001',
};

function due(overrides: Partial<NetworkDue>): NetworkDue {
  return {
    id: demoDuesIds.dck,
    cga: { id: '01cga000000000000000000001', name: 'DC-KNOWING CGA', sigle: 'DCK' },
    year: YEAR,
    base_amount: 750_000,
    prorata_ratio: 1,
    amount_due: 750_000,
    amount_paid: 0,
    balance: 750_000,
    deadline: `${String(YEAR)}-06-30`,
    status: 'due',
    status_label: 'À régler',
    pending_confirmation: false,
    last_reminder_at: null,
    reminder_count: 0,
    invoice: null,
    payments: [],
    ...overrides,
  };
}

function payment(overrides: Partial<DuesPayment>): DuesPayment {
  return {
    id: demoDuesIds.declared,
    amount: 300_000,
    paid_on: `${String(YEAR)}-03-09`,
    method: 'transfer',
    method_label: 'Virement',
    reference: 'VIR-0042',
    source: 'cga_declaration',
    status: 'pending_confirmation',
    status_label: 'À confirmer',
    rejection_reason: null,
    receipt_number: null,
    proof_url: 'https://files.test/virement.pdf',
    receipt_url: null,
    ...overrides,
  };
}

const STATUS_LABELS: Record<NetworkDue['status'], string> = {
  due: 'À régler',
  partial: 'Partielle',
  paid: 'À jour',
  unpaid: 'Impayée',
};

export function createDuesBackend() {
  let dues: NetworkDue[] = [
    due({ payments: [payment({})], pending_confirmation: true }),
    due({
      id: demoDuesIds.bouake,
      cga: { id: '01cga000000000000000000002', name: 'CGA Démo Bouaké', sigle: 'DEMOB' },
      amount_due: 375_000,
      prorata_ratio: 0.5,
      balance: 375_000,
    }),
  ];
  let receipts = 0;
  let paymentSequence = 1;

  function recompute(item: NetworkDue): NetworkDue {
    const payments = item.payments ?? [];
    const paid = payments
      .filter((entry) => entry.status === 'confirmed')
      .reduce((sum, entry) => sum + entry.amount, 0);
    const status: NetworkDue['status'] =
      paid >= item.amount_due ? 'paid' : paid > 0 ? 'partial' : 'due';

    return {
      ...item,
      amount_paid: paid,
      balance: item.amount_due - paid,
      status,
      status_label: STATUS_LABELS[status],
      pending_confirmation: payments.some((entry) => entry.status === 'pending_confirmation'),
    };
  }

  function save(updated: NetworkDue): NetworkDue {
    const computed = recompute(updated);

    dues = dues.map((item) => (item.id === computed.id ? computed : item));

    return computed;
  }

  /** Vue de la liste : sans paiements (comme l'index du serveur). */
  function listed(item: NetworkDue): NetworkDue {
    const rest = { ...item };

    delete rest.payments;

    return rest;
  }

  function confirmPayment(item: NetworkDue, paymentId: string): NetworkDue {
    receipts += 1;
    const number = `CNC-${String(YEAR)}-${String(receipts).padStart(5, '0')}`;

    return save({
      ...item,
      payments: (item.payments ?? []).map((entry) =>
        entry.id === paymentId
          ? {
              ...entry,
              status: 'confirmed',
              status_label: 'Confirmé',
              receipt_number: number,
              receipt_url: `https://files.test/${number}.pdf`,
            }
          : entry,
      ),
    });
  }

  /** Paiement saisi ou déclaré : le paiement créé, ou la réponse d'erreur du serveur. */
  type Added = { payment: DuesPayment } | { error: ApiReply };

  function addPayment(item: NetworkDue, input: Record<string, unknown>, source: string): Added {
    const amount = Number(input.amount);

    if (!Number.isInteger(amount) || amount <= 0) {
      return { error: invalid({ amount: 'Le montant doit être un entier positif.' }) };
    }
    if (item.balance === 0) {
      return { error: conflict('dues_already_paid', 'Cette cotisation est déjà réglée.') };
    }
    if (amount > item.balance) {
      return { error: conflict('dues_payment_exceeds_balance', 'Le montant dépasse le reste dû.') };
    }

    paymentSequence += 1;
    const method = text(input, 'method');

    return {
      payment: payment({
        id: `01dpy9${String(paymentSequence).padStart(20, '0')}`,
        amount,
        paid_on: text(input, 'paid_on'),
        method,
        method_label: method,
        reference: text(input, 'reference') === '' ? null : text(input, 'reference'),
        source,
        proof_url: source === 'cga_declaration' ? 'https://files.test/preuve.pdf' : null,
      }),
    };
  }

  function networkRoute(
    method: string,
    path: string,
    query: URLSearchParams,
    body: unknown,
    context: Context,
  ): ApiReply {
    if (!context.allows('dues.view')) {
      return forbidden;
    }

    if (method === 'GET' && path === '/network/dues') {
      const year = query.get('year');
      const cga = query.get('cga');
      const status = query.get('status');
      const rows = dues.filter(
        (item) =>
          (year === null || String(item.year) === year) &&
          (cga === null || item.cga?.id === cga) &&
          (status === null || item.status === status),
      );

      return {
        status: 200,
        data: {
          data: rows.map(listed),
          meta: {
            totals: {
              amount_due: rows.reduce((sum, item) => sum + item.amount_due, 0),
              amount_paid: rows.reduce((sum, item) => sum + item.amount_paid, 0),
              balance: rows.reduce((sum, item) => sum + item.balance, 0),
            },
            counts: {},
          },
        },
      };
    }

    const reviewed = /^\/network\/dues\/payments\/([^/]+)\/(confirm|reject)$/.exec(path);

    if (reviewed !== null) {
      if (!context.allows('dues.payments.manage')) {
        return forbidden;
      }
      const owner = dues.find((item) => item.payments?.some((entry) => entry.id === reviewed[1]));
      const target = owner?.payments?.find((entry) => entry.id === reviewed[1]);

      if (owner === undefined || target === undefined) {
        return notFound;
      }
      if (target.status !== 'pending_confirmation') {
        return conflict('dues_payment_not_pending', 'Ce paiement n’attend plus de confirmation.');
      }
      if (reviewed[2] === 'confirm') {
        return ok(confirmPayment(owner, target.id));
      }
      const reason = ((body ?? {}) as { reason?: string }).reason ?? '';

      if (reason.trim().length < 3) {
        return invalid({ reason: 'Le motif est obligatoire.' });
      }

      return ok(
        save({
          ...owner,
          payments: (owner.payments ?? []).map((entry) =>
            entry.id === target.id
              ? { ...entry, status: 'rejected', status_label: 'Rejeté', rejection_reason: reason }
              : entry,
          ),
        }),
      );
    }

    const match = /^\/network\/dues\/([^/]+)(?:\/(payments|remind|invoice))?$/.exec(path);
    const target = match === null ? undefined : dues.find((item) => item.id === match[1]);

    if (match === null || target === undefined) {
      return notFound;
    }

    switch (match[2]) {
      case undefined:
        return ok(target);
      case 'payments': {
        if (!context.allows('dues.payments.manage')) {
          return forbidden;
        }
        const created = addPayment(target, (body ?? {}) as Record<string, unknown>, 'cncga_entry');

        if ('error' in created) {
          return created.error;
        }
        const withPayment = save({
          ...target,
          payments: [created.payment, ...(target.payments ?? [])],
        });

        return ok(confirmPayment(withPayment, created.payment.id), 201);
      }
      case 'remind':
        if (!context.allows('dues.remind')) {
          return forbidden;
        }

        return ok(
          save({ ...target, last_reminder_at: NOW, reminder_count: target.reminder_count + 1 }),
        );
      default: {
        if (!context.allows('invoices.issue')) {
          return forbidden;
        }
        if (target.invoice !== null) {
          return conflict('dues_already_invoiced', 'Cette cotisation est déjà facturée.');
        }

        return ok(
          save({
            ...target,
            invoice: {
              id: '01inv0000000000000000000d1',
              number: `FAC-CNCGA-${String(YEAR)}-00001`,
              status: 'pending_certification',
              status_label: 'En attente de certification',
              pdf_url: null,
            },
          }),
        );
      }
    }
  }

  function ownRoute(method: string, path: string, body: unknown, context: Context): ApiReply {
    if (!context.allows('dues.own.view')) {
      return forbidden;
    }
    const mine = dues.filter((item) => item.cga?.id === context.organizationId);

    if (method === 'GET' && path === '/cga/dues') {
      return {
        status: 200,
        data: {
          // Le centre ne voit sa facture qu'une fois certifiée (RG-FNE-01).
          data: mine.map((item) => ({
            ...item,
            invoice: item.invoice?.status === 'certified' ? item.invoice : null,
          })),
          meta: { can: { declare: context.allows('dues.own.declare') } },
        },
      };
    }

    const match = /^\/cga\/dues\/([^/]+)\/payments$/.exec(path);
    const target = match === null ? undefined : mine.find((item) => item.id === match[1]);

    if (method !== 'POST' || target === undefined) {
      return notFound;
    }
    if (!context.allows('dues.own.declare')) {
      return forbidden;
    }
    const input = formInput(body);

    if (!(input.proof instanceof File)) {
      return invalid({ proof: 'La preuve du paiement est obligatoire.' });
    }
    const created = addPayment(target, input, 'cga_declaration');

    if ('error' in created) {
      return created.error;
    }

    return ok(save({ ...target, payments: [created.payment, ...(target.payments ?? [])] }), 201);
  }

  function route(
    method: string,
    path: string,
    query: URLSearchParams,
    body: unknown,
    context: Context,
  ): ApiReply | undefined {
    if (path.startsWith('/network/dues')) {
      return networkRoute(method, path, query, body, context);
    }
    if (path.startsWith('/cga/dues')) {
      return ownRoute(method, path, body, context);
    }

    return undefined;
  }

  return {
    route,
    dues: () => dues,
    /** Certifie la facture d'une cotisation, comme la saisie de la certification par le CNCGA. */
    certify(id: string) {
      dues = dues.map((item) =>
        item.id === id && item.invoice !== null
          ? {
              ...item,
              invoice: {
                ...item.invoice,
                status: 'certified',
                status_label: 'Certifiée',
                pdf_url: 'https://files.test/facture-cotisation.pdf',
              },
            }
          : item,
      );
    },
  };
}
