import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { httpAuthApi } from '@/features/auth/api/auth-api';
import { trainingRoutes } from '@/features/trainings/lib/routes';
import { formatAmount } from '@/lib/format';
import { fr } from '@/lib/i18n/fr';
import { apiUrl, demoIds, installApiServer } from '@/test/api-server';
import { demoTrainingIds } from '@/test/api-trainings';
import { renderApp } from '@/test/render-app';

/*
 * Formations (06-IMPLEMENTATION-PLAN étape 7.5, F-FOR-01 à 04, RG-FOR-01 à 06, parcours P9) :
 * `/cncga/formations` (création, publication, inscrits, liste d'attente, présence, clôture, annulation),
 * `/cga/formations` (« Mes formations », « Formations du réseau », validation, paiement et reçu),
 * `/adherent/formations` (inscription, liste d'attente, désinscription jusqu'à J-2, évaluation,
 * attestation). Vrai client `http`, backend simulé (`api-trainings.ts`).
 */
const labels = fr.trainings;

let server: ReturnType<typeof installApiServer>;

afterEach(() => {
  server.restore();
});

const WHO = {
  president: ['0700000001', demoIds.president],
  manager: ['0700000002', demoIds.manager],
  member: ['0700000012', demoIds.memberOwner],
} as const;

async function open(entry: string, who: keyof typeof WHO = 'president') {
  server = installApiServer();
  server.signIn(WHO[who][0], WHO[who][1]);

  const session = await httpAuthApi.currentSession();
  const user = userEvent.setup({ delay: null });
  const view = renderApp({ api: httpAuthApi, session, entry });

  return { user, ...view };
}

async function trainingLinks(): Promise<HTMLElement[]> {
  const list = await screen.findByRole('list', { name: labels.list.caption });

  return within(list).getAllByRole('link');
}

/** Champ par son libellé exact, suivi ou non de l'astérisque d'un champ obligatoire. */
function field(label: string): HTMLElement {
  return screen.getByLabelText(new RegExp(`^${label.replace(/[()]/g, '\\$&')}(\\s\\*)?$`));
}

