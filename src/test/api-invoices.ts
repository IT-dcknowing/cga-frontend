import type { Invoice, InvoicingProvider } from '@/features/invoices/api/invoices-api';
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
} from './api-replies';
import { demoMemberIds } from './demo-members';

/*
 * Factures FNE et fournisseur de certification simulés, d'après `InvoiceController`
 * (`InvoiceResource`, bloc `can` : saisie manuelle, resoumission, annulation d'une facture non
 * certifiée, avoir et remise d'une facture certifiée) et `InvoicingProviderController`
 * (identifiants jamais renvoyés en clair). Droits : `invoices.issue`, `integrations.view`, `.manage`.
 */
type Context = { allows: (permission: string) => boolean };

const NOW = '2026-10-26T09:00:00Z';

const none = {
  certify_manually: false,
  resubmit: false,
  cancel: false,
  issue_credit_note: false,
  deliver: false,
};

function invoice(overrides: Partial<Invoice>): Invoice {
  return {
    id: '01inv000000000000000000001',
    type: 'invoice',
    type_label: 'Facture',
    number: 'FAC-DCK-2026-00001',
    issue_date: '2026-10-05',
    member: {
      id: demoMemberIds.adjoua,
      company_name: 'BOULANGERIE ADJOUA',
      number: '2026-DCK-0001',
    },
    original: null,
    credit_note: null,
    lines: [],
    amount_excl_tax: 15000,
    tax_amount: 2700,
    amount_incl_tax: 17700,
    status: 'certified',
    status_label: 'Certifiée',
    certification_mode: 'manual',
    certification_mode_label: 'Manuel',
    fne_number: 'FNE-2026-000123',
    fne_stamp: null,
    certified_at: '2026-10-06T09:00:00Z',
    rejection_reason: null,
    cancel_reason: null,
    pdf: {
      id: '01fil-fac',
      name: 'facture.pdf',
      size_bytes: 2048,
      url: 'https://files.test/facture.pdf',
    },
    created_at: '2026-10-05T09:00:00Z',
    can: { ...none, issue_credit_note: true, deliver: true },
    ...overrides,
  };
}

const pending = { status: 'pending_certification', status_label: 'En attente de certification' };

