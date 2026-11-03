import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { httpAuthApi } from '@/features/auth/api/auth-api';
import { memberRoutes } from '@/features/members/lib/member';
import { formatAmount } from '@/lib/format';
import { fr } from '@/lib/i18n/fr';
import { demoInstanceIds } from '@/test/api-obligations';
import { apiUrl, demoIds, installApiServer } from '@/test/api-server';
import { demoMemberIds } from '@/test/demo-members';
import { renderApp } from '@/test/render-app';

/*
 * Onglet « Obligations » du dossier (06-IMPLEMENTATION-PLAN étape 4.6, F-OBL-03, 04, RG-OBL-07, 09) :
 * quatre blocs et leurs récapitulatifs, actions par ligne selon le serveur, déclaration de
 * l'adhérent (confirmer, corriger, rejeter), autre administration, gestion des obligations. Vrai
 * client `http`, backend simulé (`api-obligations.ts`).
 */
const labels = fr.obligations;
const tab = labels.tab;
const dialogs = labels.dialogs;
const ADJOUA = demoMemberIds.adjoua;

/** Texte tel que le lit Testing Library : espaces insécables des montants normalisés. */
function plain(value: string): string {
  return value.replace(/\s/g, ' ');
}

let server: ReturnType<typeof installApiServer>;

afterEach(() => {
  server.restore();
});

async function open(phone = '0700000002', membership: string = demoIds.manager) {
  server = installApiServer();
  server.signIn(phone, membership);

  const session = await httpAuthApi.currentSession();
  const user = userEvent.setup({ delay: null });
  const view = renderApp({
    api: httpAuthApi,
    session,
    entry: memberRoutes.detailTab(ADJOUA, 'obligations'),
  });

  await screen.findByRole('region', { name: labels.categories.tax });

  return { user, ...view };
}

type User = ReturnType<typeof userEvent.setup>;

function line(label: string): HTMLElement {
  return screen.getByText(label).closest('li') as HTMLElement;
}

async function act(user: User, label: string, item: string) {
  await user.click(within(line(label)).getByRole('button', { name: tab.rowActions(label) }));
  await user.click(screen.getByRole('menuitem', { name: item }));
}

function state(id: string) {
  return server.obligations.instances(ADJOUA).find((item) => item.id === id);
}

const JOURNEY = { timeout: 20_000 };