describe('/cncga/formations (7.5)', { timeout: 30_000 }, () => {
  it('F-FOR-01 · formations à venir et passées, places et liste d’attente', async () => {
    const { user } = await open(trainingRoutes.list('network'));

    expect(
      await screen.findByRole('heading', { level: 1, name: labels.networkTitle }),
    ).toBeVisible();
    const upcoming = await trainingLinks();

    expect(upcoming).toHaveLength(3);
    expect(upcoming[0]).toHaveTextContent('Annexe fiscale 2030 : les nouveautés');
    expect(upcoming[0]).toHaveTextContent(labels.list.seats('2', '2'));
    expect(upcoming[1]).toHaveTextContent('Brouillon');

    await user.click(screen.getByRole('button', { name: labels.tabs.past }));
    await waitFor(async () => {
      expect(await trainingLinks()).toHaveLength(1);
    });
    expect((await trainingLinks())[0]).toHaveTextContent('Clôture des comptes 2025');
  });

  it('F-FOR-01 · créer et publier ; champs obligatoires ; erreur du serveur ; brouillon', async () => {
    const { user, router } = await open(trainingRoutes.list('network'));

    await user.click(await screen.findByRole('button', { name: labels.create.action }));
    expect(router.state.location.pathname).toBe(trainingRoutes.create('network'));
    const form = await screen.findByRole('form', { name: labels.create.title });

    await user.click(within(form).getByRole('button', { name: labels.create.publish }));
    expect(within(form).getAllByText(fr.members.create.errors.required)).toHaveLength(3);
    expect(within(form).getByText(labels.create.errors.audiences)).toBeVisible();

    await user.type(field(labels.create.fields.title), 'Déclaration de la TEE');
    fireEvent.change(field(labels.create.fields.startsAt), {
      target: { value: '2030-09-01T09:00' },
    });
    fireEvent.change(field(labels.create.fields.endsAt), { target: { value: '2030-09-01T08:00' } });
    await user.click(screen.getByRole('checkbox', { name: labels.audiences.cga_staff }));
    await user.click(screen.getByRole('checkbox', { name: labels.regime('TEE') }));
    await user.click(within(form).getByRole('button', { name: labels.create.publish }));
    expect(within(form).getByText(labels.create.errors.ends)).toBeVisible();

    fireEvent.change(field(labels.create.fields.endsAt), { target: { value: '2030-09-01T12:00' } });
    await user.type(field(labels.create.fields.onlineUrl), 'http://visio.test');
    await user.click(within(form).getByRole('button', { name: labels.create.publish }));
    expect(
      await within(form).findByText('Le champ lien en ligne doit être une URL valide.'),
    ).toBeVisible();

    await user.clear(field(labels.create.fields.onlineUrl));
    await user.type(field(labels.create.fields.capacity), '30');
    await user.click(screen.getByRole('checkbox', { name: labels.regime('TEE') }));
    await user.click(within(form).getByRole('button', { name: labels.create.publish }));

    expect(await screen.findByText(labels.create.published('12'))).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Déclaration de la TEE' }),
    ).toBeVisible();
    const created = server.trainings.trainings()[0];

    expect(created.status).toBe('published');
    expect(created.capacity).toBe(30);
    expect(created.audiences).toEqual([{ type: 'cga_staff', regime: null }]);

    await user.click(screen.getByRole('link', { name: labels.create.back }));
    await user.click(await screen.findByRole('button', { name: labels.create.action }));
    await user.type(
      await screen.findByLabelText(new RegExp(`^${labels.create.fields.title}`)),
      'Brouillon de séminaire',
    );
    fireEvent.change(field(labels.create.fields.startsAt), {
      target: { value: '2030-10-01T09:00' },
    });
    fireEvent.change(field(labels.create.fields.endsAt), { target: { value: '2030-10-01T12:00' } });
    await user.click(screen.getByRole('checkbox', { name: labels.audiences.cga_managers }));
    await user.click(screen.getByRole('button', { name: labels.create.draft }));
    expect(await screen.findByText(labels.create.drafted)).toBeInTheDocument();
    expect(server.trainings.trainings()[0].status).toBe('draft');
  });

  it('RG-FOR-03 · inscrire des agents : au-delà des places, liste d’attente avec position', async () => {
    const { user } = await open(trainingRoutes.detail('network', demoTrainingIds.fiscal));

    expect(await screen.findByText(labels.detail.seatsValue('2', '2', '0'))).toBeVisible();
    await user.click(screen.getByRole('tab', { name: labels.tabs.registered }));
    const registered = within(await screen.findByRole('table', { name: labels.tabs.registered }));

    expect(registered.getByText('Awa Koné')).toBeVisible();
    expect(registered.getByText('Yao Kouadio')).toBeVisible();

    await user.click(screen.getByRole('button', { name: labels.register.action }));
    const dialog = await screen.findByRole('dialog', { name: labels.register.title });
    const people = await within(dialog).findByRole('list', { name: labels.register.caption });

    expect(within(people).getByRole('checkbox', { name: /Awa Koné/ })).toBeDisabled();
    expect(within(people).queryByText(/Adjoua Brou/)).toBeNull();

    await user.click(within(dialog).getByRole('button', { name: labels.register.submit }));
    expect(within(dialog).getByText(labels.register.none)).toBeVisible();

    await user.type(within(dialog).getByLabelText(labels.register.search), 'Marc');
    await waitFor(() => {
      expect(within(dialog).queryByText('Awa Koné')).toBeNull();
    });
    await user.click(await within(dialog).findByRole('checkbox', { name: /Marc Ehui/ }));
    await user.click(within(dialog).getByRole('button', { name: labels.register.submit }));

    expect(await screen.findByText(labels.register.done('1', '1'))).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: labels.tabs.waitlist }));
    const waitlist = within(await screen.findByRole('table', { name: labels.tabs.waitlist }));

    expect(waitlist.getByText('Marc Ehui')).toBeVisible();
    expect(waitlist.getByText(labels.registrations.rank('1'))).toBeVisible();
  });

  it('F-FOR-04 · présence, clôture refusée tant qu’un inscrit n’est pas émargé, attestations', async () => {
    const { user } = await open(
      `${trainingRoutes.detail('network', demoTrainingIds.closing)}?onglet=presence`,
    );

    const sheet = await screen.findByRole('list', { name: labels.attendance.caption });

    await user.click(screen.getByRole('button', { name: labels.attendance.complete }));
    let dialog = await screen.findByRole('dialog', { name: labels.attendance.completeTitle });

    await user.click(within(dialog).getByRole('button', { name: labels.attendance.complete }));
    expect(
      await within(dialog).findByText(
        'Émargez chaque inscrit avant de clôturer la session (2 restant(s)).',
      ),
    ).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: fr.common.cancel }));

    const awa = within(
      within(sheet).getByRole('group', { name: labels.attendance.mark('Awa Koné') }),
    );
    const yao = within(
      within(sheet).getByRole('group', { name: labels.attendance.mark('Yao Kouadio') }),
    );

    await user.click(awa.getByRole('radio', { name: labels.attendance.present }));
    await user.click(yao.getByRole('radio', { name: labels.attendance.absent }));
    await user.click(screen.getByRole('button', { name: labels.attendance.save }));
    expect(await screen.findByText(labels.attendance.saved('2'))).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: labels.attendance.complete }));
    dialog = await screen.findByRole('dialog', { name: labels.attendance.completeTitle });
    await user.click(within(dialog).getByRole('button', { name: labels.attendance.complete }));
    expect(await screen.findByText(labels.attendance.completed('1'))).toBeInTheDocument();
    expect(await screen.findByText(labels.detail.completed)).toBeVisible();
  });

  it('annuler la formation (motif obligatoire) ; publier un brouillon et le modifier', async () => {
    const { user, router } = await open(trainingRoutes.detail('network', demoTrainingIds.fiscal));

    await user.click(await screen.findByRole('button', { name: labels.cancel.action }));
    const dialog = await screen.findByRole('dialog', { name: labels.cancel.title });

    await user.click(within(dialog).getByRole('button', { name: labels.cancel.submit }));
    expect(within(dialog).getByText(fr.members.create.errors.required)).toBeVisible();
    await user.type(
      within(dialog).getByLabelText(new RegExp(labels.cancel.reason)),
      'Formateur indisponible',
    );
    await user.click(within(dialog).getByRole('button', { name: labels.cancel.submit }));
    expect(await screen.findByText(labels.cancel.done)).toBeInTheDocument();
    expect(
      await screen.findByText(labels.detail.cancelled('Formateur indisponible')),
    ).toBeVisible();

    await router.navigate(trainingRoutes.detail('network', demoTrainingIds.draft));
    await user.click(await screen.findByRole('button', { name: labels.detail.publish }));
    expect(await screen.findByText(labels.detail.published('12'))).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: labels.detail.edit }));
    const form = await screen.findByRole('form', { name: labels.create.editTitle });
    const title = within(form).getByLabelText(new RegExp(`^${labels.create.fields.title}`));

    expect(title).toHaveValue('Sécurité sociale des dirigeants');
    expect(
      within(form).getByLabelText(new RegExp(`^${labels.create.fields.startsAt}`)),
    ).toHaveValue('2030-06-01T09:00');
    await user.clear(title);
    await user.type(title, 'Sécurité sociale : CNPS et CMU');
    await user.click(within(form).getByRole('button', { name: labels.create.save }));
    expect(await screen.findByText(labels.create.saved)).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sécurité sociale : CNPS et CMU' }),
    ).toBeVisible();
  });

  it('pannes : liste et fiche affichent un message avec « Réessayer »', async () => {
    server = installApiServer();
    server.signIn(...WHO.president);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      server.failNext('GET', apiUrl('/network/trainings'), {
        status: 500,
        data: { message: 'panne' },
      });
    }
    const session = await httpAuthApi.currentSession();
    const user = userEvent.setup({ delay: null });
    const { router } = renderApp({
      api: httpAuthApi,
      session,
      entry: trainingRoutes.list('network'),
    });

    expect(await screen.findByText(labels.list.loadError, {}, { timeout: 5_000 })).toBeVisible();
    await user.click(screen.getByRole('button', { name: fr.common.retry }));
    expect(await trainingLinks()).toHaveLength(3);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      server.failNext('GET', apiUrl(`/network/trainings/${demoTrainingIds.fiscal}`), {
        status: 500,
        data: { message: 'panne' },
      });
    }
    await router.navigate(trainingRoutes.detail('network', demoTrainingIds.fiscal));
    expect(await screen.findByText(labels.detail.loadError, {}, { timeout: 5_000 })).toBeVisible();
    await user.click(screen.getByRole('button', { name: fr.common.retry }));
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Annexe fiscale 2030 : les nouveautés',
      }),
    ).toBeVisible();
  });
});

