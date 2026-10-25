import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/providers';
import { routes } from '@/app/router';
import { httpAuthApi } from '@/features/auth/api/auth-api';
import { authRoutes, spaceRoutes } from '@/features/auth/lib/destination';
import { config } from '@/lib/config';
import { fr } from '@/lib/i18n/fr';
import { apiUrl, csrfCookieUrl, DEMO_PASSWORD, demoIds, installApiServer } from '@/test/api-server';
import { renderApp } from '@/test/render-app';

/*
 * Connexion et choix d'espace de bout en bout dans l'application : pages, session, gardes, vrai
 * client `http` (adresse `VITE_API_BASE_URL` de `.env`, intercepteurs, toasts) et `httpAuthApi`.
 * Seules les réponses du backend de la plateforme sont simulées (`installApiServer`).
 */

let server: ReturnType<typeof installApiServer>;

beforeEach(() => {
  server = installApiServer();
});

afterEach(() => {
  server.restore();
});

function openLoginPage(entry: string = authRoutes.login) {
  return renderApp({ api: httpAuthApi, entry });
}

async function signIn(identifier: string, password = DEMO_PASSWORD) {
  const user = userEvent.setup({ delay: null });

  await user.type(screen.getByLabelText(new RegExp(fr.auth.login.identifier)), identifier);
  await user.type(screen.getByLabelText(new RegExp(`^${fr.auth.login.password}`)), password);
  await user.click(screen.getByRole('button', { name: fr.auth.login.submit }));
}

/** Ouvre le sélecteur par le menu de l'en-tête (F-AUTH-04), une fois la coque affichée. */
async function openSpaceChooser(firstName: string) {
  const user = userEvent.setup({ delay: null });

  await user.click(await screen.findByRole('button', { name: firstName }));
  await user.click(screen.getByRole('menuitem', { name: fr.shell.changeSpace }));
  await screen.findByRole('heading', { level: 1, name: fr.chooseSpace.title });
}

/** Cartes du sélecteur : les boutons de la page (les toasts vivent hors de `main`). */
function spaceCards() {
  return within(screen.getByRole('main')).getAllByRole('button');
}

function calls() {
  return server.requests.map(({ method, url }) => `${method} ${url}`);
}

