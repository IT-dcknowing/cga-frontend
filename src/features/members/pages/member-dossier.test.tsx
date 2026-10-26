import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { httpAuthApi } from '@/features/auth/api/auth-api';
import { memberRoutes } from '@/features/members/lib/member';
import { config } from '@/lib/config';
import { formatAmount } from '@/lib/format';
import { fr } from '@/lib/i18n/fr';
import { createMembersBackend } from '@/test/api-members';
import { apiUrl, demoIds, installApiServer } from '@/test/api-server';
import { demoMember, demoMemberIds, demoMembers } from '@/test/demo-members';
import { fieldByLabel } from '@/test/fields';
import { renderApp } from '@/test/render-app';

/*
 * `/cga/adherents/:id`, étape 3.8 (06-IMPLEMENTATION-PLAN, 03-APPFLOW §4.3) : onglets « Honoraires et
 * paiements » (F-PAY-01 à 03) et « Documents » (F-DOC-01 à 05), blocage manuel de l'attestation
 * (RG-DOC-10), paiement du droit d'adhésion à la validation (RG-ADH-02) et bandeau post-validation
 * (produire, inviter) ; vrai client `http`, backend simulé (`api-dossier.ts`).
 */
const labels = fr.members.detail;
const finance = fr.members.finance;
const documents = fr.members.documents;

let server: ReturnType<typeof installApiServer>;
let members: ReturnType<typeof createMembersBackend>;
const pollMs = config.documentPollMs;

beforeEach(() => {
  // Un document en production se relit vite pendant les tests.
  (config as { documentPollMs: number }).documentPollMs = 20;
});

afterEach(() => {
  server.restore();
  (config as { documentPollMs: number }).documentPollMs = pollMs;
});

const accesses = {
  gerant: ['0700000002', demoIds.manager],
  comptable: ['0700000004', demoIds.accountant],
  formateur: ['0700000007', demoIds.trainer],
} as const;

const readyDraftId = '01mbr000000000000000000011';
const overdueId = '01mbr000000000000000000012';
const cabinetDraftId = '01mbr000000000000000000013';
const paidDraftId = '01mbr000000000000000000014';

/** Dossier complet hors validation : seuls manquent le droit d'adhésion et la confirmation. */
const complete = {
  status: 'draft',
  status_label: 'Brouillon',
  adhesion_date: null,
  validated_at: null,
  address: 'Rue du commerce',
  signatory_name: 'Diallo',
  signatory_title: 'Gérant',
  sector: { id: '01sec000000000000000000001', code: 'COM', name: 'Commerce', status: 'validated' },
  reference_revenue: { year: 2025, amount: 3000000, kind: 'actual', source: 'entry' },
  can: {
    update: true,
    validate: true,
    delete: true,
    change_regime: false,
    request_radiation: false,
    move_to_cga: false,
    block_attestation: false,
    release_attestation: false,
  },
} as const;

function dataset() {
  return [
    ...demoMembers(),
    demoMember({
      ...complete,
      id: readyDraftId,
      company_name: 'TRANSPORTS DIALLO',
      ncc: '1000011L',
      missing_for_validation: ['entry_fee_payment'],
    }),
    demoMember({
      id: overdueId,
      company_name: 'IMPRIMERIE KONÉ',
      ncc: '1000012M',
      membership_number: '2026-DCK-0012',
      fees_overdue_periods: 4,
      alerts: [
        {
          code: 'fees_overdue',
          label: 'Honoraires impayés depuis 4 mois',
          since: '2026-06-05',
          days: 143,
          overdue: true,
          periods: 4,
        },
      ],
    }),
    demoMember({
      ...complete,
      id: paidDraftId,
      company_name: 'LIBRAIRIE DIALLO',
      ncc: '1000014P',
    }),
    demoMember({
      ...complete,
      id: cabinetDraftId,
      portfolio: 'cabinet',
      portfolio_label: 'Portefeuille Cabinet',
      company_name: 'BRIQUETERIE NGUESSAN',
      ncc: '1000013N',
      entry_fee_amount: 0,
      contract: { signed_on: null, confirmed: false, ended_on: null },
    }),
  ];
}

const names: Record<string, string> = {
  [demoMemberIds.adjoua]: 'BOULANGERIE ADJOUA',
  [demoMemberIds.kouadio]: 'ETS KOUADIO & FILS',
  [demoMemberIds.cabinet]: 'CABINET CLIENT SARL',
  [readyDraftId]: 'TRANSPORTS DIALLO',
  [overdueId]: 'IMPRIMERIE KONÉ',
  [cabinetDraftId]: 'BRIQUETERIE NGUESSAN',
  [paidDraftId]: 'LIBRAIRIE DIALLO',
};