describe('/cga/formations (7.5)', { timeout: 30_000 }, () => {
  it('RG-FOR-01 · « Mes formations » et « Formations du réseau » (sans les brouillons du CNCGA)', async () => {
    const { user, router } = await open(trainingRoutes.list('cga'), 'manager');

    const mine = await trainingLinks();

    expect(mine).toHaveLength(1);
    expect(mine[0]).toHaveTextContent('Tenue de caisse au régime TEE');
    expect(mine[0]).toHaveTextContent(labels.list.pending('1'));

    await user.click(screen.getByRole('tab', { name: labels.tabs.network }));
    expect(router.state.location.search).toBe('?onglet=reseau');
    const panel = within(screen.getByRole('tabpanel', { name: labels.tabs.network }));
    const network = await panel.findAllByRole('link');

    expect(network).toHaveLength(2);
    expect(network[0]).toHaveTextContent(labels.list.organizer('Collectif National'));
    expect(panel.queryByText('Sécurité sociale des dirigeants')).toBeNull();
  });

  it('RG-FOR-05 et RG-FOR-06 · valider, refuser, enregistrer le paiement et le reçu', async () => {
    const { user } = await open(
      `${trainingRoutes.detail('cga', demoTrainingIds.cash)}?onglet=inscrits`,
      'manager',
    );

    const table = within(await screen.findByRole('table', { name: labels.tabs.registered }));

    expect(table.getByText(/BOULANGERIE ADJOUA/)).toBeVisible();
    await user.click(
      table.getByRole('button', { name: labels.registrations.actions('Ibrahim Koné') }),
    );
    await user.click(screen.getByRole('menuitem', { name: labels.payment.action }));
    const payment = await screen.findByRole('dialog', { name: labels.payment.title });

    // Montant formaté avec des espaces insécables : comparé après normalisation des blancs.
    expect(
      within(payment)
        .getByText(/hors plateforme/)
        .textContent?.replace(/\s/g, ' '),
    ).toBe(labels.payment.description(formatAmount(15000)).replace(/\s/g, ' '));
    await user.selectOptions(
      within(payment).getByLabelText(new RegExp(labels.payment.method)),
      'mobile_money',
    );
    await user.type(within(payment).getByLabelText(labels.payment.reference), 'OM-4521');
    await user.click(within(payment).getByRole('button', { name: labels.payment.submit }));
    expect(await screen.findByText(labels.payment.done('REC-DCK-2030-00001'))).toBeInTheDocument();
    expect(
      await screen.findByRole('link', {
        name: `${labels.registrations.receipt} REC-DCK-2030-00001`,
      }),
    ).toHaveAttribute('href', '/fichiers/recus/REC-DCK-2030-00001.pdf');

    await user.click(
      table.getByRole('button', { name: labels.registrations.actions('Adjoua Brou') }),
    );
    await user.click(screen.getByRole('menuitem', { name: labels.registrations.reject }));
    const reject = await screen.findByRole('dialog', { name: labels.reject.title });

    await user.type(within(reject).getByLabelText(labels.reject.reason), 'Régime RME');
    await user.click(within(reject).getByRole('button', { name: labels.reject.submit }));
    expect(await screen.findByText(labels.reject.done)).toBeInTheDocument();
    expect(await screen.findByText('Régime RME')).toBeVisible();

    const adjoua = server.trainings
      .registrations()
      .find((item) => item.trainingId === demoTrainingIds.cash && item.personId === 'adjoua');

    expect(adjoua?.status).toBe('rejected');
  });

  it('RG-FOR-05 · valider une inscription en attente', async () => {
    const { user } = await open(
      `${trainingRoutes.detail('cga', demoTrainingIds.cash)}?onglet=inscrits`,
      'manager',
    );

    const table = within(await screen.findByRole('table', { name: labels.tabs.registered }));

    await user.click(
      table.getByRole('button', { name: labels.registrations.actions('Adjoua Brou') }),
    );
    await user.click(screen.getByRole('menuitem', { name: labels.registrations.approve }));
    expect(await screen.findByText(labels.registrations.approved)).toBeInTheDocument();
    await waitFor(() => {
      expect(table.queryByText(fr.status.trainingRegistration.pending_approval)).toBeNull();
    });
  });

  it('F-FOR-04 · évaluations agrégées d’une session terminée', async () => {
    const { user } = await open(trainingRoutes.detail('cga', demoTrainingIds.workshop), 'manager');

    await user.click(await screen.findByRole('tab', { name: labels.tabs.evaluations }));
    const panel = within(await screen.findByRole('tabpanel', { name: labels.tabs.evaluations }));

    const average = await panel.findByText(labels.evaluations.average);

    expect(average.nextSibling).toHaveTextContent(labels.evaluations.averageValue('4'));
    expect(panel.getByText('Très concret.')).toBeVisible();

    await user.click(screen.getByRole('tab', { name: labels.tabs.attendance }));
    expect(await screen.findByText(labels.detail.completed)).toBeVisible();
    expect(screen.queryByRole('button', { name: labels.detail.edit })).toBeNull();

    await user.click(screen.getByRole('tab', { name: labels.tabs.waitlist }));
    expect(await screen.findByText(labels.registrations.empty)).toBeVisible();
  });

  it('RG-FOR-03 et RG-FOR-04 · formation du réseau : inscrire ses agents et adhérents, désinscrire, promotion', async () => {
    const { user } = await open(trainingRoutes.network(demoTrainingIds.fiscal), 'manager');

    const table = within(await screen.findByRole('table', { name: labels.registrations.caption }));

    expect(table.getByText('Awa Koné')).toBeVisible();
    expect(table.queryByText('Yao Kouadio')).toBeNull();

    await user.click(screen.getByRole('button', { name: labels.register.networkAction }));
    const dialog = await screen.findByRole('dialog', { name: labels.register.networkAction });
    const people = await within(dialog).findByRole('list', { name: labels.register.caption });

    expect(within(people).getByText(/BOULANGERIE ADJOUA/)).toBeVisible();
    await user.click(within(people).getByRole('checkbox', { name: /Adjoua Brou/ }));
    await user.click(within(dialog).getByRole('button', { name: labels.register.submit }));
    expect(await screen.findByText(labels.register.done('1', '1'))).toBeInTheDocument();

    await user.click(
      await table.findByRole('button', { name: labels.registrations.actions('Awa Koné') }),
    );
    await user.click(screen.getByRole('menuitem', { name: labels.registrations.cancel }));
    expect(await screen.findByText(labels.registrations.cancelled)).toBeInTheDocument();

    const adjoua = server.trainings
      .registrations()
      .find((item) => item.trainingId === demoTrainingIds.fiscal && item.personId === 'adjoua');

    expect(adjoua?.status).toBe('registered');
  });

  it('RG-FOR-01 · le centre crée une formation payante pour ses adhérents ; « Annuler » ; conflit (409)', async () => {
    const { user, router } = await open(trainingRoutes.create('cga'), 'manager');

    const form = await screen.findByRole('form', { name: labels.create.title });

    await user.click(within(form).getByRole('button', { name: fr.common.cancel }));
    expect(router.state.location.pathname).toBe(trainingRoutes.list('cga'));

    await router.navigate(trainingRoutes.create('cga'));
    await screen.findByRole('form', { name: labels.create.title });
    await user.type(field(labels.create.fields.title), 'Atelier bilan simplifié');
    await user.type(field(labels.create.fields.description), 'Pas à pas sur le bilan.');
    fireEvent.change(field(labels.create.fields.startsAt), {
      target: { value: '2030-11-05T09:00' },
    });
    fireEvent.change(field(labels.create.fields.endsAt), { target: { value: '2030-11-05T12:00' } });
    await user.selectOptions(field(labels.create.fields.format), 'workshop');
    await user.type(field(labels.create.fields.trainer), 'Awa Koné');
    await user.type(field(labels.create.fields.location), 'Siège du CGA');
    await user.clear(field(labels.create.fields.price));
    await user.type(field(labels.create.fields.price), '5000');
    await user.click(screen.getByRole('checkbox', { name: labels.create.fields.approval }));
    await user.click(screen.getByRole('checkbox', { name: labels.audiences.all_members }));
    await user.click(screen.getByRole('button', { name: labels.create.publish }));

    expect(await screen.findByText(labels.create.published('12'))).toBeInTheDocument();
    const created = server.trainings.trainings()[0];

    expect(created).toMatchObject({
      organizationId: '01cga000000000000000000001',
      description: 'Pas à pas sur le bilan.',
      format: 'workshop',
      trainer: 'Awa Koné',
      location: 'Siège du CGA',
      price: 5000,
      requires_approval: true,
      audiences: [{ type: 'all_members', regime: null }],
    });

    await user.click(await screen.findByRole('button', { name: labels.detail.edit }));
    const edit = await screen.findByRole('form', { name: labels.create.editTitle });

    expect(
      within(edit).getByRole('checkbox', { name: labels.create.fields.approval }),
    ).toBeChecked();
    server.failNext('PUT', apiUrl(`/cga/trainings/${created.id}`), {
      status: 409,
      data: {
        message: 'Une formation commencée, terminée ou annulée ne se modifie plus.',
        code: 'training_locked',
      },
    });
    await user.click(within(edit).getByRole('button', { name: labels.create.save }));
    expect(
      await within(edit).findByText(
        'Une formation commencée, terminée ou annulée ne se modifie plus.',
      ),
    ).toBeVisible();
  });

  it('formation du réseau : pannes de lecture, désinscription refusée par le serveur', async () => {
    server = installApiServer();
    server.signIn(...WHO.manager);
    const path = `/cga/network-trainings/${demoTrainingIds.fiscal}`;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      server.failNext('GET', apiUrl(path), { status: 500, data: { message: 'panne' } });
      server.failNext('GET', apiUrl(`${path}/registrations`), {
        status: 500,
        data: { message: 'panne' },
      });
    }
    const session = await httpAuthApi.currentSession();
    const user = userEvent.setup({ delay: null });

    renderApp({ api: httpAuthApi, session, entry: trainingRoutes.network(demoTrainingIds.fiscal) });
    expect(await screen.findByText(labels.detail.loadError, {}, { timeout: 5_000 })).toBeVisible();
    await user.click(screen.getByRole('button', { name: fr.common.retry }));
    expect(
      await screen.findByText(labels.registrations.loadError, {}, { timeout: 5_000 }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: fr.common.retry }));

    const table = within(await screen.findByRole('table', { name: labels.registrations.caption }));

    const awa = server.trainings
      .registrations()
      .find((item) => item.trainingId === demoTrainingIds.fiscal && item.personId === 'awa');

    server.failNext('POST', apiUrl(`/cga/training-registrations/${awa?.id ?? ''}/cancel`), {
      status: 409,
      data: {
        message: 'La désinscription n’est plus possible à moins de 2 jours de la session.',
        code: 'training_cancellation_closed',
      },
    });
    await user.click(table.getByRole('button', { name: labels.registrations.actions('Awa Koné') }));
    await user.click(screen.getByRole('menuitem', { name: labels.registrations.cancel }));
    expect(
      await screen.findByText(
        'La désinscription n’est plus possible à moins de 2 jours de la session.',
      ),
    ).toBeInTheDocument();
  });
});

