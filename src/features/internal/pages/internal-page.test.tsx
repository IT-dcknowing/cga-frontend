import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { httpAuthApi } from '@/features/auth/api/auth-api';
import { fr } from '@/lib/i18n/fr';
import { demoCenterObligationIds } from '@/test/api-planning';
import { apiUrl, demoIds, installApiServer } from '@/test/api-server';
import { renderApp } from '@/test/render-app';

/*
 * `/cga/gestion-interne`, onglet « Obligations du centre » (06-IMPLEMENTATION-PLAN étape 4.7,
 * F-OBL-07) : liste, ajout, statut modifiable ; réservé au droit internal.manage. Vrai client
 * `http`, backend simulé (`api-planning.ts`).
 */
const labels = fr.obligations.center;
const form = labels.form;

let server: ReturnType<typeof installApiServer>;

afterEach(() => {
  server.restore();
});

async function open(phone = '0700000002', membership: string = demoIds.manager) {
  server = installApiServer();
  server.signIn(phone, membership);

  const session = await httpAuthApi.currentSession();
  const user = userEvent.setup({ delay: null });
  const view = renderApp({ api: httpAuthApi, session, entry: '/cga/gestion-interne?onglet=obligations' });

  return { user, ...view };
}

describe(
  '/cga/gestion-interne · obligations du centre (4.7, F-OBL-07)',
  { timeout: 20_000 },
  () => {
    it('liste par échéance : type, montant, retard, rappel, notes, statut', async () => {
      await open();

      const list = await screen.findByRole('list', { name: labels.caption });
      const items = within(list).getAllByRole('listitem');

      expect(items.map((item) => item.querySelector('.font-semibold')?.textContent)).toEqual([
        'Renouvellement de l’agrément',
        'CNPS du centre — octobre 2026',
      ]);
      expect(within(items[0]).getByText(labels.overdue, { exact: false })).toBeVisible();
      expect(within(items[0]).getByText(labels.reminder('17/10/2026'))).toBeVisible();
      expect(within(items[0]).getByText('Dossier à déposer à la DGI.')).toBeVisible();
      expect(within(items[1]).getByText(fr.status.obligation.to_pay)).toBeVisible();
    });

    it('ajoute une obligation : champs obligatoires, puis enregistrée', async () => {
      const { user } = await open();

      await screen.findByRole('list', { name: labels.caption });
      await user.click(screen.getByRole('button', { name: labels.add }));
      const dialog = await screen.findByRole('dialog', { name: form.createTitle });

      await user.click(within(dialog).getByRole('button', { name: form.submit }));
      expect(within(dialog).getAllByText(fr.obligations.dialogs.required)).toHaveLength(2);

      await user.type(within(dialog).getByLabelText(new RegExp(form.label)), 'SMT du centre 2025');
      await user.selectOptions(within(dialog).getByLabelText(new RegExp(form.kind)), 'smt');
      await user.type(within(dialog).getByLabelText(new RegExp(form.dueDate)), '2027-05-30');
      await user.type(
        within(dialog).getByLabelText(new RegExp(form.amount.replace(/[()]/g, '.'))),
        '25000',
      );
      await user.type(
        within(dialog).getByLabelText(new RegExp(form.notes)),
        'À déposer avec le bilan.',
      );
      await user.click(within(dialog).getByRole('button', { name: form.submit }));

      expect(await screen.findByText(form.created)).toBeVisible();
      expect(await screen.findByText('SMT du centre 2025')).toBeVisible();
      expect(
        server.planning.center().find((item) => item.label === 'SMT du centre 2025'),
      ).toMatchObject({
        kind: 'smt',
        amount: 25_000,
        status: 'todo',
        notes: 'À déposer avec le bilan.',
      });
    });

    it('modifie le statut ; refus du serveur sous le champ', async () => {
      const { user } = await open();

      await screen.findByRole('list', { name: labels.caption });
      await user.click(
        screen.getByRole('button', { name: labels.edit('CNPS du centre — octobre 2026') }),
      );
      const dialog = await screen.findByRole('dialog', {
        name: form.editTitle('CNPS du centre — octobre 2026'),
      });

      expect(
        within(dialog).getByLabelText(new RegExp(form.amount.replace(/[()]/g, '.'))),
      ).toHaveValue('180000');
      await user.clear(
        within(dialog).getByLabelText(new RegExp(form.amount.replace(/[()]/g, '.'))),
      );
      server.failNext('PUT', apiUrl(`/cga/center-obligations/${demoCenterObligationIds.cnps}`), {
        status: 422,
        data: {
          message: 'Le statut est invalide.',
          errors: { status: ['Le statut est invalide.'] },
        },
      });
      await user.click(within(dialog).getByRole('button', { name: form.submit }));
      expect(await within(dialog).findByText('Le statut est invalide.')).toBeVisible();

      await user.selectOptions(within(dialog).getByLabelText(new RegExp(form.status)), 'paid');
      await user.click(within(dialog).getByRole('button', { name: form.submit }));
      expect(await screen.findByText(form.updated)).toBeVisible();
      expect(
        server.planning.center().find((item) => item.id === demoCenterObligationIds.cnps),
      ).toMatchObject({
        status: 'paid',
        amount: null,
      });
    });

    it('sans le droit internal.manage (comptable) : « Vous n’avez pas accès »', async () => {
      await open('0700000004', demoIds.accountant);

      await waitFor(() => {
        expect(screen.queryByRole('list', { name: labels.caption })).toBeNull();
      });
      expect(
        await screen.findByRole('heading', { name: fr.errorScreens.forbiddenTitle }),
      ).toBeVisible();
    });

    it('échec du chargement : message', async () => {
      server = installApiServer();
      server.signIn('0700000002', demoIds.manager);
      server.failNext('GET', apiUrl('/cga/center-obligations'), { status: 500 });
      server.failNext('GET', apiUrl('/cga/center-obligations'), { status: 500 });
      const session = await httpAuthApi.currentSession();

      renderApp({ api: httpAuthApi, session, entry: '/cga/gestion-interne?onglet=obligations' });

      expect(await screen.findByText(labels.loadError, {}, { timeout: 5_000 })).toBeVisible();
    });
  },
);