type User = ReturnType<typeof userEvent.setup>;

async function openMember(id: string, who: keyof typeof accesses = 'gerant') {
  members = createMembersBackend(dataset());
  server = installApiServer({ members });

  const [phone, membershipId] = accesses[who];

  server.signIn(phone, membershipId);

  const session = await httpAuthApi.currentSession();
  const user = userEvent.setup({ delay: null });
  const view = renderApp({ api: httpAuthApi, session, entry: memberRoutes.detail(id) });

  await screen.findByRole('heading', { level: 1, name: names[id] });

  return { user, ...view };
}

async function openTab(user: User, name: string) {
  await user.click(screen.getByRole('tab', { name }));
}

async function menu(user: User, label: string, item: string) {
  await user.click(screen.getByRole('button', { name: label }));
  await user.click(screen.getByRole('menuitem', { name: item }));
}

function writes(suffix: string) {
  return server.requests.filter(
    (request) => request.method !== 'GET' && new URL(request.url).pathname.endsWith(suffix),
  );
}

function bodyOf(suffix: string, index = -1): Record<string, unknown> {
  const body = writes(suffix).at(index)?.body;

  return body instanceof FormData
    ? Object.fromEntries(body.entries())
    : (body as Record<string, unknown>);
}

/** Texte tel que Testing Library le compare : espaces insécables des montants ramenés à un espace. */
function spaced(text: string): string {
  return text.replace(/\s+/g, ' ');
}

function list(name: string) {
  return within(screen.getByRole('list', { name }));
}

/** Bandeau vert du dossier (rôle `status`) ; le toast de la validation porte le même texte. */
function validatedBanner(text: string): HTMLElement | undefined {
  return screen
    .queryAllByRole('status')
    .find(
      (element) =>
        element.getAttribute('data-slot') === 'banner' && element.textContent?.includes(text),
    );
}

async function expectValidatedBanner(text: string) {
  await waitFor(
    () => {
      expect(validatedBanner(text)).toBeVisible();
    },
    { timeout: 5000 },
  );
}

/** Parcours avec modales et relectures : délai propre (voir la fiche adhérent). */
const JOURNEY = { timeout: 15_000 };

