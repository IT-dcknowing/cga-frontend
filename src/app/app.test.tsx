import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { describe, expect, it } from 'vitest';
import { createFakeAuthApi, DEMO_PASSWORD } from '@/features/auth/api/fake-auth-api';
import { authRoutes, spaceRoutes } from '@/features/auth/lib/destination';
import { CgaLayout } from '@/features/auth/session/guards';
import { RouteErrorPage } from '@/features/errors/pages/error-screen';
import { fr } from '@/lib/i18n/fr';
import { rejectWithUnauthorizedNotice } from '@/lib/http';
import { openSession, renderApp } from '@/test/render-app';

function axiosErrorWith(status: number): AxiosError {
  return new AxiosError('refusé', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
  } as AxiosResponse);
}

async function renderSignedIn(identifier: string, entry: string, membershipId?: string) {
  const api = createFakeAuthApi();
  const session = await openSession(api, identifier, membershipId);

  return renderApp({ api, session, entry });
}

async function signIn(identifier: string) {
  const user = userEvent.setup({ delay: null });

  await user.type(screen.getByLabelText(new RegExp(fr.auth.login.identifier)), identifier);
  await user.type(screen.getByLabelText(new RegExp(`^${fr.auth.login.password}`)), DEMO_PASSWORD);
  await user.click(screen.getByRole('button', { name: fr.auth.login.submit }));
}