describe('Connexion sur l’API de VITE_API_BASE_URL (F-AUTH-01, 02-TRD §6.1)', () => {
  it('prend le cookie CSRF à la racine du serveur, se connecte par POST /auth/login, puis lit /me', async () => {
    const { router } = openLoginPage();

    await signIn('0700000002');

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(spaceRoutes.cga);
    });
    expect(calls()).toEqual([
      `GET ${csrfCookieUrl}`,
      `POST ${apiUrl('/auth/login')}`,
      `GET ${apiUrl('/me')}`,
    ]);
    expect(server.requests[0].url.startsWith(config.apiRootUrl)).toBe(true);
    expect(server.requests[1].url.startsWith(config.apiBaseUrl)).toBe(true);
    // RG-ACC-01 · téléphone ou e-mail, envoyé tel que saisi : le serveur le normalise.
    expect(server.requests[1].body).toEqual({ identifier: '0700000002', password: DEMO_PASSWORD });
  });

  it('02-TRD §6.7 · chaque appel part avec le cookie de session (withCredentials)', async () => {
    openLoginPage();

    await signIn('0700000002');

    await waitFor(() => {
      expect(server.requests).toHaveLength(3);
    });
    expect(server.requests.every((request) => request.withCredentials === true)).toBe(true);
  });

  it.each([
    ['0700000002', 'gérant d’un seul CGA', spaceRoutes.cga],
    ['0700000001', 'Présidente du CNCGA', spaceRoutes.cncga],
    ['0700000012', 'adhérent', spaceRoutes.member],
  ])(
    '03-APPFLOW §1 · un seul espace (%s, %s) : tableau de bord directement, sans sélecteur',
    async (phone, _who, home) => {
      const { router } = openLoginPage();

      await signIn(phone);

      await waitFor(() => {
        expect(router.state.location.pathname).toBe(home);
      });
      // Le serveur a ouvert l'unique espace : le SPA ne le redemande pas.
      expect(server.requests.some((request) => request.url === apiUrl('/me/space'))).toBe(false);
    },
  );

  it('le gérant arrive dans la coque de son CGA, avec son rôle dans l’en-tête', async () => {
    openLoginPage();

    await signIn('0700000002');

    const banner = await screen.findByRole('banner');
    expect(banner).toHaveTextContent(`DC-KNOWING CGA · ${fr.roles.cga_manager}`);
    expect(within(banner).getByRole('button', { name: 'Koffi' })).toBeInTheDocument();
  });

  it('F-AUTH-01 · identifiants refusés (422) : « Identifiants incorrects » sous le formulaire, sans toast', async () => {
    const { router } = openLoginPage();

    await signIn('0700000002', 'mauvais');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      fr.auth.login.failures.invalid_credentials,
    );
    expect(router.state.location.pathname).toBe(authRoutes.login);
    expect(screen.queryByText(fr.errors.http.badRequest)).not.toBeInTheDocument();
  });

  it('F-AUTH-01 · compte désactivé (403 inactive_account) : « Votre accès n’est pas actif », sans toast', async () => {
    openLoginPage();

    await signIn('0700000005');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      fr.auth.login.failures.inactive_account,
    );
    expect(screen.queryByText(fr.errors.http.forbidden)).not.toBeInTheDocument();
  });

  it('02-TRD §6.1 · trop d’essais (429) : message de blocage, sans toast', async () => {
    server.failNext('POST', apiUrl('/auth/login'), {
      status: 429,
      data: { message: 'Trop de tentatives.' },
    });
    openLoginPage();

    await signIn('0700000002');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      fr.auth.login.failures.too_many_attempts,
    );
    expect(screen.queryByText(fr.errors.http.tooManyRequests)).not.toBeInTheDocument();
  });

  it('jeton CSRF expiré (419) : nouveau cookie CSRF puis connexion, sans message', async () => {
    server.failNext('POST', apiUrl('/auth/login'), {
      status: 419,
      data: { message: 'CSRF token mismatch.' },
    });
    const { router } = openLoginPage();

    await signIn('0700000002');

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(spaceRoutes.cga);
    });
    expect(calls()).toEqual([
      `GET ${csrfCookieUrl}`,
      `POST ${apiUrl('/auth/login')}`,
      `GET ${csrfCookieUrl}`,
      `POST ${apiUrl('/auth/login')}`,
      `GET ${apiUrl('/me')}`,
    ]);
    expect(screen.queryByText(fr.errors.http.csrfExpired)).not.toBeInTheDocument();
  });

  it('03-APPFLOW §7 · erreur du serveur (500) : un seul toast, l’utilisateur reste sur la connexion', async () => {
    server.failNext('POST', apiUrl('/auth/login'), {
      status: 500,
      data: { message: 'Server Error' },
    });
    const { router } = openLoginPage();

    await signIn('0700000002');

    expect(await screen.findByText(fr.errors.http.server)).toBeInTheDocument();
    expect(screen.queryByText(fr.errors.unexpected)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe(authRoutes.login);
  });

  it('03-APPFLOW §7 · API injoignable : toast « Impossible de joindre le serveur »', async () => {
    server.failNext('GET', csrfCookieUrl, 'network-error');
    const { router } = openLoginPage();

    await signIn('0700000002');

    expect(await screen.findByText(fr.errors.http.network)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(authRoutes.login);
  });
});

