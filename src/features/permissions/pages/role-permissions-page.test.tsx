import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { httpAuthApi } from '@/features/auth/api/auth-api';
import { cgaPermissionRoutes } from '@/features/cga-settings/lib/routes';
import { platformRoutes } from '@/features/platform/lib/routes';
import { fr } from '@/lib/i18n/fr';
import { createPermissionsBackend } from '@/test/api-permissions';
import { apiUrl, demoIds, installApiServer } from '@/test/api-server';
import { renderApp } from '@/test/render-app';

/*
 * Droits par rôle, une interface par rôle (étape 1.9, F-ADM-05, 03-APPFLOW §4.3 et §6) : liste des
 * rôles, droits par module (verrous, « personnalisé »), impact avant l'enregistrement, retour aux
 * droits du réseau ; côté CGA (`/cga/parametres/droits/:role`) et réseau (`/plateforme/droits/:role`).
 * Vrai client `http`, backend simulé (`api-permissions.ts`).
 */
const labels = fr.permissions;

let server: ReturnType<typeof installApiServer>;
let permissions: ReturnType<typeof createPermissionsBackend>;

afterEach(() => {
  server.restore();
});

const accesses = {
  gerant: ['0700000002', demoIds.manager],
  admin: ['0700000009', demoIds.platformAdmin],
} as const;

async function open(entry: string, who: keyof typeof accesses = 'gerant') {
  permissions = createPermissionsBackend();
  server = installApiServer({ permissions });

  const [phone, membershipId] = accesses[who];

  server.signIn(phone, membershipId);

  const session = await httpAuthApi.currentSession();
  const user = userEvent.setup({ delay: null });
  const view = renderApp({ api: httpAuthApi, session, entry });

  return { user, ...view };
}

function checkbox(name: string) {
  return screen.getByRole('checkbox', { name: new RegExp(`^${name}`) });
}

function writes(suffix: string) {
  return server.requests.filter(
    (request) => request.method !== 'GET' && new URL(request.url).pathname.endsWith(suffix),
  );
}

const JOURNEY = { timeout: 15_000 };

describe('/cga/parametres · Droits par rôle (1.9, F-ADM-05)', JOURNEY, () => {
  it('liste des rôles du centre : utilisateurs, droits accordés, badge « personnalisé » ; ouverture d’un rôle', async () => {
    const { user, router } = await open(cgaPermissionRoutes.rolesTab);

    const roles = within(await screen.findByRole('list', { name: labels.rolesCaption }));
    const secretary = roles.getByRole('link', { name: /Secrétaire/ });

    expect(roles.getByRole('link', { name: /Comptable/ })).toHaveTextContent(
      `${labels.usersCount('2')} · ${labels.grantedCount('2', '4')}`,
    );
    expect(within(secretary).getByText(labels.customized)).toBeVisible();

    await user.click(secretary);

    expect(router.state.location.pathname).toBe(cgaPermissionRoutes.role('cga_secretary'));
    expect(
      await screen.findByRole('heading', { level: 1, name: fr.roles.cga_secretary }),
    ).toBeVisible();
  });

  it('interface d’un rôle : modules, verrou grisé, écarts « personnalisé », utilisateurs du rôle', async () => {
    await open(cgaPermissionRoutes.role('cga_secretary'));

    expect(
      await screen.findByRole('heading', { level: 1, name: fr.roles.cga_secretary }),
    ).toBeVisible();
    expect(checkbox('Voir les adhérents')).toBeChecked();
    expect(checkbox('Importer un portefeuille')).not.toBeChecked();
    expect(checkbox('Modifier la fiche du centre')).toBeDisabled();
    expect(screen.getByText(labels.locked)).toBeVisible();
    // Inscrire et importer : retirés par le centre, accordés au réseau.
    expect(screen.getAllByText(labels.customized)).toHaveLength(2);

    const holders = within(screen.getByRole('list', { name: labels.holders }));

    expect(holders.getByText('Fatou Invitée')).toBeVisible();
    expect(holders.getByText(fr.status.access.invited)).toBeVisible();
    expect(screen.getByRole('button', { name: labels.save })).toBeDisabled();
  });

  it('« Enregistrer » : impact (utilisateurs, droits ajoutés et retirés), puis les droits enregistrés', async () => {
    const { user } = await open(cgaPermissionRoutes.role('cga_accountant'));

    await screen.findByRole('heading', { level: 1, name: fr.roles.cga_accountant });
    await user.click(checkbox('Importer un portefeuille'));
    await user.click(checkbox('Inscrire un adhérent'));
    expect(screen.getAllByText(labels.customized)).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: labels.save }));

    const dialog = await screen.findByRole('dialog', { name: labels.impact.title });

    expect(within(dialog).getByText(labels.impact.summary('2', '1', '1'))).toBeVisible();
    expect(within(dialog).getByText(labels.impact.added('Importer un portefeuille'))).toBeVisible();
    expect(within(dialog).getByText(labels.impact.removed('Inscrire un adhérent'))).toBeVisible();
    expect(writes('/permissions')).toHaveLength(0);

    await user.click(within(dialog).getByRole('button', { name: labels.impact.submit }));

    expect(await screen.findByText(labels.saved)).toBeInTheDocument();
    expect(writes('/cga/roles/cga_accountant/permissions').at(-1)?.body).toEqual({
      permissions: ['members.view', 'members.import'],
    });
    expect(permissions.granted('cga', 'cga_accountant')).toEqual([
      'members.view',
      'members.import',
    ]);
    expect(screen.getByRole('button', { name: labels.save })).toBeDisabled();
  });

  it('« Tout accorder » et « Tout retirer » par module ; les droits verrouillés ne bougent pas', async () => {
    const { user } = await open(cgaPermissionRoutes.role('cga_accountant'));

    await screen.findByRole('heading', { level: 1, name: fr.roles.cga_accountant });
    await user.click(screen.getByRole('button', { name: labels.revokeAll('Adhérents') }));
    expect(checkbox('Voir les adhérents')).not.toBeChecked();
    expect(checkbox('Inscrire un adhérent')).not.toBeChecked();

    await user.click(screen.getByRole('button', { name: labels.grantAll('Adhérents') }));
    expect(checkbox('Importer un portefeuille')).toBeChecked();
    expect(
      screen.queryByRole('button', { name: labels.grantAll('Paramètres du centre') }),
    ).toBeNull();
    expect(checkbox('Modifier la fiche du centre')).not.toBeChecked();
  });

  it('« Revenir aux droits du réseau » : confirmation, puis plus aucune personnalisation', async () => {
    const { user } = await open(cgaPermissionRoutes.role('cga_secretary'));

    await screen.findByRole('heading', { level: 1, name: fr.roles.cga_secretary });
    await user.click(screen.getByRole('button', { name: labels.resetCga }));

    const dialog = screen.getByRole('dialog', { name: labels.resetCga });

    expect(within(dialog).getByText(labels.resetCgaEffects[0])).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: labels.resetSubmit }));

    expect(await screen.findByText(labels.resetDone)).toBeInTheDocument();
    expect(writes('/permissions/reset')).toHaveLength(1);
    await waitFor(() => {
      expect(screen.queryByText(labels.customized)).toBeNull();
    });
    expect(screen.queryByRole('button', { name: labels.resetCga })).toBeNull();
  });

  it('refus du serveur (409) dans la modale d’impact ; rôle inconnu : « Élément introuvable » ; panne de la liste', async () => {
    const { user, unmount } = await open(cgaPermissionRoutes.role('cga_accountant'));

    await screen.findByRole('heading', { level: 1, name: fr.roles.cga_accountant });
    await user.click(checkbox('Importer un portefeuille'));
    await user.click(screen.getByRole('button', { name: labels.save }));
    server.failNext('PUT', apiUrl('/cga/roles/cga_accountant/permissions'), {
      status: 409,
      data: { message: 'Droit verrouillé.', code: 'permission_locked', details: {} },
    });

    const dialog = await screen.findByRole('dialog', { name: labels.impact.title });

    await user.click(within(dialog).getByRole('button', { name: labels.impact.submit }));
    expect(await within(dialog).findByText('Droit verrouillé.')).toBeVisible();
    unmount();
    server.restore();

    const unknown = await open(cgaPermissionRoutes.role('cga_inconnu'));

    expect(await screen.findByText(fr.errorScreens.notFoundTitle)).toBeVisible();
    unknown.unmount();
    server.restore();

    permissions = createPermissionsBackend();
    server = installApiServer({ permissions });
    server.signIn('0700000002', demoIds.manager);
    for (let attempt = 0; attempt < 2; attempt++) {
      server.failNext('GET', apiUrl('/cga/roles'), { status: 500, data: { message: 'Erreur.' } });
    }

    const session = await httpAuthApi.currentSession();
    const retry = userEvent.setup({ delay: null });

    renderApp({ api: httpAuthApi, session, entry: cgaPermissionRoutes.rolesTab });
    expect(await screen.findByText(labels.loadError, {}, { timeout: 4000 })).toBeVisible();
    await retry.click(screen.getByRole('button', { name: fr.common.retry }));
    expect(await screen.findByRole('list', { name: labels.rolesCaption })).toBeVisible();
  });
});