describe('/adherent/formations (7.5)', { timeout: 30_000 }, () => {
  it('F-FOR-02 · formations ouvertes, récapitulatif, liste d’attente avec position (P9)', async () => {
    const { user } = await open(trainingRoutes.member, 'member');

    const list = within(await screen.findByRole('list', { name: labels.member.open }));

    expect(list.getByText('Tenue de caisse au régime TEE')).toBeVisible();
    expect(list.getAllByText(labels.member.already)).not.toHaveLength(0);

    await user.click(list.getByRole('button', { name: labels.member.register }));
    const dialog = await screen.findByRole('dialog', { name: labels.member.registerTitle });

    expect(within(dialog).getByText('https://visio.cncga.test/fne')).toBeVisible();
    expect(within(dialog).getByText(labels.detail.free)).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: labels.member.confirm }));
    expect(await screen.findByText(labels.member.waitlisted('1'))).toBeInTheDocument();
  });

  it('F-FOR-04 · évaluer une session suivie et télécharger l’attestation', async () => {
    const { user } = await open(trainingRoutes.member, 'member');

    const mine = within(await screen.findByRole('list', { name: labels.member.mine }));

    expect(mine.getByRole('link', { name: labels.member.certificate })).toHaveAttribute(
      'href',
      expect.stringContaining('/fichiers/attestations/'),
    );
    await user.click(mine.getByRole('button', { name: labels.member.evaluate }));
    const dialog = await screen.findByRole('dialog', { name: labels.member.evaluateTitle });

    await user.click(within(dialog).getByRole('button', { name: labels.member.evaluate }));
    expect(within(dialog).getByText(fr.members.create.errors.required)).toBeVisible();
    await user.click(within(dialog).getByRole('radio', { name: labels.member.scoreValue('5') }));
    await user.type(within(dialog).getByLabelText(labels.member.comment), 'Utile.');
    await user.click(within(dialog).getByRole('button', { name: labels.member.evaluate }));
    expect(await screen.findByText(labels.member.evaluated)).toBeInTheDocument();
    expect(await screen.findByText(labels.member.yourScore('5'))).toBeVisible();
  });

  it('RG-FOR-04 · se désinscrire ; refus à moins de 2 jours de la session', async () => {
    server = installApiServer();
    const cash = server.trainings.trainings().find((item) => item.id === demoTrainingIds.cash);
    const fne = server.trainings.trainings().find((item) => item.id === demoTrainingIds.fne);

    if (cash === undefined || fne === undefined) {
      throw new Error('formations de démonstration manquantes');
    }
    server.signIn(...WHO.member);
    const session = await httpAuthApi.currentSession();
    const user = userEvent.setup({ delay: null });

    renderApp({ api: httpAuthApi, session, entry: trainingRoutes.member });
    let mine = within(await screen.findByRole('list', { name: labels.member.mine }));

    await user.click(mine.getByRole('button', { name: labels.member.cancel }));
    let dialog = await screen.findByRole('dialog', { name: labels.member.cancelTitle });

    cash.starts_at = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    await user.click(within(dialog).getByRole('button', { name: labels.member.cancel }));
    expect(
      await within(dialog).findByText(
        'La désinscription n’est plus possible à moins de 2 jours de la session.',
      ),
    ).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: fr.common.cancel }));

    cash.starts_at = '2030-03-12T14:00:00+00:00';
    mine = within(await screen.findByRole('list', { name: labels.member.mine }));
    await user.click(mine.getByRole('button', { name: labels.member.cancel }));
    dialog = await screen.findByRole('dialog', { name: labels.member.cancelTitle });
    await user.click(within(dialog).getByRole('button', { name: labels.member.cancel }));
    expect(await screen.findByText(labels.member.cancelled)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: labels.member.cancel })).toBeNull();
    });
  });
});
