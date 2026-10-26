import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { httpAuthApi } from '@/features/auth/api/auth-api';
import { cgaPermissionRoutes } from '@/features/cga-settings/lib/routes';
import { platformRoutes } from '@/features/platform/lib/routes';
import { fr } from '@/lib/i18n/fr';
import { apiUrl, demoIds, installApiServer } from '@/test/api-server';
import { fieldByLabel } from '@/test/fields';
import { renderApp } from '@/test/render-app';

/*
 * Habilitations par utilisateur, le « nuage » (étape 1.12, RG-ROLE-07, 03-APPFLOW §4.3 et §6) :
 * depuis « Utilisateurs » du centre ou le rôle, et depuis « Utilisateurs CNCGA » de `/plateforme` ;
 * écarts au profil marqués « ajusté pour cet utilisateur », « Revenir au profil » par droit ou pour
 * tous. Vrai client `http`, backend simulé (`api-permissions.ts`).
 */
const labels = fr.permissions.user;
const ADJOUA = '01usr000000000000000adjoua';

let server: ReturnType<typeof installApiServer>;

afterEach(() => {
  server.restore();
});

const accesses = {
  gerant: ['0700000002', demoIds.manager],
  admin: ['0700000009', demoIds.platformAdmin],
} as const;

async function open(entry: string, who: keyof typeof accesses = 'gerant') {
  server = installApiServer();

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

function rowOf(name: string): HTMLElement {
  return checkbox(name).closest('li') as HTMLElement;
}

function writes(suffix: string) {
  return server.requests.filter(
    (request) => request.method !== 'GET' && new URL(request.url).pathname.endsWith(suffix),
  );
}

const JOURNEY = { timeout: 15_000 };

describe('/cga/parametres · habilitations d’un agent (1.12, RG-ROLE-07)', JOURNEY, () => {
  it('« Habilitations » depuis Utilisateurs ; le gérant n’en a pas ; profil et ajustement existant', async () => {
    const { user, router } = await open(cgaPermissionRoutes.usersTab);
    const users = fr.cgaSettings.users;

    await screen.findByRole('list', { name: users.caption });
    expect(screen.queryByRole('button', { name: users.rowActions('Koffi Gérant') })).toBeNull();
    await user.click(screen.getByRole('button', { name: users.rowActions('Adjoua Comptable') }));
    await user.click(screen.getByRole('menuitem', { name: labels.action }));

    expect(router.state.location.pathname).toBe(cgaPermissionRoutes.user(ADJOUA));
    expect(
      await screen.findByRole('heading', { level: 1, name: labels.title('Adjoua Comptable') }),
    ).toBeVisible();
    expect(screen.getByText(labels.profiles('Comptable'), { exact: false })).toBeVisible();
    expect(checkbox('Importer un portefeuille')).toBeChecked();
    expect(within(rowOf('Importer un portefeuille')).getByText(labels.adjusted)).toBeVisible();
    expect(checkbox('Modifier la fiche du centre')).toBeDisabled();
    expect(screen.getByRole('button', { name: labels.save })).toBeDisabled();
  });

  it('ajuster, « Revenir au profil » pour un droit, motif, puis enregistrer', async () => {
    const { user } = await open(cgaPermissionRoutes.user(ADJOUA));

    await screen.findByRole('heading', { level: 1, name: labels.title('Adjoua Comptable') });
    await user.click(
      screen.getByRole('button', { name: labels.backToProfileLabel('Importer un portefeuille') }),
    );
    expect(checkbox('Importer un portefeuille')).not.toBeChecked();
    expect(within(rowOf('Importer un portefeuille')).queryByText(labels.adjusted)).toBeNull();

    await user.click(checkbox('Inscrire un adhérent'));
    expect(within(rowOf('Inscrire un adhérent')).getByText(labels.adjusted)).toBeVisible();
    await user.type(fieldByLabel(document.body, labels.reason), 'Mission ponctuelle');
    await user.click(screen.getByRole('button', { name: labels.save }));

    expect(await screen.findByText(labels.saved('Adjoua Comptable'))).toBeInTheDocument();
    expect(writes(`/cga/users/${ADJOUA}/permissions`).at(-1)?.body).toEqual({
      permissions: ['members.view'],
      reason: 'Mission ponctuelle',
    });
    expect(screen.getByText(labels.adjustedCount('1'), { exact: false })).toBeVisible();
    expect(fieldByLabel(document.body, labels.reason)).toHaveValue('');
  });

  it('« Revenir au profil pour tous les droits » : confirmation, puis plus aucun ajustement', async () => {
    const { user } = await open(cgaPermissionRoutes.user(ADJOUA));

    await screen.findByRole('heading', { level: 1, name: labels.title('Adjoua Comptable') });
    await user.click(screen.getByRole('button', { name: labels.resetAll }));

    const dialog = screen.getByRole('dialog', { name: labels.resetAll });

    expect(within(dialog).getByText(labels.resetEffects[0])).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: fr.permissions.resetSubmit }));

    expect(await screen.findByText(labels.resetDone)).toBeInTheDocument();
    expect(writes('/permissions/reset')).toHaveLength(1);
    await waitFor(() => {
      expect(screen.queryByText(labels.adjusted)).toBeNull();
    });
    expect(screen.queryByRole('button', { name: labels.resetAll })).toBeNull();
  });

  it('depuis le rôle : lien vers les habilitations d’un utilisateur ; refus du serveur ; agent inconnu', async () => {
    const { user, router, unmount } = await open(cgaPermissionRoutes.role('cga_accountant'));

    await user.click(await screen.findByRole('link', { name: 'Adjoua Comptable' }));
    expect(router.state.location.pathname).toBe(cgaPermissionRoutes.user(ADJOUA));
    await screen.findByRole('heading', { level: 1, name: labels.title('Adjoua Comptable') });

    await user.click(checkbox('Voir les adhérents'));
    server.failNext('PUT', apiUrl(`/cga/users/${ADJOUA}/permissions`), {
      status: 422,
      data: { message: 'Invalide.', errors: { reason: ['Le motif est trop long.'] } },
    });
    await user.click(screen.getByRole('button', { name: labels.save }));
    expect(await screen.findByText('Le motif est trop long.')).toBeVisible();

    server.failNext('PUT', apiUrl(`/cga/users/${ADJOUA}/permissions`), {
      status: 409,
      data: { message: 'Accès désactivé.', code: 'agent_disabled', details: {} },
    });
    await user.click(screen.getByRole('button', { name: labels.save }));
    expect(await screen.findByText('Accès désactivé.')).toBeInTheDocument();

    server.failNext('POST', apiUrl(`/cga/users/${ADJOUA}/permissions/reset`), {
      status: 409,
      data: { message: 'Déjà au profil.', code: 'nothing_to_reset', details: {} },
    });
    await user.click(screen.getByRole('button', { name: labels.resetAll }));

    const dialog = screen.getByRole('dialog', { name: labels.resetAll });

    await user.click(within(dialog).getByRole('button', { name: fr.permissions.resetSubmit }));
    expect(await within(dialog).findByText('Déjà au profil.')).toBeVisible();
    unmount();
    server.restore();

    await open(cgaPermissionRoutes.user('01usr0000000000000inconnu'));
    expect(await screen.findByText(fr.errorScreens.notFoundTitle)).toBeVisible();
  });
});