describe('/plateforme · Droits du réseau (1.9)', JOURNEY, () => {
  it('onglets de la plateforme selon les droits ; un onglet d’une étape suivante : « Bientôt disponible »', async () => {
    await open(`${platformRoutes.root}?onglet=reseau`, 'admin');

    expect(
      await screen.findByRole('heading', { level: 1, name: fr.spaces.platform }),
    ).toBeVisible();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(
      Object.values(fr.platform.tabs),
    );
    expect(screen.getByText(fr.common.comingSoon)).toBeVisible();
  });

  it('l’administrateur : rôles du réseau, interface d’un rôle sans liste nominative, retour aux valeurs par défaut', async () => {
    const { user, router } = await open(platformRoutes.rolesTab, 'admin');

    const roles = within(await screen.findByRole('list', { name: labels.rolesCaption }));

    await user.click(roles.getByRole('link', { name: /Gestionnaire/ }));
    expect(router.state.location.pathname).toBe(platformRoutes.role('cncga_manager'));
    expect(
      await screen.findByRole('heading', { level: 1, name: fr.roles.cncga_manager }),
    ).toBeVisible();
    expect(screen.getByText(labels.referenceNetwork, { exact: false })).toBeVisible();
    expect(screen.queryByRole('list', { name: labels.holders })).toBeNull();

    await user.click(checkbox('Inscrire un adhérent'));
    expect(screen.getByText(labels.customized)).toBeVisible();
    await user.click(screen.getByRole('button', { name: labels.save }));
    await user.click(
      within(await screen.findByRole('dialog', { name: labels.impact.title })).getByRole('button', {
        name: labels.impact.submit,
      }),
    );
    expect(await screen.findByText(labels.saved)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: labels.resetNetwork }));
    await user.click(
      within(screen.getByRole('dialog', { name: labels.resetNetwork })).getByRole('button', {
        name: labels.resetSubmit,
      }),
    );
    expect(await screen.findByText(labels.resetDone)).toBeInTheDocument();
    expect(permissions.granted('network', 'cncga_manager')).toEqual(['members.view']);

    await user.click(screen.getByRole('link', { name: labels.back }));
    expect(router.state.location.pathname).toBe(platformRoutes.root);
  });
});