describe('/cga/gestion-interne · fiche permanente (5.7, F-RPT-01)', { timeout: 20_000 }, () => {
  it('charge l’identité, les dirigeants, les moyens et la présentation depuis l’API', async () => {
    server = installApiServer();
    server.signIn('0700000002', demoIds.manager);
    const session = await httpAuthApi.currentSession();
    renderApp({ api: httpAuthApi, session, entry: '/cga/gestion-interne?onglet=fiche-permanente' });

    expect(await screen.findByRole('heading', { name: fr.permanentProfile.identity })).toBeVisible();
    const identity = screen.getByRole('heading', { name: fr.permanentProfile.identity }).closest('section');
    expect(within(identity as HTMLElement).getByText('DC-KNOWING CGA')).toBeVisible();
    expect(screen.getByText('Awa Koné')).toBeVisible();
    expect(screen.getByText('Matériel informatique')).toBeVisible();
    expect(screen.getByLabelText(fr.permanentProfile.history)).toHaveValue('Créé en 2004.');
    expect(server.requests.some((request) => request.url === apiUrl('/cga/permanent-profile'))).toBe(true);
  });

  it('ajoute une personne, enregistre la présentation et un moyen matériel par les routes backend', async () => {
    server = installApiServer();
    server.signIn('0700000002', demoIds.manager);
    const session = await httpAuthApi.currentSession();
    const user = userEvent.setup({ delay: null });
    renderApp({ api: httpAuthApi, session, entry: '/cga/gestion-interne?onglet=fiche-permanente' });
    await screen.findByRole('heading', { name: fr.permanentProfile.identity });

    await user.click(screen.getByRole('button', { name: fr.permanentProfile.addPerson }));
    await user.type(screen.getByLabelText(fr.permanentProfile.name, { exact: false }), 'Mariam Traoré');
    server.failNext('POST', apiUrl('/cga/permanent-profile/people'), {
      status: 422,
      data: { message: 'Le nom doit être vérifié.', errors: { full_name: ['Le nom doit être vérifié.'] } },
    });
    await user.click(screen.getAllByRole('button', { name: fr.permanentProfile.save })[0]);
    expect(await screen.findByText('Le nom doit être vérifié.')).toBeVisible();
    await user.click(screen.getAllByRole('button', { name: fr.permanentProfile.save })[0]);
    expect(await screen.findByText('Mariam Traoré')).toBeVisible();
    expect(server.permanentProfile.profile().people.some((person) => person.full_name === 'Mariam Traoré')).toBe(true);

    await user.click(screen.getByRole('button', { name: fr.permanentProfile.addPerson }));
    await user.click(screen.getByRole('button', { name: fr.common.cancel }));
    expect(screen.queryByLabelText(fr.permanentProfile.name, { exact: false })).toBeNull();

    const history = screen.getByLabelText(fr.permanentProfile.history);
    await user.clear(history);
    await user.type(history, 'Centre créé en 2004 et agréé en 2020.');
    const presentation = screen.getByRole('heading', { name: fr.permanentProfile.presentation }).closest('section');
    expect(presentation).not.toBeNull();
    await user.click(within(presentation as HTMLElement).getByRole('button', { name: fr.permanentProfile.save }));
    await waitFor(() => expect(server.permanentProfile.profile().presentation.history_text).toBe('Centre créé en 2004 et agréé en 2020.'));
    const revenue = screen.getByLabelText(fr.permanentProfile.revenue);
    await user.clear(revenue);
    await user.type(revenue, '52000000');

    const resourceForm = screen.getByText('Matériel informatique').closest('form');
    expect(resourceForm).not.toBeNull();
    const quantity = within(resourceForm as HTMLElement).getByLabelText(fr.permanentProfile.quantity);
    await user.clear(quantity);
    await user.type(quantity, '8');
    const description = within(resourceForm as HTMLElement).getByLabelText(fr.permanentProfile.description);
    await user.clear(description);
    await user.type(description, 'Parc renouvelé');
    const need = within(resourceForm as HTMLElement).getByLabelText(fr.permanentProfile.need);
    await user.clear(need);
    await user.type(need, 'Deux ordinateurs supplémentaires');
    server.failNext('PUT', apiUrl('/cga/permanent-profile/resources/computers'), { status: 500 });
    await user.click(within(resourceForm as HTMLElement).getByRole('button', { name: fr.permanentProfile.save }));
    await waitFor(() => expect(server.requests.filter((request) => request.url === apiUrl('/cga/permanent-profile/resources/computers'))).toHaveLength(1));
    await user.click(within(resourceForm as HTMLElement).getByRole('button', { name: fr.permanentProfile.save }));
    await waitFor(() => expect(server.permanentProfile.profile().resources.find((resource) => resource.category === 'computers')?.entry).toMatchObject({ quantity: 8, description: 'Parc renouvelé', need: 'Deux ordinateurs supplémentaires' }));
    expect(server.requests.some((request) => request.method === 'POST' && request.url === apiUrl('/cga/permanent-profile/people'))).toBe(true);
    expect(server.requests.some((request) => request.method === 'PUT' && request.url === apiUrl('/cga/permanent-profile/presentation'))).toBe(true);
  });

  it('modifie une personne existante et conserve les valeurs si la présentation est refusée', async () => {
    server = installApiServer();
    server.signIn('0700000002', demoIds.manager);
    const session = await httpAuthApi.currentSession();
    const user = userEvent.setup({ delay: null });
    renderApp({ api: httpAuthApi, session, entry: '/cga/gestion-interne?onglet=fiche-permanente' });
    await screen.findByText('Awa Koné');

    await user.click(screen.getByRole('button', { name: fr.permanentProfile.edit }));
    const name = screen.getByLabelText(fr.permanentProfile.name, { exact: false });
    await user.clear(name);
    await user.type(name, 'Awa Koné Kouassi');
    await user.selectOptions(screen.getByLabelText(fr.permanentProfile.kind), 'occasional');
    await user.clear(screen.getByLabelText(fr.permanentProfile.nationality));
    await user.type(screen.getByLabelText(fr.permanentProfile.nationality), 'Ivoirienne');
    await user.type(screen.getByLabelText(fr.permanentProfile.profession), 'Comptable');
    await user.type(screen.getByLabelText(fr.permanentProfile.diplomas), 'DESCOGEF');
    await user.type(screen.getByLabelText(fr.permanentProfile.function), 'Directrice');
    await user.type(screen.getByLabelText(fr.permanentProfile.startDate), '2021-01-15');
    await user.type(screen.getByLabelText(fr.permanentProfile.practiceStructure), 'Cabinet ABC');
    await user.type(screen.getByLabelText(fr.permanentProfile.practiceFunction), 'Auditrice');
    await user.clear(screen.getByLabelText(fr.permanentProfile.practiceYears));
    await user.type(screen.getByLabelText(fr.permanentProfile.practiceYears), '9');
    await user.click(screen.getByLabelText(fr.permanentProfile.cnps));
    await user.click(screen.getByLabelText(fr.permanentProfile.active));
    expect(screen.getByLabelText(fr.permanentProfile.active)).not.toBeChecked();
    await user.type(await screen.findByLabelText(fr.permanentProfile.endDate, { exact: false }), '2026-01-31');
    const peopleCard = screen.getByRole('heading', { name: fr.permanentProfile.people }).closest('section');
    expect(peopleCard).not.toBeNull();
    await user.click(within(peopleCard as HTMLElement).getByRole('button', { name: fr.permanentProfile.save }));
    expect(await screen.findByText('Awa Koné Kouassi')).toBeVisible();
    expect(server.permanentProfile.profile().people[0]).toMatchObject({ kind: 'occasional', practice_years: 9, cnps_declared: false, active: false, end_date: '2026-01-31' });
    expect(server.requests.some((request) => request.method === 'PUT' && request.url.includes('/cga/permanent-profile/people/'))).toBe(true);

    const previous = server.permanentProfile.profile().presentation.history_text;
    server.failNext('PUT', apiUrl('/cga/permanent-profile/presentation'), { status: 500 });
    const history = screen.getByLabelText(fr.permanentProfile.history);
    await user.clear(history);
    await user.type(history, 'Modification temporaire');
    const presentation = screen.getByRole('heading', { name: fr.permanentProfile.presentation }).closest('section');
    expect(presentation).not.toBeNull();
    await user.click(within(presentation as HTMLElement).getByRole('button', { name: fr.permanentProfile.save }));
    await waitFor(() => expect(server.permanentProfile.profile().presentation.history_text).toBe(previous));
  });

  it('affiche l’erreur de chargement quand le backend échoue', async () => {
    server = installApiServer();
    server.signIn('0700000002', demoIds.manager);
    server.failNext('GET', apiUrl('/cga/permanent-profile'), { status: 500 });
    server.failNext('GET', apiUrl('/cga/permanent-profile'), { status: 500 });
    const session = await httpAuthApi.currentSession();
    renderApp({ api: httpAuthApi, session, entry: '/cga/gestion-interne?onglet=fiche-permanente' });
    expect(await screen.findByText(fr.permanentProfile.loadError, {}, { timeout: 5_000 })).toBeVisible();
  });
});
