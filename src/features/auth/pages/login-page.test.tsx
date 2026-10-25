import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AuthApi } from '@/features/auth/api/auth-api';
import { createFakeAuthApi, DEMO_PASSWORD } from '@/features/auth/api/fake-auth-api';
import { authRoutes, spaceRoutes } from '@/features/auth/lib/destination';
import { LoginPage } from '@/features/auth/pages/login-page';
import { fr } from '@/lib/i18n/fr';
import { renderApp } from '@/test/render-app';

const PASSWORD = DEMO_PASSWORD;

function renderLogin(options: { entry?: string; api?: AuthApi } = {}) {
  const { router } = renderApp({
    entry: options.entry ?? authRoutes.login,
    api: options.api,
    routeList: [
      { path: authRoutes.login, element: <LoginPage /> },
      { path: '*', element: <p>Écran suivant</p> },
    ],
  });

  return router;
}

async function signIn(identifier: string, password: string = PASSWORD) {
  const identifierField = screen.getByLabelText(new RegExp(fr.auth.login.identifier));
  const passwordField = screen.getByLabelText(new RegExp(`^${fr.auth.login.password}`));
  // Frappe sans délai : la page est remplie plusieurs fois de suite dans un même test.
  const user = userEvent.setup({ delay: null });

  await user.clear(identifierField);
  await user.type(identifierField, identifier);
  await user.clear(passwordField);
  await user.type(passwordField, password);
  await user.click(screen.getByRole('button', { name: fr.auth.login.submit }));
}

describe('Page de connexion (F-AUTH-01, 03-APPFLOW §2)', () => {
  it('F-AUTH-01 · demande un téléphone ou un e-mail, un mot de passe, et offre le lien d’oubli', () => {
    renderLogin();

    expect(
      screen.getByRole('heading', { level: 1, name: fr.auth.login.title }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(new RegExp(fr.auth.login.identifier))).toBeInTheDocument();
    expect(screen.getByLabelText(new RegExp(`^${fr.auth.login.password}`))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: fr.auth.login.forgotten })).toHaveAttribute(
      'href',
      authRoutes.forgottenPassword,
    );
  });

  it('F-AUTH-01 · n’appelle pas l’API quand un champ manque et montre l’erreur sous le champ', async () => {
    const api: AuthApi = { ...createFakeAuthApi(), login: vi.fn() };
    renderLogin({ api });

    await userEvent.click(screen.getByRole('button', { name: fr.auth.login.submit }));

    expect(await screen.findByText(fr.auth.login.required.identifier)).toBeInTheDocument();
    expect(screen.getByText(fr.auth.login.required.password)).toBeInTheDocument();
    expect(api.login).not.toHaveBeenCalled();
  });

  it('RG-ACC-04 · un seul rattachement mène au tableau de bord de son espace', async () => {
    const router = renderLogin();

    await signIn('gerant@dc-knowing.ci');

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(spaceRoutes.cga);
    });
  });

  it('RG-ACC-02 · plusieurs rattachements mènent au sélecteur d’espace', async () => {
    const router = renderLogin();

    await signIn('presidente@cncga.ci');

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(authRoutes.chooseSpace);
    });
  });

  it('RG-ACC-01 · le téléphone sert d’identifiant comme l’e-mail', async () => {
    const router = renderLogin();

    await signIn('+2250700000001');

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(spaceRoutes.cga);
    });
  });

  it('F-AUTH-01 · un adhérent arrive sur son accueil', async () => {
    const router = renderLogin();

    await signIn('adherent@inc.ci');

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(spaceRoutes.member);
    });
  });

  it('F-AUTH-01 · des identifiants refusés donnent « Identifiants incorrects », la saisie restant à l’écran', async () => {
    renderLogin();

    await signIn('gerant@dc-knowing.ci', 'mauvais');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      fr.auth.login.failures.invalid_credentials,
    );
    expect(screen.getByLabelText(new RegExp(fr.auth.login.identifier))).toHaveValue(
      'gerant@dc-knowing.ci',
    );
  });

  it('F-AUTH-01 · au 5e échec, le serveur annonce un blocage de 15 minutes', async () => {
    renderLogin();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await signIn('gerant@dc-knowing.ci', 'mauvais');
    }

    expect(await screen.findByRole('alert')).toHaveTextContent(
      fr.auth.login.failures.too_many_attempts,
    );
    // Cinq formulaires remplis d'affilée : plus long que le budget par défaut de 5 s.
  }, 20_000);

  it('F-AUTH-01 · un accès qui n’est pas actif renvoie vers le CGA', async () => {
    renderLogin();

    await signIn('inactif@dc-knowing.ci');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      fr.auth.login.failures.inactive_account,
    );
  });

  it('03-APPFLOW §7 · après une session expirée, prévient et ramène à la page demandée', async () => {
    const router = renderLogin({ entry: `${authRoutes.login}?retour=%2Fcga%2Fadherents` });

    expect(screen.getByText(fr.auth.login.sessionExpired)).toBeInTheDocument();

    await signIn('gerant@dc-knowing.ci');

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/cga/adherents');
    });
  });

  it('RG-ACC-02 · avec plusieurs espaces, le sélecteur passe avant la page demandée', async () => {
    const router = renderLogin({ entry: `${authRoutes.login}?retour=%2Fcga%2Fadherents` });

    await signIn('presidente@cncga.ci');

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(authRoutes.chooseSpace);
    });
  });

  it('A01 · un retour vers l’extérieur est ignoré au profit de l’espace de l’utilisateur', async () => {
    const router = renderLogin({ entry: `${authRoutes.login}?retour=https%3A%2F%2Fevil.tld` });

    await signIn('gerant@dc-knowing.ci');

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(spaceRoutes.cga);
    });
  });

  it('03-APPFLOW §7 · une erreur imprévue donne un message éphémère et conserve la saisie', async () => {
    const api: AuthApi = {
      ...createFakeAuthApi(),
      login: () => Promise.reject(new Error('réseau injoignable')),
    };
    renderLogin({ api });

    await signIn('gerant@dc-knowing.ci');

    expect(await screen.findByText(fr.errors.unexpected)).toBeInTheDocument();
    expect(screen.getByLabelText(new RegExp(`^${fr.auth.login.password}`))).toHaveValue(PASSWORD);
  });
});
