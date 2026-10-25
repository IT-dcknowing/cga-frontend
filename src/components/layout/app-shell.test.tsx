import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { AuthApi } from '@/features/auth/api/auth-api';
import { createFakeAuthApi } from '@/features/auth/api/fake-auth-api';
import { authRoutes, spaceRoutes } from '@/features/auth/lib/destination';
import { fr } from '@/lib/i18n/fr';
import { openSession, renderApp } from '@/test/render-app';

async function renderSpace(
  identifier: string,
  entry: string,
  options: { membershipId?: string; api?: Partial<AuthApi> } = {},
) {
  const base = createFakeAuthApi();
  const session = await openSession(base, identifier, options.membershipId);

  return renderApp({ api: { ...base, ...options.api }, session, entry });
}

async function mainMenu(): Promise<HTMLElement> {
  return (await screen.findAllByRole('navigation', { name: fr.shell.mainMenu }))[0];
}

describe('Coque des espaces (04-UX-UI §5.1, §5.2)', () => {
  it('en-tête : organisation · rôle, compteur de notifications et menu « Prénom ▾ »', async () => {
    await renderSpace('gerant@dc-knowing.ci', spaceRoutes.cga);

    const header = screen.getByRole('banner');

    expect(within(header).getByText('DC-KNOWING CGA')).toBeInTheDocument();
    expect(within(header).getByText(fr.roles.cga_manager, { exact: false })).toBeInTheDocument();
    expect(within(header).getByText(fr.shell.notifications('3'))).toBeInTheDocument();
    expect(within(header).getByRole('link', { name: fr.public.brand })).toHaveAttribute(
      'href',
      spaceRoutes.cga,
    );
    expect(screen.getByRole('heading', { level: 1, name: fr.nav.dashboard })).toBeInTheDocument();
  });

  it('menu « Prénom ▾ » : Mon profil · Changer d’espace · Déconnexion', async () => {
    await renderSpace('gerant@dc-knowing.ci', spaceRoutes.cga);

    await userEvent.click(screen.getByRole('button', { name: 'Koffi' }));
    const menu = screen.getByRole('menu', { name: fr.shell.userMenu });

    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual([fr.shell.profile, fr.shell.changeSpace, fr.shell.logout]);
    expect(within(menu).getByRole('menuitem', { name: fr.shell.profile })).toHaveAttribute(
      'href',
      authRoutes.profile,
    );

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Koffi' }));
    await userEvent.click(screen.getAllByRole('button', { name: fr.shell.closeMenu })[0]);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('RG-ACC-02 · « Changer d’espace » rouvre le sélecteur sans reconnexion', async () => {
    const { router } = await renderSpace('presidente@cncga.ci', spaceRoutes.cga, {
      membershipId: 'm-cga-2',
    });

    await userEvent.click(screen.getByRole('button', { name: 'Adjoua' }));
    await userEvent.click(screen.getByRole('menuitem', { name: fr.shell.changeSpace }));
    expect(router.state.location.pathname).toBe(authRoutes.chooseSpace);
    expect(screen.getByText(fr.chooseSpace.current)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /CNCGA/ }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(spaceRoutes.cncga);
    });
    expect(
      within(await mainMenu()).getByRole('link', { name: fr.nav.cncgaDues }),
    ).toBeInTheDocument();
  });

  it('se déconnecte vers la connexion, sans annoncer une session expirée', async () => {
    const { router } = await renderSpace('gerant@dc-knowing.ci', spaceRoutes.cga);

    await userEvent.click(screen.getByRole('button', { name: 'Koffi' }));
    await userEvent.click(screen.getByRole('menuitem', { name: fr.shell.logout }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(authRoutes.login);
    });
    expect(router.state.location.search).toBe('');
    expect(screen.queryByText(fr.auth.login.sessionExpired)).not.toBeInTheDocument();

    // La session est fermée : un espace redemande la connexion.
    await router.navigate(spaceRoutes.cga);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(authRoutes.login);
    });
  });

  it('ferme la session locale même si le serveur ne répond pas à la déconnexion', async () => {
    const { router } = await renderSpace('gerant@dc-knowing.ci', spaceRoutes.cga, {
      api: { logout: () => Promise.reject(new Error('panne')) },
    });

    await userEvent.click(screen.getByRole('button', { name: 'Koffi' }));
    await userEvent.click(screen.getByRole('menuitem', { name: fr.shell.logout }));

    expect(await screen.findByText(fr.errors.unexpected)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(authRoutes.login);
  });

  it('mobile : le menu des agents s’ouvre en tiroir et se referme après un choix', async () => {
    const { router } = await renderSpace('gerant@dc-knowing.ci', spaceRoutes.cga);

    await userEvent.click(screen.getByRole('button', { name: fr.shell.openMenu }));
    const drawer = screen.getByRole('dialog', { name: fr.shell.mainMenu });

    await userEvent.click(within(drawer).getByRole('link', { name: fr.nav.members }));

    expect(router.state.location.pathname).toBe('/cga/adherents');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: fr.shell.openMenu }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: fr.shell.openMenu }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getAllByRole('button', { name: fr.shell.closeMenu })[1],
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('03-APPFLOW §5.1 · l’adhérent a une barre basse de 4 entrées et « Plus »', async () => {
    await renderSpace('adherent@inc.ci', spaceRoutes.member);

    const bar = screen.getByRole('navigation', { name: fr.shell.bottomMenu });

    expect(
      within(bar)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual([fr.nav.home, fr.nav.obligations, fr.nav.documents, fr.nav.messages]);
    expect(within(bar).getByRole('button', { name: fr.nav.more })).toBeInTheDocument();
    // En-tête compact : le nom de l'entreprise de l'adhérent.
    expect(within(screen.getByRole('banner')).getByText('INC SARL')).toBeInTheDocument();
    // Pas de tiroir pour l'adhérent : la barre basse le remplace.
    expect(screen.queryByRole('button', { name: fr.shell.openMenu })).not.toBeInTheDocument();
  });

  it('03-APPFLOW §5.1 · « Plus » : Formations, Mon profil, Changer d’espace, Déconnexion', async () => {
    const { router } = await renderSpace('adherent@inc.ci', spaceRoutes.member);

    await userEvent.click(screen.getByRole('button', { name: fr.nav.more }));
    const sheet = screen.getByRole('dialog', { name: fr.nav.more });

    expect(within(sheet).getByRole('link', { name: fr.nav.trainings })).toBeInTheDocument();
    expect(within(sheet).getByRole('link', { name: fr.shell.profile })).toBeInTheDocument();
    expect(within(sheet).getByRole('link', { name: fr.shell.changeSpace })).toBeInTheDocument();
    // RG-BNK-00 : module non activé pour ce CGA.
    expect(within(sheet).queryByRole('link', { name: fr.nav.myBankability })).toBeNull();

    await userEvent.click(within(sheet).getByRole('link', { name: fr.shell.profile }));
    expect(router.state.location.pathname).toBe(authRoutes.profile);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: fr.nav.more }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('link', { name: fr.shell.changeSpace }),
    );
    expect(router.state.location.pathname).toBe(authRoutes.chooseSpace);
  });

  it('« Plus » : la déconnexion de l’adhérent', async () => {
    const { router } = await renderSpace('adherent@inc.ci', spaceRoutes.member);

    await userEvent.click(screen.getByRole('button', { name: fr.nav.more }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: fr.shell.logout }),
    );

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(authRoutes.login);
    });
  });

  it('03-APPFLOW §6 · l’espace plateforme tient dans un écran, sans menu latéral', async () => {
    await renderSpace('admin@cga-connect.ci', spaceRoutes.platform);

    expect(screen.getByRole('heading', { level: 1, name: fr.spaces.platform })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: fr.shell.mainMenu })).not.toBeInTheDocument();
  });
});