describe('/plateforme · Utilisateurs CNCGA (1.12)', JOURNEY, () => {
  it('l’administrateur : la liste, puis les habilitations d’un utilisateur du CNCGA ; panne et « Réessayer »', async () => {
    const { user, router, unmount } = await open(platformRoutes.usersTab, 'admin');
    const users = fr.platform.users;

    const list = within(await screen.findByRole('list', { name: users.caption }));

    await user.click(list.getByRole('link', { name: /Yao Multi-rôles/ }));
    expect(router.state.location.pathname).toBe(platformRoutes.user('01usr000000000000000000yao'));
    expect(
      await screen.findByRole('heading', { level: 1, name: labels.title('Yao Multi-rôles') }),
    ).toBeVisible();

    await user.click(checkbox('Inscrire un adhérent'));
    await user.click(screen.getByRole('button', { name: labels.save }));
    expect(await screen.findByText(labels.saved('Yao Multi-rôles'))).toBeInTheDocument();
    expect(writes('/platform/network-users/01usr000000000000000000yao/permissions')).toHaveLength(
      1,
    );

    await user.click(screen.getByRole('link', { name: labels.back }));
    expect(router.state.location.search).toBe('?onglet=utilisateurs');
    unmount();
    server.restore();

    server = installApiServer();
    server.signIn('0700000009', demoIds.platformAdmin);
    for (let attempt = 0; attempt < 2; attempt++) {
      server.failNext('GET', apiUrl('/platform/network-users'), {
        status: 500,
        data: { message: 'Erreur.' },
      });
    }

    const session = await httpAuthApi.currentSession();
    const retry = userEvent.setup({ delay: null });

    renderApp({ api: httpAuthApi, session, entry: platformRoutes.usersTab });
    expect(await screen.findByText(users.loadError, {}, { timeout: 4000 })).toBeVisible();
    await retry.click(screen.getByRole('button', { name: fr.common.retry }));
    expect(await screen.findByRole('list', { name: users.caption })).toBeVisible();
  });
});
