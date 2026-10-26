import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AuthApi } from '@/features/auth/api/auth-api';
import { createFakeAuthApi, DEMO_CODE } from '@/features/auth/api/fake-auth-api';
import { authRoutes } from '@/features/auth/lib/destination';
import { ApiValidationError } from '@/lib/api-errors';
import { fr } from '@/lib/i18n/fr';
import { renderApp } from '@/test/render-app';

const NEW_PASSWORD = 'nouveau-mot';

function renderPage(api: AuthApi = createFakeAuthApi()) {
  return renderApp({ api, entry: authRoutes.forgottenPassword });
}

async function requestCode(identifier = 'gerant@dc-knowing.ci') {
  await userEvent.type(
    screen.getByLabelText(new RegExp(fr.forgottenPassword.identifier)),
    identifier,
  );
  await userEvent.click(screen.getByRole('button', { name: fr.forgottenPassword.requestCode }));
}

async function submitCode(code: string, password = NEW_PASSWORD, confirmation = password) {
  const user = userEvent.setup({ delay: null });
  const codeField = await screen.findByLabelText(new RegExp(fr.forgottenPassword.code('6')));

  await user.clear(codeField);
  await user.type(codeField, code);
  await user.clear(screen.getByLabelText(new RegExp(`^${fr.forgottenPassword.newPassword}`)));
  await user.type(
    screen.getByLabelText(new RegExp(`^${fr.forgottenPassword.newPassword}`)),
    password,
  );
  await user.clear(screen.getByLabelText(new RegExp(fr.forgottenPassword.confirmPassword)));
  await user.type(
    screen.getByLabelText(new RegExp(fr.forgottenPassword.confirmPassword)),
    confirmation,
  );
  await user.click(screen.getByRole('button', { name: fr.forgottenPassword.submit }));
}

describe('Mot de passe oublié (F-AUTH-03, 03-APPFLOW §2)', () => {
  it('RG-ACC-04 · exige un identifiant avant d’envoyer le code', async () => {
    const api = { ...createFakeAuthApi(), requestPasswordCode: vi.fn() };
    renderPage(api);

    await userEvent.click(screen.getByRole('button', { name: fr.forgottenPassword.requestCode }));

    expect(
      await screen.findByText(fr.forgottenPassword.errors.identifierRequired),
    ).toBeInTheDocument();
    expect(api.requestPasswordCode).not.toHaveBeenCalled();
  });

  it('A07 · annonce le même message, que le compte existe ou non', async () => {
    renderPage();

    await requestCode('inconnu@nulle-part.ci');

    expect(await screen.findByText(fr.forgottenPassword.codeSent)).toBeInTheDocument();
  });

  it('RG-ACC-04 · un bon code et un nouveau mot de passe ramènent à la connexion', async () => {
    const { router } = renderPage();

    await requestCode();
    await submitCode(DEMO_CODE);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(authRoutes.login);
    });
    expect(await screen.findByText(fr.forgottenPassword.done)).toBeInTheDocument();
  });

  it('vérifie le format du code et la confirmation avant d’appeler le serveur', async () => {
    const api = { ...createFakeAuthApi(), resetPassword: vi.fn() };
    renderPage(api);

    await requestCode();
    await submitCode('12', 'court', 'autre');

    expect(await screen.findByText(fr.validation.codeFormat('6'))).toBeInTheDocument();
    expect(screen.getByText(fr.validation.passwordLength('8'))).toBeInTheDocument();
    expect(screen.getByText(fr.validation.passwordMismatch)).toBeInTheDocument();
    expect(api.resetPassword).not.toHaveBeenCalled();
  });

  it('03-APPFLOW §2 · code faux : essais restants, puis retour à l’étape 1 au 3e échec', async () => {
    renderPage();

    await requestCode();
    await submitCode('000000');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      fr.forgottenPassword.errors.wrongCode('2'),
    );

    await submitCode('000000');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      fr.forgottenPassword.errors.wrongCode('1'),
    );

    await submitCode('000000');
    expect(await screen.findByRole('alert')).toHaveTextContent(fr.forgottenPassword.errors.expired);
    expect(
      screen.getByRole('button', { name: fr.forgottenPassword.requestCode }),
    ).toBeInTheDocument();
  }, 20_000);

  it('03-APPFLOW §7 · un refus de validation s’affiche sous le champ', async () => {
    const api: AuthApi = {
      ...createFakeAuthApi(),
      resetPassword: () =>
        Promise.reject(new ApiValidationError({ password: 'Ce mot de passe est trop courant.' })),
    };
    renderPage(api);

    await requestCode();
    await submitCode(DEMO_CODE);

    expect(await screen.findByText('Ce mot de passe est trop courant.')).toBeInTheDocument();
    expect(screen.getByLabelText(new RegExp(`^${fr.forgottenPassword.newPassword}`))).toHaveFocus();
  });

  it('03-APPFLOW §7 · une panne donne un message éphémère et garde l’étape en cours', async () => {
    const api: AuthApi = {
      ...createFakeAuthApi(),
      requestPasswordCode: () => Promise.reject(new Error('panne')),
    };
    renderPage(api);

    await requestCode();

    expect(await screen.findByText(fr.errors.unexpected)).toBeInTheDocument();
    expect(screen.getByLabelText(new RegExp(fr.forgottenPassword.identifier))).toHaveValue(
      'gerant@dc-knowing.ci',
    );
  });

  it('une panne à la validation du code garde la saisie', async () => {
    const api: AuthApi = {
      ...createFakeAuthApi(),
      resetPassword: () => Promise.reject(new Error('panne')),
    };
    renderPage(api);

    await requestCode();
    await submitCode(DEMO_CODE);

    expect(await screen.findByText(fr.errors.unexpected)).toBeInTheDocument();
    expect(screen.getByLabelText(new RegExp(fr.forgottenPassword.code('6')))).toHaveValue(
      DEMO_CODE,
    );
  });

  it('offre le retour à la connexion', () => {
    renderPage();

    expect(screen.getByRole('link', { name: fr.errorScreens.backToLogin })).toHaveAttribute(
      'href',
      authRoutes.login,
    );
  });
});