export function createInvoicesBackend() {
  let invoices: Invoice[] = [
    invoice({}),
    invoice({
      id: '01inv000000000000000000002',
      number: 'FAC-DCK-2026-00002',
      ...pending,
      fne_number: null,
      certified_at: null,
      pdf: null,
      can: { ...none, certify_manually: true, cancel: true },
    }),
    invoice({
      id: '01inv000000000000000000003',
      number: 'FAC-DCK-2026-00003',
      member: {
        id: demoMemberIds.bamba,
        company_name: 'QUINCAILLERIE BAMBA',
        number: '2026-DCK-0002',
      },
      status: 'rejected',
      status_label: 'Rejetée',
      certification_mode: 'dgi_api',
      certification_mode_label: 'API DGI',
      fne_number: null,
      certified_at: null,
      rejection_reason: 'NCC du client inconnu de la DGI.',
      pdf: null,
      can: { ...none, resubmit: true, cancel: true },
    }),
  ];
  let provider: InvoicingProvider & { credentials: string | null } = {
    mode: 'manual',
    mode_label: 'Manuel',
    modes: [
      { value: 'manual', label: 'Manuel', available: true },
      { value: 'dgi_api', label: 'API DGI', available: true },
      { value: 'sell_flow', label: 'Sell Flow', available: false },
    ],
    base_url: null,
    credentials_hint: null,
    credentials: null,
    fne_number_pattern: null,
    active: true,
    last_test_at: null,
    last_test_ok: null,
    can: { update: true, test: true },
  };
  let sequence = 3;

  function save(updated: Invoice): ApiReply {
    invoices = invoices.map((item) => (item.id === updated.id ? updated : item));

    return ok(updated);
  }

  function issue(body: unknown): ApiReply {
    const input = (body ?? {}) as { member_id?: string; charge_ids?: string[] };

    if (
      typeof input.member_id !== 'string' ||
      !Array.isArray(input.charge_ids) ||
      input.charge_ids.length === 0
    ) {
      return invalid({ charge_ids: 'Choisissez au moins une somme due.' });
    }

    const created = invoice({
      id: `01inv9${String(++sequence).padStart(20, '0')}`,
      number: `FAC-DCK-2026-${String(sequence).padStart(5, '0')}`,
      issue_date: '2026-10-26',
      member: { id: input.member_id, company_name: 'BOULANGERIE ADJOUA', number: '2026-DCK-0001' },
      ...pending,
      fne_number: null,
      certified_at: null,
      pdf: null,
      created_at: NOW,
      can: { ...none, certify_manually: true, cancel: true },
    });

    invoices = [created, ...invoices];

    return ok(created, 201);
  }

  function act(target: Invoice, action: string, body: unknown): ApiReply {
    switch (action) {
      case 'manual-certification': {
        const input = formInput(body);

        if (text(input, 'fne_number') === '' || !(input.file instanceof File)) {
          return invalid({ fne_number: 'Le numéro FNE et le PDF certifié sont obligatoires.' });
        }

        return save({
          ...target,
          status: 'certified',
          status_label: 'Certifiée',
          fne_number: text(input, 'fne_number'),
          certified_at: NOW,
          pdf: {
            id: '01fil-cert',
            name: input.file.name,
            size_bytes: input.file.size,
            url: `https://files.test/${input.file.name}`,
          },
          can: { ...none, issue_credit_note: true, deliver: true },
        });
      }
      case 'resubmit':
        return save({ ...target, ...pending, rejection_reason: null, can: none });
      case 'cancel': {
        const reason = ((body ?? {}) as { reason?: string }).reason;

        if (typeof reason !== 'string' || reason.trim() === '') {
          return invalid({ reason: 'Le motif est obligatoire.' });
        }

        return save({
          ...target,
          status: 'cancelled',
          status_label: 'Annulée',
          cancel_reason: reason,
          can: none,
        });
      }
      case 'credit-note': {
        const note = invoice({
          id: `01inv9${String(++sequence).padStart(20, '0')}`,
          type: 'credit_note',
          type_label: 'Avoir',
          number: `AV-DCK-2026-${String(sequence).padStart(5, '0')}`,
          original: { id: target.id, number: target.number },
          ...pending,
          fne_number: null,
          certified_at: null,
          pdf: null,
          can: none,
        });

        invoices = [
          note,
          ...invoices.map((item) =>
            item.id === target.id
              ? { ...item, can: { ...item.can, issue_credit_note: false } }
              : item,
          ),
        ];

        return ok(note, 201);
      }
      default:
        return { status: 202, data: { data: target } };
    }
  }

  function providerRoute(
    method: string,
    path: string,
    body: unknown,
    context: Context,
  ): ApiReply | undefined {
    if (!context.allows('integrations.view')) {
      return forbidden;
    }

    const shown = () => {
      // Comme `InvoicingProviderResource` : les identifiants ne sortent jamais en clair.
      const rest: Partial<typeof provider> = { ...provider };

      delete rest.credentials;

      return ok({
        ...rest,
        can: {
          update: context.allows('integrations.manage'),
          test: context.allows('integrations.manage'),
        },
      });
    };

    if (method === 'GET' && path === '/cga/invoicing-provider') {
      return shown();
    }

    if (!context.allows('integrations.manage')) {
      return forbidden;
    }

    if (method === 'PUT') {
      const input = (body ?? {}) as Record<string, unknown>;

      if (
        input.mode !== 'manual' &&
        (typeof input.base_url !== 'string' || input.base_url === '')
      ) {
        return invalid({ base_url: 'L’adresse du service est obligatoire.' });
      }

      const credentials =
        typeof input.credentials === 'string' ? input.credentials : provider.credentials;

      provider = {
        ...provider,
        mode: String(input.mode),
        mode_label:
          provider.modes.find((option) => option.value === input.mode)?.label ?? String(input.mode),
        base_url: (input.base_url ?? null) as string | null,
        credentials,
        credentials_hint: credentials === null ? null : `••••${credentials.slice(-4)}`,
        fne_number_pattern: (input.fne_number_pattern ?? null) as string | null,
        active: input.active === true,
      };

      return shown();
    }

    if (method === 'POST' && path === '/cga/invoicing-provider/test') {
      provider = {
        ...provider,
        last_test_at: NOW,
        last_test_ok: provider.mode === 'manual' || provider.credentials !== null,
      };

      return shown();
    }

    return undefined;
  }

  /** Routes `/cga/invoices…` et `/cga/invoicing-provider…` ; `undefined` sinon. */
  function route(
    method: string,
    path: string,
    query: URLSearchParams,
    body: unknown,
    context: Context,
  ): ApiReply | undefined {
    if (path.startsWith('/cga/invoicing-provider')) {
      return providerRoute(method, path, body, context);
    }

    if (!path.startsWith('/cga/invoices')) {
      return undefined;
    }

    if (!context.allows('invoices.issue') && !context.allows('member_payments.manage')) {
      return forbidden;
    }

    if (path === '/cga/invoices') {
      if (method === 'POST') {
        return context.allows('invoices.issue') ? issue(body) : forbidden;
      }

      const status = query.get('filter[status]');
      const member = query.get('filter[member_id]');

      return paginated(
        invoices.filter(
          (item) =>
            (status === null || item.status === status) &&
            (member === null || item.member?.id === member),
        ),
        query,
      );
    }

    const match =
      /^\/cga\/invoices\/([^/]+)\/(manual-certification|resubmit|cancel|credit-note|deliver)$/.exec(
        path,
      );
    const target = match === null ? undefined : invoices.find((item) => item.id === match[1]);

    if (match === null || target === undefined) {
      return notFound;
    }

    if (match[2] === 'deliver' && target.status !== 'certified') {
      return conflict(
        'invoice_not_certified',
        'Seule une facture certifiée se remet à l’adhérent.',
      );
    }

    return act(target, match[2], body);
  }

  return { route, invoices: () => invoices };
}