describe('/cga/adherents/:id · onglet Obligations (4.6)', JOURNEY, () => {
  it('F-OBL-04 · quatre blocs et leurs récapitulatifs ; déclaration de l’adhérent en surbrillance', async () => {
    await open();

    for (const category of ['tax', 'cnps', 'cmu', 'other']) {
      expect(screen.getByRole('region', { name: labels.categories[category] })).toBeVisible();
    }
    const taxes = screen.getByRole('region', { name: labels.categories.tax });

    expect(
      within(taxes).getByText(
        plain([tab.summary(formatAmount(20_000)), tab.toEnter('1'), tab.overdue('1')].join(' · ')),
      ),
    ).toBeVisible();
    expect(
      within(line('TEE — 3e trimestre 2026')).getByText(tab.late, { exact: false }),
    ).toBeVisible();
    expect(within(line('TEE — 4e trimestre 2026')).getByText(tab.amountUnknown)).toBeVisible();
    expect(
      within(line('CNPS — octobre 2026')).getByText(tab.declared('Déclarée payée', '02/11/2026')),
    ).toBeVisible();
    expect(line('CNPS — octobre 2026')).toHaveClass('bg-accent-soft');
    expect(within(line('CMU — octobre 2026')).getByText(fr.status.obligation.paid)).toBeVisible();
  });

  it('montant dû puis paiement : refus au-delà du reste dû, paiement enregistré avec sa preuve', async () => {
    const { user } = await open();

    await act(user, 'TEE — 4e trimestre 2026', tab.actions.setAmount);
    let dialog = await screen.findByRole('dialog', {
      name: dialogs.amount.title('TEE — 4e trimestre 2026'),
    });

    await user.click(within(dialog).getByRole('button', { name: dialogs.amount.submit }));
    expect(within(dialog).getByText(dialogs.invalidAmount)).toBeVisible();
    await user.type(
      within(dialog).getByLabelText(new RegExp(dialogs.amountDue.replace(/[()]/g, '.'))),
      '50000',
    );
    await user.type(
      within(dialog).getByLabelText(new RegExp(dialogs.amountGross.replace(/[()]/g, '.'))),
      '100000',
    );
    await user.click(within(dialog).getByRole('button', { name: dialogs.amount.submit }));
    expect(await screen.findByText(dialogs.amount.done)).toBeVisible();
    expect(state(demoInstanceIds.teeT4)).toMatchObject({
      amount_due: 50_000,
      amount_gross: 100_000,
    });

    await waitFor(() => {
      expect(within(line('TEE — 4e trimestre 2026')).queryByText(tab.amountUnknown)).toBeNull();
    });
    await act(user, 'TEE — 4e trimestre 2026', tab.actions.recordPayment);
    dialog = await screen.findByRole('dialog', {
      name: dialogs.payment.title('TEE — 4e trimestre 2026'),
    });
    const amount = within(dialog).getByLabelText(
      new RegExp(dialogs.paidAmount.replace(/[()]/g, '.')),
    );

    expect(amount).toHaveValue('50000');
    await user.clear(amount);
    await user.type(amount, '60000');
    await user.click(within(dialog).getByRole('button', { name: dialogs.payment.submit }));
    expect(await within(dialog).findByText(/Le paiement dépasse le reste dû/)).toBeVisible();

    await user.clear(amount);
    await user.click(within(dialog).getByRole('button', { name: dialogs.payment.submit }));
    expect(within(dialog).getByText(dialogs.invalidAmount)).toBeVisible();
    await user.type(amount, '50000');
    await user.upload(
      within(dialog).getByLabelText(new RegExp(dialogs.proof.replace(/[()]/g, '.'))),
      new File(['%PDF-1.4'], 'quittance.pdf', { type: 'application/pdf' }),
    );
    await user.click(within(dialog).getByRole('button', { name: dialogs.payment.submit }));
    expect(await screen.findByText(dialogs.payment.done)).toBeVisible();
    expect(state(demoInstanceIds.teeT4)?.status).toBe('paid');
  });

  it('montant dû sous le déjà payé : refus du serveur en bandeau', async () => {
    const { user } = await open();

    await act(user, 'TEE — 3e trimestre 2026', tab.actions.setAmount);
    const dialog = await screen.findByRole('dialog', {
      name: dialogs.amount.title('TEE — 3e trimestre 2026'),
    });
    const due = within(dialog).getByLabelText(new RegExp(dialogs.amountDue.replace(/[()]/g, '.')));

    expect(due).toHaveValue('30000');
    await user.clear(due);
    await user.type(due, '5000');
    await user.click(within(dialog).getByRole('button', { name: dialogs.amount.submit }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      /inférieur au montant déjà payé/,
    );

    await user.clear(
      within(dialog).getByLabelText(new RegExp(dialogs.amountGross.replace(/[()]/g, '.'))),
    );
    await user.type(
      within(dialog).getByLabelText(new RegExp(dialogs.amountGross.replace(/[()]/g, '.'))),
      '1',
    );
    await user.clear(due);
    await user.type(due, '30000');
    await user.click(within(dialog).getByRole('button', { name: dialogs.amount.submit }));
    expect(
      await within(dialog).findByText('Le montant brut doit être supérieur ou égal au montant dû.'),
    ).toBeVisible();
  });

  it('RG-OBL-09 · paiement déclaré par l’adhérent : preuve, confirmé tel quel → payé', async () => {
    const { user } = await open();

    await act(user, 'CNPS — octobre 2026', tab.actions.review);
    const dialog = await screen.findByRole('dialog', {
      name: dialogs.review.title('CNPS — octobre 2026'),
    });

    expect(
      within(dialog).getByText(
        plain(dialogs.review.declaredPaid(formatAmount(45_000), '01/11/2026')),
      ),
    ).toBeVisible();
    expect(
      within(dialog).getByRole('link', { name: dialogs.review.proof('releve-cnps.pdf') }),
    ).toHaveAttribute('href', 'https://files.test/releve-cnps.pdf');
    await user.click(within(dialog).getByRole('button', { name: dialogs.review.submitConfirm }));

    expect(await screen.findByText(dialogs.review.confirmed)).toBeVisible();
    expect(state(demoInstanceIds.cnps)).toMatchObject({
      status: 'paid',
      amount_paid: 45_000,
      member_declared_status: null,
    });
  });

  it('RG-OBL-09 · paiement déclaré corrigé (montant, date) ; refus au-delà du reste dû', async () => {
    const { user } = await open();

    await act(user, 'CNPS — octobre 2026', tab.actions.review);
    const dialog = await screen.findByRole('dialog', {
      name: dialogs.review.title('CNPS — octobre 2026'),
    });

    await user.click(within(dialog).getByRole('radio', { name: dialogs.review.correct }));
    const amount = within(dialog).getByLabelText(
      new RegExp(dialogs.paidAmount.replace(/[()]/g, '.')),
    );

    await user.clear(amount);
    await user.click(within(dialog).getByRole('button', { name: dialogs.review.submitConfirm }));
    expect(within(dialog).getByText(dialogs.invalidAmount)).toBeVisible();
    await user.type(amount, '90000');
    await user.click(within(dialog).getByRole('button', { name: dialogs.review.submitConfirm }));
    expect(await within(dialog).findByText(/Le paiement dépasse le reste dû/)).toBeVisible();

    await user.clear(amount);
    await user.type(amount, '40000');
    await user.clear(
      within(dialog).getByLabelText(new RegExp(dialogs.amountDue.replace(/[()]/g, '.'))),
    );
    await user.click(within(dialog).getByRole('button', { name: dialogs.review.submitConfirm }));
    expect(await screen.findByText(dialogs.review.confirmed)).toBeVisible();
    expect(state(demoInstanceIds.cnps)).toMatchObject({
      status: 'partially_paid',
      amount_paid: 40_000,
    });
  });

  it('RG-OBL-09 · déclaration signalée faite : rejet avec motif obligatoire, puis « Marquer faite »', async () => {
    const { user } = await open();
    const label = 'Déclaration statistique et fiscale 2025';

    await act(user, label, tab.actions.review);
    const dialog = await screen.findByRole('dialog', { name: dialogs.review.title(label) });

    expect(within(dialog).getByText(dialogs.review.declaredDone('28/10/2026'))).toBeVisible();
    await user.click(within(dialog).getByRole('radio', { name: dialogs.review.reject }));
    await user.click(within(dialog).getByRole('button', { name: dialogs.review.submitReject }));
    expect(within(dialog).getByText(dialogs.required)).toBeVisible();
    await user.type(
      within(dialog).getByLabelText(new RegExp(dialogs.review.reason)),
      'Pas de récépissé',
    );
    await user.click(within(dialog).getByRole('button', { name: dialogs.review.submitReject }));

    expect(await screen.findByText(dialogs.review.rejected)).toBeVisible();
    expect(await screen.findByText(tab.rejected('Pas de récépissé'))).toBeVisible();

    await act(user, label, tab.actions.markDone);
    const done = await screen.findByRole('dialog', { name: dialogs.markDone.title(label) });

    await user.clear(within(done).getByLabelText(new RegExp(dialogs.date)));
    await user.click(within(done).getByRole('button', { name: dialogs.markDone.submit }));
    expect(within(done).getByText(dialogs.required)).toBeVisible();
    await user.type(within(done).getByLabelText(new RegExp(dialogs.date)), '2026-10-30');
    await user.click(within(done).getByRole('button', { name: dialogs.markDone.submit }));
    expect(await screen.findByText(dialogs.markDone.done)).toBeVisible();
    expect(state(demoInstanceIds.dsf)).toMatchObject({ status: 'done', done_at: '2026-10-30' });
  });

  it('déclaration signalée faite, corrigée à une autre date', async () => {
    const { user } = await open();
    const label = 'Déclaration statistique et fiscale 2025';

    await act(user, label, tab.actions.review);
    const dialog = await screen.findByRole('dialog', { name: dialogs.review.title(label) });

    await user.click(within(dialog).getByRole('radio', { name: dialogs.review.correct }));
    const date = within(dialog).getByLabelText(new RegExp(dialogs.date));

    expect(date).toHaveValue('2026-10-28');
    await user.clear(date);
    await user.click(within(dialog).getByRole('button', { name: dialogs.review.submitConfirm }));
    expect(within(dialog).getByText(dialogs.required)).toBeVisible();
    await user.type(date, '2026-10-25');
    await user.click(within(dialog).getByRole('button', { name: dialogs.review.submitConfirm }));
    expect(await screen.findByText(dialogs.review.confirmed)).toBeVisible();
    expect(state(demoInstanceIds.dsf)).toMatchObject({ status: 'done', done_at: '2026-10-25' });
  });

  it('statut d’une diligence ; « + Autre administration » : champs obligatoires, échéance ajoutée', async () => {
    const { user } = await open();

    await act(user, 'Visite annuelle du centre', tab.actions.diligence);
    const dialog = await screen.findByRole('dialog', {
      name: dialogs.diligence.title('Visite annuelle du centre'),
    });

    await user.selectOptions(
      within(dialog).getByLabelText(new RegExp(dialogs.status)),
      'in_progress',
    );
    await user.click(within(dialog).getByRole('button', { name: dialogs.diligence.submit }));
    expect(await screen.findByText(dialogs.diligence.done)).toBeVisible();
    expect(state(demoInstanceIds.visit)?.status).toBe('in_progress');

    await user.click(screen.getByRole('button', { name: tab.otherAuthority }));
    const other = await screen.findByRole('dialog', { name: dialogs.other.title });

    await user.click(within(other).getByRole('button', { name: dialogs.other.submit }));
    expect(within(other).getAllByText(dialogs.required)).toHaveLength(2);
    expect(within(other).getByText(dialogs.invalidAmount)).toBeVisible();
    await user.type(
      within(other).getByLabelText(new RegExp(dialogs.other.authority)),
      'Mairie du Plateau',
    );
    await user.type(
      within(other).getByLabelText(new RegExp(dialogs.other.label)),
      'Taxe communale',
    );
    await user.type(
      within(other).getByLabelText(new RegExp(dialogs.amountDue.replace(/[()]/g, '.'))),
      '15000',
    );
    await user.type(within(other).getByLabelText(new RegExp(dialogs.other.dueDate)), '2026-12-31');
    await user.click(within(other).getByRole('button', { name: dialogs.other.submit }));

    expect(await screen.findByText(dialogs.other.done)).toBeVisible();
    const others = screen.getByRole('region', { name: labels.categories.other });

    expect(await within(others).findByText('Taxe communale')).toBeVisible();
  });

  it('« Gérer les obligations » : proposition confirmée, ajout du catalogue, retrait', async () => {
    const { user } = await open();
    const manage = labels.dialogs.manage;

    await user.click(screen.getByRole('button', { name: tab.manage }));
    const dialog = await screen.findByRole('dialog', { name: manage.title });
    const tee = 'Taxe d’État de l’entreprenant (TEE)';

    expect(await within(dialog).findByText(`${tee} (${manage.suggested})`)).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: manage.confirm(tee) }));
    expect(await screen.findByText(manage.confirmed)).toBeVisible();
    await waitFor(() => {
      expect(within(dialog).getByText(tee)).toBeVisible();
    });

    await user.click(within(dialog).getByRole('button', { name: labels.proposed.add }));
    const catalog = await screen.findByRole('dialog', { name: labels.catalog.title });

    await user.click(
      within(catalog).getByRole('button', { name: labels.catalog.choose('Patente') }),
    );
    expect(await screen.findByText(manage.added)).toBeVisible();
    await user.click(await within(dialog).findByRole('button', { name: manage.remove('Patente') }));
    expect(await screen.findByText(manage.removed)).toBeVisible();

    const statuses = Object.fromEntries(
      server.obligations.obligations(ADJOUA).map((item) => [item.type.code, item.status]),
    );

    expect(statuses).toEqual({ TEE: 'active', PAT: 'removed' });
    // « Fermer » du pied de la modale (la croix porte le même nom).
    const closers = within(dialog).getAllByRole('button', { name: fr.common.close });

    await user.click(closers[closers.length - 1]);
    expect(screen.queryByRole('dialog', { name: manage.title })).toBeNull();
  });

  it('obligation déjà attribuée : refus du serveur en bandeau', async () => {
    const { user } = await open();
    const manage = labels.dialogs.manage;

    server.failNext('POST', apiUrl(`/cga/members/${ADJOUA}/obligations`), {
      status: 409,
      data: {
        message: 'Cette obligation est déjà attribuée à ce dossier.',
        code: 'obligation_already_assigned',
      },
    });
    await user.click(screen.getByRole('button', { name: tab.manage }));
    const dialog = await screen.findByRole('dialog', { name: manage.title });

    await user.click(within(dialog).getByRole('button', { name: labels.proposed.add }));
    const catalog = await screen.findByRole('dialog', { name: labels.catalog.title });

    await user.click(
      within(catalog).getByRole('button', { name: labels.catalog.choose('Patente') }),
    );
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Cette obligation est déjà attribuée à ce dossier.',
    );
  });

  it('consultation sans le droit de gérer (formateur) : ni boutons ni actions de ligne', async () => {
    await open('0700000007', demoIds.trainer);

    expect(screen.queryByRole('button', { name: tab.manage })).toBeNull();
    expect(screen.queryByRole('button', { name: tab.otherAuthority })).toBeNull();
    expect(
      within(line('TEE — 3e trimestre 2026')).queryByRole('button', {
        name: tab.rowActions('TEE — 3e trimestre 2026'),
      }),
    ).toBeNull();
  });

  it('échec du chargement : message et « Réessayer »', async () => {
    server = installApiServer();
    server.signIn('0700000002', demoIds.manager);
    const url = apiUrl(`/cga/members/${ADJOUA}/obligation-instances`);

    server.failNext('GET', url, { status: 500 });
    server.failNext('GET', url, { status: 500 });
    const session = await httpAuthApi.currentSession();
    const user = userEvent.setup({ delay: null });

    renderApp({ api: httpAuthApi, session, entry: memberRoutes.detailTab(ADJOUA, 'obligations') });

    // Une lecture en échec est réessayée une fois, après un délai, avant le message.
    expect(await screen.findByText(tab.loadError, {}, { timeout: 5_000 })).toBeVisible();
    await user.click(screen.getByRole('button', { name: fr.common.retry }));
    expect(await screen.findByRole('region', { name: labels.categories.tax })).toBeVisible();
  });
});