describe('Session gardée par le cookie (02-TRD §6.1, 03-APPFLOW §7)', () => {
  function reloadApp(entry: string) {
    const router = createMemoryRouter(routes, { initialEntries: [entry] });

    render(
      <AppProviders authApi={httpAuthApi}>
        <RouterProvider router={router} />
      </AppProviders>,
    );

    return router;
  }

  it('au rechargement, /me relit la session et rouvre l’espace enregistré côté serveur', async () => {
    server.signIn('0700000003', demoIds.multiBouake);

    const router = reloadApp(spaceRoutes.cga);

    const banner = await screen.findByRole('banner');
    expect(within(banner).getByText('CGA Démo Bouaké')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(spaceRoutes.cga);
    expect(calls()).toEqual([`GET ${apiUrl('/me')}`]);
  });

  it('sans session (401 sur /me), retour à la connexion avec la page demandée', async () => {
    const router = reloadApp(spaceRoutes.cga);

    expect(await screen.findByText(fr.auth.login.sessionExpired)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(authRoutes.login);
    expect(router.state.location.search).toBe(`?retour=${encodeURIComponent(spaceRoutes.cga)}`);
  });
});

describe('Choix et changement d’espace (F-AUTH-04, RG-ACC-02, 03-APPFLOW §1-2)', () => {
  it('RG-ACC-02 · plusieurs espaces : le sélecteur s’ouvre après la connexion, une carte par espace', async () => {
    const { router } = openLoginPage();

    await signIn('0700000003');

    expect(
      await screen.findByRole('heading', { level: 1, name: fr.chooseSpace.title }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(authRoutes.chooseSpace);

    const cards = spaceCards();

    expect(cards).toHaveLength(3);
    expect(within(cards[0]).getByText(fr.roles.cncga_manager)).toBeInTheDocument();
    expect(within(cards[1]).getByText('DC-KNOWING CGA')).toBeInTheDocument();
    expect(within(cards[1]).getByText(fr.roles.cga_accountant_expert)).toBeInTheDocument();
    expect(within(cards[2]).getByText('CGA Démo Bouaké')).toBeInTheDocument();
    expect(within(cards[2]).getByText(fr.roles.cga_accountant)).toBeInTheDocument();
    // Aucun espace n'est ouvert à la place de l'utilisateur.
    expect(screen.queryByText(fr.chooseSpace.current)).not.toBeInTheDocument();
    expect(server.requests.some(({ url }) => url === apiUrl('/me/space'))).toBe(false);
  });

  it('RG-ACC-02 · le clic enregistre l’espace par POST /me/space, puis ouvre son tableau de bord', async () => {
    const { router } = openLoginPage();
    await signIn('0700000003');
    await screen.findByRole('heading', { level: 1, name: fr.chooseSpace.title });

    await userEvent.click(screen.getByRole('button', { name: /DC-KNOWING CGA/ }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(spaceRoutes.cga);
    });
    expect(server.requests.find(({ url }) => url === apiUrl('/me/space'))?.body).toEqual({
      membership_id: demoIds.multiDck,
    });
    expect(await screen.findByRole('banner')).toHaveTextContent(
      `DC-KNOWING CGA · ${fr.roles.cga_accountant_expert}`,
    );
  });

  it('choisir le CNCGA mène au tableau de bord du CNCGA', async () => {
    const { router } = openLoginPage();
    await signIn('0700000003');
    await screen.findByRole('heading', { level: 1, name: fr.chooseSpace.title });

    await userEvent.click(spaceCards()[0]);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(spaceRoutes.cncga);
    });
    expect(await screen.findByRole('banner')).toHaveTextContent(fr.roles.cncga_manager);
  });

  it('03-APPFLOW §1 · à la connexion suivante, le dernier espace utilisé est présélectionné', async () => {
    const user = userEvent.setup({ delay: null });
    openLoginPage();
    await signIn('0700000003');
    await screen.findByRole('heading', { level: 1, name: fr.chooseSpace.title });
    await user.click(screen.getByRole('button', { name: /CGA Démo Bouaké/ }));
    await user.click(await screen.findByRole('button', { name: 'Yao' }));
    await user.click(screen.getByRole('menuitem', { name: fr.shell.logout }));
    await screen.findByRole('button', { name: fr.auth.login.submit });

    await signIn('0700000003');

    await screen.findByRole('heading', { level: 1, name: fr.chooseSpace.title });
    expect(within(spaceCards()[2]).getByText(fr.chooseSpace.last)).toBeInTheDocument();
    expect(spaceCards()[2]).toHaveFocus();
  });

  it('RG-ACC-02 · avec plusieurs espaces, le sélecteur passe avant la page demandée après une session expirée', async () => {
    const { router } = openLoginPage(
      `${authRoutes.login}?retour=${encodeURIComponent('/cga/adherents')}`,
    );

    await signIn('0700000003');

    await screen.findByRole('heading', { level: 1, name: fr.chooseSpace.title });
    expect(router.state.location.pathname).toBe(authRoutes.chooseSpace);
  });

  it('03-APPFLOW §7 · avec un seul espace, retour à la page demandée après une session expirée', async () => {
    const { router } = openLoginPage(
      `${authRoutes.login}?retour=${encodeURIComponent('/cga/adherents')}`,
    );

    await signIn('0700000002');

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/cga/adherents');
    });
  });

  it('RG-ACC-02 · change d’espace sans se reconnecter : l’en-tête et les droits suivent', async () => {
    const { router } = openLoginPage();
    await signIn('0700000003');
    await screen.findByRole('heading', { level: 1, name: fr.chooseSpace.title });
    await userEvent.click(screen.getByRole('button', { name: /DC-KNOWING CGA/ }));
    await screen.findByRole('banner');

    await openSpaceChooser('Yao');
    await userEvent.click(screen.getByRole('button', { name: /CGA Démo Bouaké/ }));

    await waitFor(() => {
      expect(within(screen.getByRole('banner')).getByText('CGA Démo Bouaké')).toBeInTheDocument();
    });
    expect(router.state.location.pathname).toBe(spaceRoutes.cga);
    expect(server.requests.filter(({ url }) => url === apiUrl('/auth/login'))).toHaveLength(1);
    // Le comptable n'a pas la fiche du centre : plus d'entrée « Paramètres » (RG-ROLE-07).
    expect(
      within(screen.getByRole('navigation', { name: fr.shell.mainMenu })).queryByRole('link', {
        name: fr.nav.settings,
      }),
    ).not.toBeInTheDocument();
  });

  it('03-APPFLOW §7 · un refus du serveur garde l’utilisateur sur le sélecteur, avec un seul toast', async () => {
    const { router } = openLoginPage();
    await signIn('0700000003');
    await screen.findByRole('heading', { level: 1, name: fr.chooseSpace.title });
    server.failNext('POST', apiUrl('/me/space'), {
      status: 500,
      data: { message: 'Server Error' },
    });

    await userEvent.click(spaceCards()[0]);

    expect(await screen.findByText(fr.errors.http.server)).toBeInTheDocument();
    expect(screen.queryByText(fr.errors.unexpected)).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe(authRoutes.chooseSpace);
    spaceCards().forEach((card) => {
      expect(card).toBeEnabled();
    });
  });

  it('03-APPFLOW §7 · session expirée pendant le choix (401) : retour à la connexion', async () => {
    const { router } = openLoginPage();
    await signIn('0700000003');
    await screen.findByRole('heading', { level: 1, name: fr.chooseSpace.title });
    server.failNext('POST', apiUrl('/me/space'), {
      status: 401,
      data: { message: 'Non authentifié.' },
    });

    await userEvent.click(spaceCards()[0]);

    expect(await screen.findByText(fr.auth.login.sessionExpired)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(authRoutes.login);
  });

  it('la déconnexion ferme la session côté serveur et ramène à la connexion', async () => {
    const user = userEvent.setup({ delay: null });
    const { router } = openLoginPage();
    await signIn('0700000002');

    await user.click(await screen.findByRole('button', { name: 'Koffi' }));
    await user.click(screen.getByRole('menuitem', { name: fr.shell.logout }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(authRoutes.login);
    });
    expect(calls()).toContain(`POST ${apiUrl('/auth/logout')}`);
    expect(screen.queryByText(fr.auth.login.sessionExpired)).not.toBeInTheDocument();
  });
});

describe('Menus selon les droits renvoyés par /me (RG-ROLE-07, 03-APPFLOW §3.1, §4.1)', () => {
  function menuLinks() {
    return within(screen.getByRole('navigation', { name: fr.shell.mainMenu }))
      .getAllByRole('link')
      .map((link) => link.textContent);
  }

  it('la Présidente voit tout le menu CNCGA', async () => {
    openLoginPage();

    await signIn('0700000001');

    await screen.findByRole('banner');
    expect(menuLinks()).toEqual([
      fr.nav.dashboard,
      fr.nav.cncgaMembers,
      fr.nav.cncgaDues,
      fr.nav.cncgaReports,
      fr.nav.concerns,
      fr.nav.cncgaTrainings,
      fr.nav.communications,
      fr.nav.statistics,
      fr.nav.settings,
    ]);
  });

  it('le gérant voit tout le menu de son CGA, sans la bancabilité non activée', async () => {
    openLoginPage();

    await signIn('0700000002');

    await screen.findByRole('banner');
    expect(menuLinks()).toContain(fr.nav.settings);
    expect(menuLinks()).toContain(fr.nav.internal);
    expect(menuLinks()).not.toContain(fr.nav.bankability);
  });

  it('le formateur ne voit que Tableau de bord, Adhérents et Formations', async () => {
    openLoginPage();

    await signIn('0700000007');

    await screen.findByRole('banner');
    expect(menuLinks()).toEqual([fr.nav.dashboard, fr.nav.members, fr.nav.trainings]);
  });
});