describe('/cga/adherents/:id · Honoraires et paiements (F-PAY-01 à 03)', JOURNEY, () => {
  it('F-PAY-01 · échéances (montant TTC, payé, reste, statut) et paiements (mode, reçu, statut)', async () => {
    const { user } = await openMember(demoMemberIds.adjoua);

    await openTab(user, labels.tabs.finance);

    const charges = within(await screen.findByRole('list', { name: finance.charges.title }));

    expect(charges.getByText('Honoraires · 01/10/2026 – 31/10/2026')).toBeVisible();
    expect(charges.getByText(spaced(finance.charges.amount(formatAmount(17700))))).toBeVisible();
    expect(charges.getByText(spaced(finance.charges.balance(formatAmount(17700))))).toBeVisible();
    expect(charges.getByText('Droit d’adhésion')).toBeVisible();
    expect(charges.getByText(fr.status.charge.paid)).toBeVisible();

    const payments = list(finance.payments.title);

    expect(payments.getByText('REC-DCK-2026-00001')).toBeVisible();
    expect(payments.getByText(fr.status.payment.pending_confirmation)).toBeVisible();
    expect(payments.getByText('Mobile money · OM-OCT · Déclaré par l’adhérent')).toBeVisible();
  });

  it('RG-PAY-02 · « Enregistrer un paiement » : échéance cochée, montant = reste dû, reçu numéroté', async () => {
    const { user } = await openMember(demoMemberIds.adjoua);

    await openTab(user, labels.tabs.finance);
    await user.click(await screen.findByRole('button', { name: finance.record }));

    const dialog = screen.getByRole('dialog', { name: finance.paymentDialog.title });
    const amount = fieldByLabel(dialog, finance.paymentDialog.amount);
    const fees = within(dialog).getByRole('checkbox', { name: /Honoraires · 01\/10\/2026/ });

    await waitFor(() => {
      expect(amount).toHaveValue('17700');
    });
    expect(fees).toBeChecked();
    // Le droit d'adhésion payé n'est plus proposé.
    expect(within(dialog).queryByRole('checkbox', { name: /Droit d’adhésion/ })).toBeNull();

    // Échéance décochée : montant nul, refusé avant l'envoi.
    await user.click(fees);
    expect(amount).toHaveValue('0');
    await user.click(within(dialog).getByRole('button', { name: finance.paymentDialog.submit }));
    expect(await within(dialog).findByText(fr.members.create.errors.number)).toBeVisible();
    expect(writes('/payments')).toHaveLength(0);

    await user.click(fees);
    expect(amount).toHaveValue('17700');
    await user.type(fieldByLabel(dialog, finance.paymentDialog.reference), 'OM-NOV');
    await user.click(within(dialog).getByRole('button', { name: finance.paymentDialog.submit }));

    expect(
      await screen.findByText(finance.recordedWithReceipt('REC-DCK-2026-00002')),
    ).toBeInTheDocument();
    expect(bodyOf('/payments')).toMatchObject({
      amount: '17700',
      method: 'mobile_money',
      reference: 'OM-NOV',
      'charge_ids[0]': '01chg000000000000000000002',
    });
    await waitFor(() => {
      expect(list(finance.charges.title).getAllByText(fr.status.charge.paid).length).toBe(2);
    });
  });

  it('paiement : montant saisi à la main conservé ; 422 sous le champ ; 409 dans la modale', async () => {
    const { user } = await openMember(demoMemberIds.adjoua);

    await openTab(user, labels.tabs.finance);
    await user.click(await screen.findByRole('button', { name: finance.record }));

    const dialog = screen.getByRole('dialog', { name: finance.paymentDialog.title });
    const amount = fieldByLabel(dialog, finance.paymentDialog.amount);
    const fees = within(dialog).getByRole('checkbox', { name: /Honoraires · 01\/10\/2026/ });

    await waitFor(() => {
      expect(amount).toHaveValue('17700');
    });
    await user.clear(amount);
    await user.type(amount, '5000');
    await user.click(fees);
    expect(amount).toHaveValue('5000');

    await user.clear(fieldByLabel(dialog, finance.paymentDialog.paidOn));
    await user.click(within(dialog).getByRole('button', { name: finance.paymentDialog.submit }));
    expect(await within(dialog).findByText(fr.members.create.errors.required)).toBeVisible();
    await user.type(fieldByLabel(dialog, finance.paymentDialog.paidOn), '2026-10-25');

    server.failNext('POST', apiUrl(`/cga/members/${demoMemberIds.adjoua}/payments`), {
      status: 422,
      data: { message: 'Invalide.', errors: { amount: ['Le montant dépasse le reste dû.'] } },
    });
    await user.click(within(dialog).getByRole('button', { name: finance.paymentDialog.submit }));
    expect(await within(dialog).findByText('Le montant dépasse le reste dû.')).toBeVisible();

    server.failNext('POST', apiUrl(`/cga/members/${demoMemberIds.adjoua}/payments`), {
      status: 409,
      data: { message: 'Ce dossier est clos.', code: 'member_closed', details: {} },
    });
    await user.click(within(dialog).getByRole('button', { name: finance.paymentDialog.submit }));
    expect(await within(dialog).findByText('Ce dossier est clos.')).toBeVisible();

    await user.click(within(dialog).getByRole('button', { name: fr.common.cancel }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('F-PAY-03 · paiement déclaré par l’adhérent : « Examiner » → Confirmer, reçu attribué', async () => {
    const { user } = await openMember(demoMemberIds.adjoua);

    await openTab(user, labels.tabs.finance);
    await user.click(await screen.findByRole('button', { name: finance.examine }));

    const dialog = screen.getByRole('dialog', { name: finance.review.title });

    expect(
      within(dialog).getByText(
        spaced(finance.review.description(formatAmount(17700), '20/10/2026')),
      ),
    ).toBeVisible();
    expect(
      within(dialog).getByRole('link', { name: finance.review.proof('preuve.jpg') }),
    ).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: finance.review.confirm }));

    expect(await screen.findByText(finance.review.confirmed)).toBeInTheDocument();
    expect(writes('/confirm')).toHaveLength(1);
    expect(await list(finance.payments.title).findByText('REC-DCK-2026-00002')).toBeVisible();
    expect(screen.queryByRole('button', { name: finance.examine })).toBeNull();
  });

  it('F-PAY-03 · rejet : motif obligatoire, puis « Rejeté : motif » ; 409 dans la modale', async () => {
    const { user } = await openMember(demoMemberIds.adjoua);

    await openTab(user, labels.tabs.finance);
    await user.click(await screen.findByRole('button', { name: finance.examine }));

    const dialog = screen.getByRole('dialog', { name: finance.review.title });

    await user.click(within(dialog).getByRole('checkbox', { name: finance.review.toReject }));
    await user.click(within(dialog).getByRole('button', { name: finance.review.reject }));
    expect(await within(dialog).findByText(fr.members.create.errors.required)).toBeVisible();
    expect(writes('/reject')).toHaveLength(0);

    await user.type(fieldByLabel(dialog, finance.review.reason), 'Preuve illisible');
    server.failNext(
      'POST',
      apiUrl(`/cga/members/${demoMemberIds.adjoua}/payments/01pay000000000000000000002/reject`),
      { status: 409, data: { message: 'Déjà examiné.', code: 'payment_not_pending', details: {} } },
    );
    await user.click(within(dialog).getByRole('button', { name: finance.review.reject }));
    expect(await within(dialog).findByText('Déjà examiné.')).toBeVisible();

    await user.click(within(dialog).getByRole('button', { name: finance.review.reject }));
    expect(await screen.findByText(finance.review.rejected)).toBeInTheDocument();
    expect(bodyOf('/reject')).toEqual({ reason: 'Preuve illisible' });
    expect(
      await list(finance.payments.title).findByText(finance.payments.rejected('Preuve illisible')),
    ).toBeVisible();
  });

  it('sans le droit de gérer les paiements (formateur) : consultation seule', async () => {
    const { user } = await openMember(demoMemberIds.adjoua, 'formateur');

    await openTab(user, labels.tabs.finance);

    expect(await screen.findByRole('list', { name: finance.charges.title })).toBeVisible();
    expect(screen.queryByRole('button', { name: finance.record })).toBeNull();
  });

  it('dossier sans somme due ni paiement : états vides ; panne : bandeau et « Réessayer »', async () => {
    const { user } = await openMember(demoMemberIds.cabinet);

    for (let attempt = 0; attempt < 2; attempt++) {
      server.failNext('GET', apiUrl(`/cga/members/${demoMemberIds.cabinet}/charges`), {
        status: 500,
        data: { message: 'Erreur.' },
      });
    }
    await openTab(user, labels.tabs.finance);

    expect(await screen.findByText(finance.loadError, {}, { timeout: 4000 })).toBeVisible();
    await user.click(screen.getByRole('button', { name: fr.common.retry }));

    expect(await screen.findByText(finance.charges.empty)).toBeVisible();
    expect(screen.getByText(finance.payments.empty)).toBeVisible();
  });
});

describe('/cga/adherents/:id · Documents (F-DOC-01 à 05)', JOURNEY, () => {
  it('liste : type, n°, date, statut, liens PDF et Word', async () => {
    const { user } = await openMember(demoMemberIds.adjoua);

    await openTab(user, labels.tabs.documents);

    const rows = within(await screen.findByRole('list', { name: documents.caption }));

    expect(rows.getByText('Contrat d’adhésion')).toBeVisible();
    expect(rows.getByText(/CTR-DCK-2026-00001/)).toBeVisible();
    expect(rows.getByText('Attestation d’adhésion 2026')).toBeVisible();
    expect(rows.getAllByRole('link', { name: documents.pdf })).toHaveLength(2);
    expect(rows.getAllByRole('link', { name: documents.docx })).toHaveLength(1);
    expect(rows.getAllByText(fr.status.document.valid)).toHaveLength(2);
  });

  it('RG-DOC-05 · « Produire le contrat » : ligne « En production », puis « Contrat d’adhésion prêt »', async () => {
    const { user } = await openMember(demoMemberIds.adjoua);

    await openTab(user, labels.tabs.documents);
    await screen.findByRole('list', { name: documents.caption });
    await menu(user, documents.menu, documents.produceContract);

    expect(await screen.findByText(documents.producing)).toBeInTheDocument();
    expect(bodyOf('/documents')).toEqual({ type: 'membership_contract' });
    expect(await screen.findByText(documents.ready('Contrat d’adhésion'))).toBeInTheDocument();
    await waitFor(() => {
      expect(list(documents.caption).getAllByText(fr.status.document.valid)).toHaveLength(3);
    });
  });

  it('RG-DOC-10 · attestation bloquée : la production est refusée (409) avec le message du serveur', async () => {
    const { user } = await openMember(demoMemberIds.adjoua);

    await openTab(user, labels.tabs.documents);
    await screen.findByRole('list', { name: documents.caption });
    server.failNext('POST', apiUrl(`/cga/members/${demoMemberIds.adjoua}/documents`), {
      status: 409,
      data: {
        message: 'L’attestation de ce dossier est bloquée.',
        code: 'attestation_blocked',
        details: {},
      },
    });
    await menu(user, documents.menu, documents.produceCertificate);

    expect(await screen.findByText('L’attestation de ce dossier est bloquée.')).toBeInTheDocument();
    expect(members.dossier.documents(demoMemberIds.adjoua)).toHaveLength(2);
  });

  it('RG-DOC-06 · « Rééditer » : nouvelle version en production, puis prête', async () => {
    const { user } = await openMember(demoMemberIds.adjoua);

    await openTab(user, labels.tabs.documents);
    await screen.findByRole('list', { name: documents.caption });
    await menu(user, documents.rowActions('Attestation d’adhésion 2026'), documents.regenerate);

    expect(await screen.findByText(documents.regenerated)).toBeInTheDocument();
    expect(writes('/01doc000000000000000000002/regenerate')).toHaveLength(1);
    expect(await screen.findByText(documents.ready('Attestation d’adhésion'))).toBeInTheDocument();
    expect(await list(documents.caption).findByText(/version 2/)).toBeVisible();
  });

  it('F-DOC-03 · « Annuler » un document : motif obligatoire, puis statut « Annulé »', async () => {
    const { user } = await openMember(demoMemberIds.adjoua);

    await openTab(user, labels.tabs.documents);
    await screen.findByRole('list', { name: documents.caption });
    await menu(user, documents.rowActions('Contrat d’adhésion'), documents.cancel.action);

    const dialog = screen.getByRole('dialog', { name: documents.cancel.title });

    expect(within(dialog).getByText(documents.cancel.effects[0])).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: documents.cancel.submit }));
    expect(await within(dialog).findByText(fr.members.create.errors.required)).toBeVisible();
    expect(writes('/cancel')).toHaveLength(0);

    await user.type(fieldByLabel(dialog, documents.cancel.reason), 'Erreur de raison sociale');
    await user.click(within(dialog).getByRole('button', { name: documents.cancel.submit }));

    expect(await screen.findByText(documents.cancel.done)).toBeInTheDocument();
    expect(bodyOf('/cancel')).toEqual({ reason: 'Erreur de raison sociale' });
    expect(await list(documents.caption).findByText(fr.status.document.cancelled)).toBeVisible();
  });

  it('F-DOC-05 · « Déposer un document » : titre et fichier exigés, puis la ligne déposée', async () => {
    const { user } = await openMember(demoMemberIds.adjoua);

    await openTab(user, labels.tabs.documents);
    await screen.findByRole('list', { name: documents.caption });
    await menu(user, documents.menu, documents.upload.action);

    const dialog = screen.getByRole('dialog', { name: documents.upload.title });

    await user.click(within(dialog).getByRole('button', { name: documents.upload.submit }));
    expect(await within(dialog).findAllByText(fr.members.create.errors.required)).toHaveLength(2);
    expect(writes('/documents/upload')).toHaveLength(0);

    await user.type(fieldByLabel(dialog, documents.upload.name), 'Bilan 2025 visé');
    await user.selectOptions(
      fieldByLabel(dialog, documents.upload.category),
      'financial_statements',
    );
    await user.upload(
      fieldByLabel(dialog, documents.upload.file),
      new File(['%PDF-1.4'], 'bilan.pdf', { type: 'application/pdf' }),
    );

    server.failNext('POST', apiUrl(`/cga/members/${demoMemberIds.adjoua}/documents/upload`), {
      status: 422,
      data: { message: 'Invalide.', errors: { file: ['Le fichier doit être un PDF.'] } },
    });
    await user.click(within(dialog).getByRole('button', { name: documents.upload.submit }));
    expect(await within(dialog).findByText('Le fichier doit être un PDF.')).toBeVisible();

    await user.click(within(dialog).getByRole('button', { name: documents.upload.submit }));

    expect(await screen.findByText(documents.upload.done)).toBeInTheDocument();
    expect(bodyOf('/documents/upload')).toMatchObject({
      title: 'Bilan 2025 visé',
      category: 'financial_statements',
    });
    expect(await list(documents.caption).findByText('Bilan 2025 visé')).toBeVisible();
  });

  it('dossier du Cabinet : dépôt seulement ; brouillon et formateur : aucune production', async () => {
    const cabinet = await openMember(demoMemberIds.cabinet);

    await openTab(cabinet.user, labels.tabs.documents);
    expect(await screen.findByText(documents.empty)).toBeVisible();
    await cabinet.user.click(screen.getByRole('button', { name: documents.menu }));
    expect(screen.getByRole('menuitem', { name: documents.upload.action })).toBeVisible();
    expect(screen.queryByRole('menuitem', { name: documents.produceContract })).toBeNull();
    cabinet.unmount();
    server.restore();

    const draft = await openMember(demoMemberIds.kouadio);

    await openTab(draft.user, labels.tabs.documents);
    expect(await screen.findByText(documents.empty)).toBeVisible();
    expect(screen.queryByRole('button', { name: documents.menu })).toBeNull();
    draft.unmount();
    server.restore();

    const trainer = await openMember(demoMemberIds.adjoua, 'formateur');

    await openTab(trainer.user, labels.tabs.documents);
    await screen.findByRole('list', { name: documents.caption });
    expect(screen.queryByRole('button', { name: documents.menu })).toBeNull();
  });

  it('documents en panne : bandeau et « Réessayer »', async () => {
    const { user } = await openMember(demoMemberIds.adjoua);

    for (let attempt = 0; attempt < 2; attempt++) {
      server.failNext('GET', apiUrl(`/cga/members/${demoMemberIds.adjoua}/documents`), {
        status: 500,
        data: { message: 'Erreur.' },
      });
    }
    await openTab(user, labels.tabs.documents);

    expect(await screen.findByText(documents.loadError, {}, { timeout: 4000 })).toBeVisible();
    await user.click(screen.getByRole('button', { name: fr.common.retry }));
    expect(await screen.findByRole('list', { name: documents.caption })).toBeVisible();
  });
});

