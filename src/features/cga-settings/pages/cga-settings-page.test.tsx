import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { httpAuthApi } from '@/features/auth/api/auth-api';
import { cgaSettingsRoutes } from '@/features/cga-settings/lib/routes';
import { fr } from '@/lib/i18n/fr';
import { apiUrl, demoIds, installApiServer } from '@/test/api-server';
import { fieldByLabel } from '@/test/fields';
import { renderApp } from '@/test/render-app';

/*
 * `/cga/parametres`, onglet « Apporteurs d'affaires » (06-IMPLEMENTATION-PLAN étape 2.16, RG-PTF-06) :
 * liste « Accessoire n », ajout, modification, suppression d'un apporteur jamais rattaché ; onglets
 * selon les droits de `/me`. Vrai client `http`, backend simulé.
 */
const labels = fr.cgaSettings.referrers;
const dialog = labels.dialog;
const SETTINGS = cgaSettingsRoutes.root;

let server: ReturnType<typeof installApiServer>;

afterEach(() => {
  server.restore();
});

const accesses = {
  gerant: ['0700000002', demoIds.manager],
  expert: ['0700000003', demoIds.multiDck],
} as const;

async function openSettings(
  who: keyof typeof accesses = 'gerant',
  entry = `${SETTINGS}?onglet=apporteurs`,
) {
  server = installApiServer();

  const [phone, membershipId] = accesses[who];

  server.signIn(phone, membershipId);

  const session = await httpAuthApi.currentSession();
  const user = userEvent.setup({ delay: null });
  const view = renderApp({ api: httpAuthApi, session, entry });

  return { user, ...view };
}

function list() {
  return screen.findByRole('list', { name: labels.caption });
}

function writes(method: string) {
  return server.requests.filter(
    (request) => request.method === method && request.url.includes('/cga/referrers'),
  );
}

