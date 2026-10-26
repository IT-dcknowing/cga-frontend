import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AuthApi } from '@/features/auth/api/auth-api';
import { createFakeAuthApi } from '@/features/auth/api/fake-auth-api';
import { spaceRoutes } from '@/features/auth/lib/destination';
import { ApiBusinessError, ApiValidationError } from '@/lib/api-errors';
import { fr } from '@/lib/i18n/fr';
import { renderApp } from '@/test/render-app';

const NEW_PASSWORD = 'nouveau-mot';

function renderActivation(token: string, api: AuthApi = createFakeAuthApi()) {
  return renderApp({ api, entry: `/activer/${token}` });
}

async function fillForm(
  options: { password?: string; confirmation?: string; terms?: boolean } = {},
) {
  const user = userEvent.setup({ delay: null });
  const password = options.password ?? NEW_PASSWORD;

  await user.type(await screen.findByLabelText(new RegExp(`^${fr.activation.password}`)), password);
  await user.type(
    screen.getByLabelText(new RegExp(fr.activation.confirmPassword)),
    options.confirmation ?? password,
  );

  if (options.terms ?? true) {
    await user.click(screen.getByLabelText(fr.activation.terms));
  }
}

describe('Activation d’un compte invité (F-AUTH-02, 03-APPFLOW §2)', () => {
  it('RG-ACC-03 · accueille l’invité par son nom, son organisation et son rôle', async () => {
    renderActivation('invitation-agent');

    expect(
      await screen.findByText(
        fr.activation.welcome('Aya', 'DC-KNOWING CGA', fr.roles.cga_secretary),
      ),
    ).toBeInTheDocument();
    // Un agent n'a pas de consentements SMS / WhatsApp à donner.
    expect(screen.queryByLabelText(fr.activation.smsOptIn)).not.toBeInTheDocument();
  });

  it('RG-ACC-03 · le mot de passe choisi ouvre l’espace de l’invitation', async () => {
    const { router } = renderActivation('invitation-agent');

    await fillForm();
    await userEvent.click(screen.getByRole('button', { name: fr.activation.submit }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(spaceRoutes.cga);
    });
  });

  it('RG-NOT-04 · l’adhérent donne ses consentements SMS / WhatsApp à l’activation', async () => {
    const base = createFakeAuthApi();
    const activate = vi.fn(base.activate);
    const { router } = renderActivation('invitation-adherent', { ...base, activate });

    await fillForm();
    await userEvent.click(screen.getByLabelText(fr.activation.smsOptIn));
    await userEvent.click(screen.getByRole('button', { name: fr.activation.submit }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(spaceRoutes.member);
    });
    expect(activate).toHaveBeenCalledWith({
      token: 'invitation-adherent',
      password: NEW_PASSWORD,
      accepted_terms: true,
      sms_opt_in: true,
      whatsapp_opt_in: false,
    });
  });

  it('F-AUTH-02 · exige les conditions d’utilisation et 8 caractères identiques', async () => {
    const api = { ...createFakeAuthApi(), activate: vi.fn() };
    renderActivation('invitation-agent', api);

    await fillForm({ password: 'court', confirmation: 'autre', terms: false });
    await userEvent.click(screen.getByRole('button', { name: fr.activation.submit }));

    expect(await screen.findByText(fr.validation.passwordLength('8'))).toBeInTheDocument();
    expect(screen.getByText(fr.validation.passwordMismatch)).toBeInTheDocument();
    expect(screen.getByText(fr.activation.errors.termsRequired)).toBeInTheDocument();
    expect(api.activate).not.toHaveBeenCalled();
  });

  it('F-AUTH-02 · un lien expiré ou déjà utilisé affiche le contact du CGA', async () => {
    renderActivation('lien-expire');

    expect(
      await screen.findByRole('heading', { level: 1, name: fr.activation.invalid }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(fr.activation.invalidHelp('DC-KNOWING CGA · +225 27 20 00 00 00')),
    ).toBeInTheDocument();
  });

  it('un lien sans contact connu invite à le redemander à l’organisation', async () => {
    renderActivation('inconnu', {
      ...createFakeAuthApi(),
      readInvitation: () => Promise.resolve({ status: 'invalid', organization_contact: null }),
    });

    expect(await screen.findByText(fr.activation.invalidNoContact)).toBeInTheDocument();
  });

  it('un jeton refusé au moment d’activer donne aussi l’écran du lien invalide', async () => {
    renderActivation('invitation-agent', {
      ...createFakeAuthApi(),
      activate: () => Promise.reject(new ApiBusinessError('invitation_invalid')),
    });

    await fillForm();
    await userEvent.click(screen.getByRole('button', { name: fr.activation.submit }));

    expect(
      await screen.findByRole('heading', { level: 1, name: fr.activation.invalid }),
    ).toBeInTheDocument();
  });

  it('03-APPFLOW §7 · un mot de passe refusé par le serveur s’affiche sous le champ', async () => {
    renderActivation('invitation-agent', {
      ...createFakeAuthApi(),
      activate: () =>
        Promise.reject(new ApiValidationError({ password: 'Ce mot de passe est trop courant.' })),
    });

    await fillForm();
    await userEvent.click(screen.getByRole('button', { name: fr.activation.submit }));

    expect(await screen.findByText('Ce mot de passe est trop courant.')).toBeInTheDocument();
  });

  it('03-APPFLOW §7 · une panne garde la saisie et prévient', async () => {
    renderActivation('invitation-agent', {
      ...createFakeAuthApi(),
      activate: () => Promise.reject(new Error('panne')),
    });

    await fillForm();
    await userEvent.click(screen.getByRole('button', { name: fr.activation.submit }));

    expect(await screen.findByText(fr.errors.unexpected)).toBeInTheDocument();
    expect(screen.getByLabelText(new RegExp(`^${fr.activation.password}`))).toHaveValue(
      NEW_PASSWORD,
    );
  });

  it('une invitation illisible (panne) le dit au lieu d’une page vide', async () => {
    renderActivation('invitation-agent', {
      ...createFakeAuthApi(),
      readInvitation: () => Promise.reject(new Error('panne')),
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(fr.errors.unexpected);
  });
});