describe('/cga/adherents/:id · blocage manuel de l’attestation (RG-DOC-10)', JOURNEY, () => {
  it('RG-DOC-10 · impayés de 4 mois : alerte seule, aucun blocage sans action du gérant', async () => {
    const { user } = await openMember(overdueId);

    expect(screen.getByText('Honoraires impayés depuis 4 mois')).toBeVisible();
    expect(screen.queryByText(/Attestation bloquée le/)).toBeNull();
    expect(writes('/attestation-blocks')).toHaveLength(0);

    // Le gérant décide depuis l'alerte : le motif « Honoraires impayés » est proposé d'office.
    await user.click(screen.getByRole('button', { name: labels.blockDialog.action }));

    const dialog = screen.getByRole('dialog', { name: labels.blockDialog.title });

    expect(
      within(dialog).getByRole('radio', { name: labels.blockDialog.triggers.fees_overdue }),
    ).toBeChecked();
    await user.type(fieldByLabel(dialog, labels.blockDialog.reason), 'Relances sans réponse');
    await user.click(within(dialog).getByRole('button', { name: labels.blockDialog.submit }));

    expect(bodyOf('/attestation-blocks')).toEqual({
      trigger: 'fees_overdue',
      reason: 'Relances sans réponse',
    });
    expect(
      await screen.findByText(
        labels.banners.attestationBlocked(
          '26/10/2026',
          'Honoraires impayés',
          'Relances sans réponse',
        ),
      ),
    ).toBeVisible();
  });

  it('RG-DOC-10 · « Bloquer » (motif obligatoire) puis « Débloquer » depuis le bandeau', async () => {
    const { user } = await openMember(demoMemberIds.adjoua);

    await user.click(screen.getByRole('button', { name: labels.actions }));
    await user.click(screen.getByRole('menuitem', { name: labels.blockDialog.action }));

    const dialog = screen.getByRole('dialog', { name: labels.blockDialog.title });

    expect(within(dialog).getAllByRole('radio')).toHaveLength(1);
    await user.click(within(dialog).getByRole('button', { name: labels.blockDialog.submit }));
    expect(await within(dialog).findByText(fr.members.create.errors.required)).toBeVisible();
    expect(writes('/attestation-blocks')).toHaveLength(0);

    await user.type(fieldByLabel(dialog, labels.blockDialog.reason), 'Dossier en litige');
    await user.click(within(dialog).getByRole('button', { name: labels.blockDialog.submit }));

    const banner = await screen.findByText(
      labels.banners.attestationBlocked('26/10/2026', 'Décision du gérant', 'Dossier en litige'),
    );

    expect(bodyOf('/attestation-blocks')).toEqual({
      trigger: 'manual',
      reason: 'Dossier en litige',
    });

    await user.click(
      within(banner.closest('[role]') ?? document.body).getByRole('button', {
        name: labels.releaseDialog.action,
      }),
    );

    const release = screen.getByRole('dialog', { name: labels.releaseDialog.title });

    await user.click(within(release).getByRole('button', { name: labels.releaseDialog.submit }));
    expect(await within(release).findByText(fr.members.create.errors.required)).toBeVisible();

    await user.type(fieldByLabel(release, labels.releaseDialog.reason), 'Litige réglé');
    await user.click(within(release).getByRole('button', { name: labels.releaseDialog.submit }));

    expect(await screen.findByText(labels.releaseDialog.done)).toBeInTheDocument();
    expect(bodyOf('/attestation-blocks/release')).toEqual({ reason: 'Litige réglé' });
    await waitFor(() => {
      expect(screen.queryByText(/Attestation bloquée le/)).toBeNull();
    });
  });

  it('blocage refusé (409) : message dans la modale', async () => {
    const { user } = await openMember(demoMemberIds.adjoua);

    await user.click(screen.getByRole('button', { name: labels.actions }));
    await user.click(screen.getByRole('menuitem', { name: labels.blockDialog.action }));

    const dialog = screen.getByRole('dialog', { name: labels.blockDialog.title });

    await user.type(fieldByLabel(dialog, labels.blockDialog.reason), 'Litige');
    server.failNext('POST', apiUrl(`/cga/members/${demoMemberIds.adjoua}/attestation-blocks`), {
      status: 409,
      data: { message: 'Déjà bloquée.', code: 'attestation_already_blocked', details: {} },
    });
    await user.click(within(dialog).getByRole('button', { name: labels.blockDialog.submit }));

    expect(await within(dialog).findByText('Déjà bloquée.')).toBeVisible();

    server.failNext('POST', apiUrl(`/cga/members/${demoMemberIds.adjoua}/attestation-blocks`), {
      status: 422,
      data: { message: 'Invalide.', errors: { reason: ['Le motif est trop long.'] } },
    });
    await user.click(within(dialog).getByRole('button', { name: labels.blockDialog.submit }));
    expect(await within(dialog).findByText('Le motif est trop long.')).toBeVisible();

    await user.click(within(dialog).getByRole('button', { name: fr.common.cancel }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(screen.queryByText(/Attestation bloquée le/)).toBeNull();
  });

  it('déblocage refusé : 409 dans la modale, 422 sous le champ ; « Annuler » ne débloque rien', async () => {
    const { user } = await openMember(demoMemberIds.adjoua);

    await user.click(screen.getByRole('button', { name: labels.actions }));
    await user.click(screen.getByRole('menuitem', { name: labels.blockDialog.action }));
    await user.type(
      fieldByLabel(
        screen.getByRole('dialog', { name: labels.blockDialog.title }),
        labels.blockDialog.reason,
      ),
      'Dossier en litige',
    );
    await user.click(screen.getByRole('button', { name: labels.blockDialog.submit }));
    await screen.findByText(/Attestation bloquée le/);

    await user.click(screen.getByRole('button', { name: labels.actions }));
    await user.click(screen.getByRole('menuitem', { name: labels.releaseDialog.action }));

    const release = screen.getByRole('dialog', { name: labels.releaseDialog.title });
    const url = apiUrl(`/cga/members/${demoMemberIds.adjoua}/attestation-blocks/release`);

    await user.type(fieldByLabel(release, labels.releaseDialog.reason), 'Litige réglé');
    server.failNext('POST', url, {
      status: 409,
      data: { message: 'Aucun blocage en cours.', code: 'attestation_not_blocked', details: {} },
    });
    await user.click(within(release).getByRole('button', { name: labels.releaseDialog.submit }));
    expect(await within(release).findByText('Aucun blocage en cours.')).toBeVisible();

    server.failNext('POST', url, {
      status: 422,
      data: { message: 'Invalide.', errors: { reason: ['Le motif est trop long.'] } },
    });
    await user.click(within(release).getByRole('button', { name: labels.releaseDialog.submit }));
    expect(await within(release).findByText('Le motif est trop long.')).toBeVisible();

    await user.click(within(release).getByRole('button', { name: fr.common.cancel }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(screen.getByText(/Attestation bloquée le/)).toBeVisible();
  });

  it('RG-ADH-07 · régénération refusée (409) : toast du message ; Échap ferme la modale', async () => {
    const { user } = await openMember(demoMemberIds.adjoua);

    await user.click(screen.getByRole('button', { name: labels.edit }));

    const edit = screen.getByRole('dialog', { name: labels.editDialog.title });

    await user.type(fieldByLabel(edit, fr.members.fields.address), 'Rue 12');
    await user.click(within(edit).getByRole('button', { name: labels.editDialog.submit }));

    const regenerate = await screen.findByRole('dialog', { name: labels.regenerateDialog.title });

    server.failNext('POST', apiUrl('/cga/documents/01doc000000000000000000001/regenerate'), {
      status: 409,
      data: { message: 'Ce contrat est annulé.', code: 'document_cancelled', details: {} },
    });
    await user.click(
      within(regenerate).getByRole('button', { name: labels.regenerateDialog.submit }),
    );
    expect(await screen.findByText('Ce contrat est annulé.')).toBeInTheDocument();

    server.failNext('POST', apiUrl('/cga/documents/01doc000000000000000000001/regenerate'), {
      status: 500,
      data: { message: 'Erreur.' },
    });
    await user.click(
      within(regenerate).getByRole('button', { name: labels.regenerateDialog.submit }),
    );
    expect(await screen.findByText(fr.errors.http.server)).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});

describe(
  '/cga/adherents/:id · validation et suites (03-APPFLOW §4.3, parcours P2)',
  JOURNEY,
  () => {
    it('RG-ADH-02 · droit d’adhésion seul manquant : paiement, validation, bandeau vert, production', async () => {
      const { user } = await openMember(readyDraftId);

      await user.click(screen.getByRole('button', { name: labels.validateDialog.action }));

      const dialog = screen.getByRole('dialog', { name: labels.validateDialog.title });

      expect(within(dialog).getByText(labels.validateDialog.entryFeeNext)).toBeVisible();
      await user.click(
        within(dialog).getByRole('checkbox', { name: fr.members.fields.exclusivityConfirmed }),
      );
      await user.click(within(dialog).getByRole('button', { name: labels.validateDialog.submit }));

      const payment = await screen.findByRole('dialog', { name: finance.entryFee.title });
      const amount = fieldByLabel(payment, finance.paymentDialog.amount);

      await waitFor(() => {
        expect(amount).toHaveValue('29500');
      });
      expect(within(payment).getAllByRole('checkbox')).toHaveLength(1);
      await user.click(within(payment).getByRole('button', { name: finance.entryFee.submit }));

      await expectValidatedBanner(labels.banners.validated('2026-DCK-0003'));
      expect(writes('/payments')).toHaveLength(1);
      expect(bodyOf('/validate')).toEqual({ exclusivity_confirmed: true });

      // Suites proposées : produire le contrat et l'attestation, puis l'onglet Documents.
      await user.click(screen.getByRole('button', { name: labels.banners.produceDocuments }));

      expect(await screen.findByText(labels.banners.produced)).toBeInTheDocument();
      expect(writes('/documents').map((request) => request.body)).toEqual([
        { type: 'membership_contract' },
        { type: 'membership_certificate' },
      ]);
      expect(screen.getByRole('tab', { name: labels.tabs.documents })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      expect(await screen.findByText(documents.ready('Contrat d’adhésion'))).toBeInTheDocument();
    });

    it('bandeau vert : « Inviter l’adhérent en ligne » ouvre l’onglet des accès ; « Fermer » le retire', async () => {
      const { user } = await openMember(paidDraftId);

      members.payEntryFee(paidDraftId);
      await user.click(screen.getByRole('button', { name: labels.validateDialog.action }));

      const dialog = screen.getByRole('dialog', { name: labels.validateDialog.title });

      await user.click(
        within(dialog).getByRole('checkbox', { name: fr.members.fields.exclusivityConfirmed }),
      );
      await user.click(within(dialog).getByRole('button', { name: labels.validateDialog.submit }));
      // Le paiement est déjà là : le serveur valide sans autre étape.
      await expectValidatedBanner(labels.banners.validated('2026-DCK-0003'));
      expect(writes('/payments')).toHaveLength(0);

      await user.click(screen.getByRole('button', { name: labels.banners.inviteOnline }));
      expect(screen.getByRole('tab', { name: labels.tabs.accesses })).toHaveAttribute(
        'aria-selected',
        'true',
      );

      await user.click(screen.getByRole('button', { name: labels.banners.close }));
      expect(validatedBanner(labels.banners.validated('2026-DCK-0003'))).toBeUndefined();
    });

    it('production refusée depuis le bandeau (409) : toast du message ; Cabinet : ni contrat ni attestation', async () => {
      const { user, unmount } = await openMember(paidDraftId);

      members.payEntryFee(paidDraftId);
      await user.click(screen.getByRole('button', { name: labels.validateDialog.action }));

      const dialog = screen.getByRole('dialog', { name: labels.validateDialog.title });

      await user.click(
        within(dialog).getByRole('checkbox', { name: fr.members.fields.exclusivityConfirmed }),
      );
      await user.click(within(dialog).getByRole('button', { name: labels.validateDialog.submit }));
      await expectValidatedBanner(labels.banners.validated('2026-DCK-0003'));

      server.failNext('POST', apiUrl(`/cga/members/${paidDraftId}/documents`), {
        status: 409,
        data: {
          message: 'Complétez la fiche du centre pour produire vos documents.',
          code: 'organization_profile_incomplete',
          details: {},
        },
      });
      await user.click(screen.getByRole('button', { name: labels.banners.produceDocuments }));
      expect(
        await screen.findByText('Complétez la fiche du centre pour produire vos documents.'),
      ).toBeInTheDocument();
      unmount();
      server.restore();

      const cabinet = await openMember(cabinetDraftId);

      await cabinet.user.click(screen.getByRole('button', { name: labels.validateDialog.action }));
      await cabinet.user.click(
        within(screen.getByRole('dialog', { name: labels.validateDialog.title })).getByRole(
          'button',
          { name: labels.validateDialog.submit },
        ),
      );

      await expectValidatedBanner(labels.banners.clientCreated('CAB-DCK-00003'));
      expect(screen.queryByRole('button', { name: labels.banners.produceDocuments })).toBeNull();
    });
  },
);