describe('/cga/parametres · Apporteurs d’affaires (2.16, RG-PTF-06)', () => {
  it('onglets selon les droits ; la liste « Accessoire n » : contact, conditions, dossiers rattachés', async () => {
    const { user, router } = await openSettings('gerant', SETTINGS);

    expect(await screen.findByRole('heading', { level: 1, name: fr.nav.settings })).toBeVisible();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(
      Object.values(fr.cgaSettings.tabs),
    );
    // L'onglet Centre s'ouvre d'abord ; un onglet d'une étape suivante reste « Bientôt disponible ».
    expect(await screen.findByText(fr.cgaSettings.centre.complete('05/01/2026'))).toBeVisible();
    await user.click(screen.getByRole('tab', { name: fr.cgaSettings.tabs.regles }));
    expect(screen.getByText(fr.common.comingSoon)).toBeVisible();

    await user.click(screen.getByRole('tab', { name: fr.cgaSettings.tabs.apporteurs }));

    expect(router.state.location.search).toBe('?onglet=apporteurs');

    const items = within(await list()).getAllByRole('listitem');

    expect(within(items[0]).getByText('Accessoire 1')).toBeVisible();
    expect(within(items[0]).getByText('Kossonou Apporteur')).toBeVisible();
    expect(within(items[0]).getByText('10 % des honoraires de la première année')).toBeVisible();
    expect(within(items[0]).getByText(labels.members('1'))).toBeVisible();
    // Rattaché à un dossier : il ne se supprime pas (DeleteReferrer).
    expect(
      within(items[0]).queryByRole('button', { name: labels.deleteLabel('Accessoire 1') }),
    ).not.toBeInTheDocument();
  });

  it('« Ajouter » : nom obligatoire, libellé proposé par le serveur, puis la liste', async () => {
    const { user } = await openSettings();

    await list();
    await user.click(screen.getByRole('button', { name: labels.add }));

    const form = screen.getByRole('dialog', { name: dialog.createTitle });

    await user.click(within(form).getByRole('button', { name: dialog.submit }));
    await waitFor(() => {
      expect(fieldByLabel(form, dialog.name)).toHaveAttribute('aria-invalid', 'true');
    });

    await user.type(fieldByLabel(form, dialog.name), 'Yao Relais');
    await user.type(fieldByLabel(form, dialog.terms), '5 % la première année');
    await user.click(within(form).getByRole('button', { name: dialog.submit }));

    expect(await screen.findByText(dialog.created)).toBeInTheDocument();
    expect(await within(await list()).findByText('Accessoire 3')).toBeVisible();
    expect(writes('POST')[0].body).toEqual({
      label: null,
      name: 'Yao Relais',
      phone: null,
      email: null,
      terms: '5 % la première année',
      active: true,
    });
  });

  it('« Modifier » : désactiver un apporteur ; libellé déjà pris (422) sous le champ', async () => {
    const { user } = await openSettings();

    await list();
    await user.click(screen.getByRole('button', { name: labels.editLabel('Accessoire 2') }));

    const form = screen.getByRole('dialog', { name: dialog.editTitle });
    const label = fieldByLabel(form, dialog.label);

    await user.clear(label);
    await user.type(label, 'Accessoire 1');
    await user.click(within(form).getByRole('button', { name: dialog.submit }));
    expect(
      await within(form).findByText('La valeur du champ libellé est déjà utilisée.'),
    ).toBeVisible();

    await user.clear(label);
    await user.type(label, 'Accessoire 2');
    await user.click(within(form).getByRole('checkbox', { name: dialog.active }));
    await user.click(within(form).getByRole('button', { name: dialog.submit }));

    expect(await screen.findByText(dialog.saved)).toBeInTheDocument();
    expect(await within(await list()).findByText(labels.inactive)).toBeVisible();
    expect(writes('PUT').at(-1)?.body).toMatchObject({ label: 'Accessoire 2', active: false });
  });

  it('« Supprimer » un apporteur jamais rattaché ; refus du serveur (409) dans la modale', async () => {
    const { user } = await openSettings();

    await list();
    await user.click(screen.getByRole('button', { name: labels.deleteLabel('Accessoire 2') }));

    const confirm = screen.getByRole('dialog', { name: labels.delete.title });

    server.failNext('DELETE', apiUrl('/cga/referrers/01ref000000000000000000002'), {
      status: 409,
      data: {
        message: 'Cet apporteur est rattaché à des dossiers.',
        code: 'referrer_in_use',
        details: {},
      },
    });
    await user.click(within(confirm).getByRole('button', { name: labels.delete.submit }));
    expect(await within(confirm).findByRole('alert')).toHaveTextContent('rattaché à des dossiers');

    await user.click(within(confirm).getByRole('button', { name: labels.delete.submit }));

    expect(await screen.findByText(labels.delete.done)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('Ouattara Relais')).not.toBeInTheDocument();
    });
  });

  it('l’expert-comptable consulte les apporteurs sans pouvoir les modifier', async () => {
    await openSettings('expert');

    const items = within(await list()).getAllByRole('listitem');

    expect(items).toHaveLength(2);
    expect(screen.queryByRole('button', { name: labels.add })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: labels.editLabel('Accessoire 2') }),
    ).not.toBeInTheDocument();
    // L'expert-comptable n'a pas les utilisateurs du centre : ni Utilisateurs ni Droits.
    expect(
      screen.queryByRole('tab', { name: fr.cgaSettings.tabs.utilisateurs }),
    ).not.toBeInTheDocument();
  });

  it('liste vide : phrase et « Ajouter » ; panne : bandeau et « Réessayer »', async () => {
    server = installApiServer();
    server.signIn(...accesses.gerant);
    // Un échec, puis le nouvel essai automatique de React Query ; ensuite, une liste vide.
    server.failNext('GET', apiUrl('/cga/referrers'), { status: 500 });
    server.failNext('GET', apiUrl('/cga/referrers'), { status: 500 });
    server.failNext('GET', apiUrl('/cga/referrers'), { status: 200, data: { data: [] } });

    const session = await httpAuthApi.currentSession();
    const user = userEvent.setup({ delay: null });

    renderApp({ api: httpAuthApi, session, entry: `${SETTINGS}?onglet=apporteurs` });

    expect(await screen.findByText(labels.loadError, {}, { timeout: 4000 })).toBeVisible();
    await user.click(screen.getByRole('button', { name: fr.common.retry }));

    expect(await screen.findByText(labels.empty)).toBeVisible();
    expect(screen.getByRole('button', { name: labels.add })).toBeVisible();
  });
});
