import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AuthApi } from '@/features/auth/api/auth-api';
import { createFakeAuthApi, DEMO_CODE, DEMO_PASSWORD } from '@/features/auth/api/fake-auth-api';
import { authRoutes } from '@/features/auth/lib/destination';
import { ApiValidationError } from '@/lib/api-errors';
import { fr } from '@/lib/i18n/fr';
import { openSession, renderApp } from '@/test/render-app';

async function renderProfile(identifier = 'gerant@dc-knowing.ci', override: Partial<AuthApi> = {}) {
  const base = createFakeAuthApi();
  const session = await openSession(base, identifier);
  const api = { ...base, ...override };

  return renderApp({ api, session, entry: authRoutes.profile });
}

function section(title: string): HTMLElement {
  const heading = screen.getByRole('heading', { level: 2, name: title });

  return heading.closest('section') as HTMLElement;
}

describe('Mon profil (F-AUTH-05, 03-APPFLOW §5.2)', () => {
  it('s’affiche dans la coque de l’espace ouvert, avec ses blocs', async () => {
    await renderProfile();

    expect(screen.getByRole('heading', { level: 1, name: fr.profile.title })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: fr.shell.mainMenu })).toBeInTheDocument();
    expect(within(section(fr.profile.identity)).getByLabelText(/Prénom/)).toHaveValue('Koffi');
    expect(within(section(fr.profile.phone)).getByText('+2250700000001')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: fr.profile.passwordSection })).toBeInTheDocument();
  });

  it('RG-NOT-04 · les préférences SMS / WhatsApp sont réservées aux adhérents', async () => {
    await renderProfile();
    expect(screen.queryByRole('heading', { name: fr.profile.preferences })).not.toBeInTheDocument();
  });

  it('RG-NOT-04 · l’adhérent retire son accord aux messages WhatsApp', async () => {
    const base = createFakeAuthApi();
    const updatePreferences = vi.fn(base.updatePreferences);
    const session = await openSession(base, 'adherent@inc.ci');
    renderApp({ api: { ...base, updatePreferences }, session, entry: authRoutes.profile });

    const preferences = section(fr.profile.preferences);
    const whatsapp = within(preferences).getByLabelText(fr.profile.whatsappOptIn);

    expect(within(preferences).getByText(fr.profile.preferencesHelp)).toBeInTheDocument();
    expect(whatsapp).toBeChecked();

    await userEvent.click(whatsapp);
    await userEvent.click(
      within(preferences).getByRole('button', { name: fr.profile.savePreferences }),
    );

    expect(await screen.findByText(fr.profile.preferencesSaved)).toBeInTheDocument();
    expect(updatePreferences).toHaveBeenCalledWith({ sms: true, whatsapp: false });
  });

  it('F-AUTH-05 · modifie le nom, et l’en-tête suit', async () => {
    await renderProfile();
    const identity = section(fr.profile.identity);
    const firstName = within(identity).getByLabelText(/Prénom/);

    await userEvent.clear(firstName);
    await userEvent.type(firstName, 'Kouadio');
    await userEvent.click(within(identity).getByRole('button', { name: fr.profile.save }));

    expect(await screen.findByText(fr.profile.saved)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Kouadio/ })).toBeInTheDocument();
  });

  it('F-AUTH-05 · contrôle le nom et l’e-mail avant d’appeler le serveur', async () => {
    const updateProfile = vi.fn();
    await renderProfile('gerant@dc-knowing.ci', { updateProfile });
    const identity = section(fr.profile.identity);

    await userEvent.clear(within(identity).getByLabelText(/^Nom/));
    await userEvent.clear(within(identity).getByLabelText(/E-mail/));
    await userEvent.type(within(identity).getByLabelText(/E-mail/), 'pas-un-email');
    await userEvent.click(within(identity).getByRole('button', { name: fr.profile.save }));

    expect(await screen.findByText(fr.profile.errors.lastNameRequired)).toBeInTheDocument();
    expect(screen.getByText(fr.profile.errors.emailFormat)).toBeInTheDocument();
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('RG-ACC-01 · un e-mail vidé est retiré du compte', async () => {
    const base = createFakeAuthApi();
    const updateProfile = vi.fn(base.updateProfile);
    const session = await openSession(base, 'gerant@dc-knowing.ci');
    renderApp({ api: { ...base, updateProfile }, session, entry: authRoutes.profile });
    const identity = section(fr.profile.identity);

    await userEvent.clear(within(identity).getByLabelText(/E-mail/));
    await userEvent.click(within(identity).getByRole('button', { name: fr.profile.save }));

    expect(await screen.findByText(fr.profile.saved)).toBeInTheDocument();
    expect(updateProfile).toHaveBeenCalledWith({
      first_name: 'Koffi',
      last_name: 'N’Guessan',
      email: null,
    });
  });

  it('03-APPFLOW §7 · un e-mail refusé par le serveur s’affiche sous le champ', async () => {
    await renderProfile('gerant@dc-knowing.ci', {
      updateProfile: () =>
        Promise.reject(new ApiValidationError({ email: 'E-mail déjà utilisé.' })),
    });
    const identity = section(fr.profile.identity);

    await userEvent.click(within(identity).getByRole('button', { name: fr.profile.save }));

    expect(await screen.findByText('E-mail déjà utilisé.')).toBeInTheDocument();
    expect(within(identity).getByLabelText(/E-mail/)).toHaveFocus();
  });

  it('F-AUTH-05 · le nouveau numéro n’est retenu qu’avec le code reçu', async () => {
    await renderProfile();
    const phone = section(fr.profile.phone);

    await userEvent.type(within(phone).getByLabelText(/Nouveau numéro/), '+2250700000099');
    await userEvent.click(within(phone).getByRole('button', { name: fr.profile.requestPhoneCode }));

    expect(
      await within(phone).findByText(fr.profile.phoneCodeSent('+2250700000099')),
    ).toBeInTheDocument();

    await userEvent.type(within(phone).getByLabelText(/Code/), '000000');
    await userEvent.click(within(phone).getByRole('button', { name: fr.profile.confirmPhone }));
    expect(await within(phone).findByRole('alert')).toHaveTextContent(
      fr.profile.errors.wrongCode('2'),
    );

    await userEvent.clear(within(phone).getByLabelText(/Code/));
    await userEvent.type(within(phone).getByLabelText(/Code/), DEMO_CODE);
    await userEvent.click(within(phone).getByRole('button', { name: fr.profile.confirmPhone }));

    expect(await screen.findByText(fr.profile.phoneChanged)).toBeInTheDocument();
    expect(within(phone).getByText('+2250700000099')).toBeInTheDocument();
  });

  it('F-AUTH-05 · un code épuisé fait redemander un code ; « Annuler » revient au numéro', async () => {
    await renderProfile();
    const phone = section(fr.profile.phone);
    const user = userEvent.setup({ delay: null });

    await user.type(within(phone).getByLabelText(/Nouveau numéro/), '+2250700000099');
    await user.click(within(phone).getByRole('button', { name: fr.profile.requestPhoneCode }));

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const code = await within(phone).findByLabelText(/Code/);
      await user.clear(code);
      await user.type(code, '000000');
      await user.click(within(phone).getByRole('button', { name: fr.profile.confirmPhone }));
    }

    expect(await within(phone).findByRole('alert')).toHaveTextContent(
      fr.profile.errors.expiredCode,
    );
    expect(within(phone).getByLabelText(/Nouveau numéro/)).toBeInTheDocument();

    await user.click(within(phone).getByRole('button', { name: fr.profile.requestPhoneCode }));
    await user.click(await within(phone).findByRole('button', { name: fr.common.cancel }));
    expect(within(phone).getByLabelText(/Nouveau numéro/)).toBeInTheDocument();
  }, 20_000);

  it('exige un nouveau numéro avant d’envoyer le code', async () => {
    const requestPhoneCode = vi.fn();
    await renderProfile('gerant@dc-knowing.ci', { requestPhoneCode });
    const phone = section(fr.profile.phone);

    await userEvent.click(within(phone).getByRole('button', { name: fr.profile.requestPhoneCode }));

    expect(await within(phone).findByText(fr.profile.errors.phoneRequired)).toBeInTheDocument();
    expect(requestPhoneCode).not.toHaveBeenCalled();
  });

  it('03-APPFLOW §7 · un numéro refusé par le serveur s’affiche sous le champ', async () => {
    await renderProfile('gerant@dc-knowing.ci', {
      requestPhoneCode: () =>
        Promise.reject(new ApiValidationError({ phone: 'Numéro déjà utilisé.' })),
    });
    const phone = section(fr.profile.phone);

    await userEvent.type(within(phone).getByLabelText(/Nouveau numéro/), '+2250700000002');
    await userEvent.click(within(phone).getByRole('button', { name: fr.profile.requestPhoneCode }));

    expect(await within(phone).findByText('Numéro déjà utilisé.')).toBeInTheDocument();
  });

  it('F-AUTH-05 · change le mot de passe avec le mot de passe actuel', async () => {
    await renderProfile();
    const password = section(fr.profile.passwordSection);
    const user = userEvent.setup({ delay: null });

    await user.type(within(password).getByLabelText(/actuel/), 'faux');
    await user.type(within(password).getByLabelText(/^Nouveau mot de passe/), 'nouveau-mot');
    await user.type(within(password).getByLabelText(/Confirmer/), 'nouveau-mot');
    await user.click(within(password).getByRole('button', { name: fr.profile.changePassword }));

    expect(await within(password).findByText(fr.profile.errors.wrongPassword)).toBeInTheDocument();
    expect(within(password).getByLabelText(/actuel/)).toHaveFocus();

    await user.clear(within(password).getByLabelText(/actuel/));
    await user.type(within(password).getByLabelText(/actuel/), DEMO_PASSWORD);
    await user.click(within(password).getByRole('button', { name: fr.profile.changePassword }));

    expect(await screen.findByText(fr.profile.passwordChanged)).toBeInTheDocument();
    expect(within(password).getByLabelText(/actuel/)).toHaveValue('');
  });

  it('contrôle la longueur et la confirmation du nouveau mot de passe', async () => {
    const changePassword = vi.fn();
    await renderProfile('gerant@dc-knowing.ci', { changePassword });
    const password = section(fr.profile.passwordSection);

    await userEvent.type(within(password).getByLabelText(/^Nouveau mot de passe/), 'court');
    await userEvent.type(within(password).getByLabelText(/Confirmer/), 'autre');
    await userEvent.click(
      within(password).getByRole('button', { name: fr.profile.changePassword }),
    );

    expect(
      await within(password).findByText(fr.profile.errors.currentPasswordRequired),
    ).toBeInTheDocument();
    expect(within(password).getByText(fr.validation.passwordLength('8'))).toBeInTheDocument();
    expect(within(password).getByText(fr.validation.passwordMismatch)).toBeInTheDocument();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('03-APPFLOW §7 · une panne prévient sans perdre la saisie', async () => {
    const failing = () => Promise.reject(new Error('panne'));
    await renderProfile('adherent@inc.ci', {
      updateProfile: failing,
      requestPhoneCode: failing,
      changePassword: failing,
      updatePreferences: failing,
    });

    await userEvent.click(
      within(section(fr.profile.identity)).getByRole('button', { name: fr.profile.save }),
    );
    expect(await screen.findByText(fr.errors.unexpected)).toBeInTheDocument();
    expect(within(section(fr.profile.identity)).getByLabelText(/Prénom/)).toHaveValue('Sery');

    const phone = section(fr.profile.phone);
    await userEvent.type(within(phone).getByLabelText(/Nouveau numéro/), '+2250700000099');
    await userEvent.click(within(phone).getByRole('button', { name: fr.profile.requestPhoneCode }));
    expect(within(phone).getByLabelText(/Nouveau numéro/)).toHaveValue('+2250700000099');

    const password = section(fr.profile.passwordSection);
    await userEvent.type(within(password).getByLabelText(/actuel/), DEMO_PASSWORD);
    await userEvent.type(within(password).getByLabelText(/^Nouveau mot de passe/), 'nouveau-mot');
    await userEvent.type(within(password).getByLabelText(/Confirmer/), 'nouveau-mot');
    await userEvent.click(
      within(password).getByRole('button', { name: fr.profile.changePassword }),
    );
    expect(within(password).getByLabelText(/actuel/)).toHaveValue(DEMO_PASSWORD);

    await userEvent.click(
      within(section(fr.profile.preferences)).getByRole('button', {
        name: fr.profile.savePreferences,
      }),
    );
    expect(screen.getAllByText(fr.errors.unexpected).length).toBeGreaterThan(0);
  }, 20_000);
});