describe('Navigation de l’application (03-APPFLOW §1)', () => {
  it('F-AUTH-01 · la racine ouvre la page de connexion', () => {
    const { router } = renderApp({ entry: '/' });

    expect(router.state.location.pathname).toBe(authRoutes.login);
    expect(
      screen.getByRole('heading', { level: 1, name: fr.auth.login.title }),
    ).toBeInTheDocument();
  });

  it('les écrans publics s’ouvrent sans session', async () => {
    renderApp({ entry: authRoutes.forgottenPassword });
    expect(
      screen.getByRole('heading', { level: 1, name: fr.forgottenPassword.title }),
    ).toBeInTheDocument();
  });

  it('03-APPFLOW §7 · un espace sans session renvoie à la connexion, puis à la page demandée', async () => {
    const { router } = renderApp({ entry: '/cga/adherents?page=2' });

    expect(router.state.location.pathname).toBe(authRoutes.login);
    expect(screen.getByText(fr.auth.login.sessionExpired)).toBeInTheDocument();

    await signIn('gerant@dc-knowing.ci');

    await waitFor(() => {
      expect(`${router.state.location.pathname}${router.state.location.search}`).toBe(
        '/cga/adherents?page=2',
      );
    });
    expect(
      await screen.findByRole('heading', { level: 1, name: fr.nav.members }),
    ).toBeInTheDocument();
  });

  it('RG-ACC-02 · utilisateur multi-rôles : connexion, choix d’espace, changement d’espace', async () => {
    const { router } = renderApp({ entry: authRoutes.login });

    await signIn('presidente@cncga.ci');
    await screen.findByRole('heading', { level: 1, name: fr.chooseSpace.title });

    await userEvent.click(screen.getByRole('button', { name: /CNCGA/ }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(spaceRoutes.cncga);
    });
    expect(
      within(await screen.findByRole('banner')).getByText(fr.roles.cncga_president, {
        exact: false,
      }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Adjoua' }));
    await userEvent.click(screen.getByRole('menuitem', { name: fr.shell.changeSpace }));
    await userEvent.click(screen.getByRole('button', { name: /DC-KNOWING CGA/ }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(spaceRoutes.cga);
    });
    expect(
      await within(await screen.findByRole('banner')).findByText(fr.roles.cga_accountant_expert, {
        exact: false,
      }),
    ).toBeInTheDocument();
  });

  it('un utilisateur connecté sans espace choisi passe par le sélecteur', async () => {
    const { router } = await renderSignedIn('presidente@cncga.ci', spaceRoutes.cga);

    expect(router.state.location.pathname).toBe(authRoutes.chooseSpace);
  });

  it('l’adresse d’un espace renvoie à son tableau de bord', async () => {
    const { router } = await renderSignedIn('gerant@dc-knowing.ci', '/cga');

    expect(router.state.location.pathname).toBe(spaceRoutes.cga);
  });
});

describe('Droits et erreurs (03-APPFLOW §4.1, §7)', () => {
  it('RG-ROLE-07 · la secrétaire ne voit ni Paramètres ni Cotisation dans son menu', async () => {
    await renderSignedIn('secretaire@dc-knowing.ci', spaceRoutes.cga);

    const menu = screen.getAllByRole('navigation', { name: fr.shell.mainMenu })[0];

    expect(within(menu).getByRole('link', { name: fr.nav.members })).toBeInTheDocument();
    expect(within(menu).queryByRole('link', { name: fr.nav.settings })).toBeNull();
    expect(within(menu).queryByRole('link', { name: fr.nav.dues })).toBeNull();
    expect(within(menu).queryByRole('link', { name: fr.nav.communications })).toBeNull();
  });

  it('RG-ROLE-07 · une adresse sans le droit donne « Vous n’avez pas accès à cette page »', async () => {
    await renderSignedIn('secretaire@dc-knowing.ci', '/cga/parametres');

    expect(
      screen.getByRole('heading', { level: 1, name: fr.errorScreens.forbiddenTitle }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: fr.errorScreens.backToDashboard })).toHaveAttribute(
      'href',
      spaceRoutes.cga,
    );
  });

  it('RG-BNK-00 · la bancabilité d’un CGA qui ne l’a pas activée est refusée', async () => {
    await renderSignedIn('gerant@dc-knowing.ci', '/cga/bancabilite');

    expect(
      screen.getByRole('heading', { level: 1, name: fr.errorScreens.forbiddenTitle }),
    ).toBeInTheDocument();
  });

  it('l’espace d’un autre rattachement est refusé dans la coque de l’espace ouvert', async () => {
    await renderSignedIn('gerant@dc-knowing.ci', spaceRoutes.cncga);

    expect(
      screen.getByRole('heading', { level: 1, name: fr.errorScreens.forbiddenTitle }),
    ).toBeInTheDocument();
    expect(within(screen.getByRole('banner')).getByText('DC-KNOWING CGA')).toBeInTheDocument();
  });

  it('03-APPFLOW §7 · une adresse inconnue d’un espace donne « Élément introuvable » dans la coque', async () => {
    await renderSignedIn('gerant@dc-knowing.ci', '/cga/inconnu');

    expect(
      screen.getByRole('heading', { level: 1, name: fr.errorScreens.notFoundTitle }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('navigation', { name: fr.shell.mainMenu }).length).toBeGreaterThan(
      0,
    );
  });

  it('03-APPFLOW §7 · une adresse inconnue hors des espaces donne « Élément introuvable »', () => {
    renderApp({ entry: '/nulle-part' });

    expect(
      screen.getByRole('heading', { level: 1, name: fr.errorScreens.notFoundTitle }),
    ).toBeInTheDocument();
  });

  it('03-APPFLOW §7 · un 404 de l’API dans un écran s’affiche dans la coque', async () => {
    const api = createFakeAuthApi();
    const session = await openSession(api, 'gerant@dc-knowing.ci');

    renderApp({
      api,
      session,
      entry: '/cga/adherents/01J',
      routeList: [
        {
          path: '/cga',
          element: <CgaLayout />,
          children: [
            {
              errorElement: <RouteErrorPage />,
              children: [
                {
                  path: '/cga/adherents/:id',
                  loader: () => {
                    throw axiosErrorWith(404);
                  },
                  element: <p>Dossier</p>,
                },
              ],
            },
          ],
        },
      ],
    });

    expect(
      await screen.findByRole('heading', { level: 1, name: fr.errorScreens.notFoundTitle }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('navigation', { name: fr.shell.mainMenu }).length).toBeGreaterThan(
      0,
    );
  });

  it('03-APPFLOW §7 · une réponse 401 ramène à la connexion avec « Votre session a expiré »', async () => {
    const { router } = await renderSignedIn('gerant@dc-knowing.ci', '/cga/adherents');

    await act(async () => {
      await rejectWithUnauthorizedNotice(axiosErrorWith(401)).catch(() => undefined);
    });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(authRoutes.login);
    });
    expect(router.state.location.search).toBe('?retour=%2Fcga%2Fadherents');
    expect(screen.getByText(fr.auth.login.sessionExpired)).toBeInTheDocument();
  });

  it('un 401 sans session ouverte (connexion refusée) ne change rien', async () => {
    const { router } = renderApp({ entry: authRoutes.login });

    await act(async () => {
      await rejectWithUnauthorizedNotice(axiosErrorWith(401)).catch(() => undefined);
    });

    expect(router.state.location.search).toBe('');
    expect(screen.queryByText(fr.auth.login.sessionExpired)).not.toBeInTheDocument();
  });

  it('les écrans pas encore construits s’affichent dans la coque, avec leur titre', async () => {
    await renderSignedIn('adherent@inc.ci', '/adherent/obligations');

    expect(screen.getByRole('heading', { level: 1, name: fr.nav.obligations })).toBeInTheDocument();
    expect(screen.getByText(fr.pending.body)).toBeInTheDocument();
  });
});

describe('Page de démonstration (étape 0.4)', () => {
  it('affiche la page de démonstration sur /demo', () => {
    renderApp({ entry: '/demo' });

    expect(
      screen.getByRole('heading', { level: 1, name: 'Composants de base' }),
    ).toBeInTheDocument();
  });

  it('montre un message éphémère', async () => {
    renderApp({ entry: '/demo' });

    await userEvent.click(screen.getByRole('button', { name: 'Afficher un message' }));

    expect(await screen.findByText('Adhésion validée — n° 2026-DEMO-0143')).toBeInTheDocument();
  });

  it('trie et pagine le tableau des adhérents comme le fera l’API', async () => {
    renderApp({ entry: '/demo' });
    const table = screen.getByRole('table', { name: 'Tableau des adhérents' });

    expect(screen.getByText('1–10 sur 28')).toBeInTheDocument();
    expect(within(table).getAllByRole('row')).toHaveLength(11);

    // Un montant se trie d'abord du plus élevé au plus faible, puis l'inverse.
    const feesHeader = within(table).getByRole('button', { name: /Honoraires/ });
    const firstRowFees = () =>
      within(within(table).getAllByRole('row')[1]).getByText(/\d+\s000\sF/);
    await userEvent.click(feesHeader);
    expect(firstRowFees()).toHaveTextContent(/^35\s000\sF$/);
    await userEvent.click(feesHeader);
    expect(firstRowFees()).toHaveTextContent(/^15\s000\sF$/);

    await userEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    expect(screen.getByText('11–20 sur 28')).toBeInTheDocument();
  });

  it('ouvre un dossier au clic sur une ligne', async () => {
    renderApp({ entry: '/demo' });
    const table = screen.getByRole('table', { name: 'Tableau des adhérents' });

    await userEvent.click(within(table).getByText('BOULANGERIE DU PLATEAU'));

    expect(await screen.findByText('Dossier ouvert : BOULANGERIE DU PLATEAU')).toBeInTheDocument();
  });
});
