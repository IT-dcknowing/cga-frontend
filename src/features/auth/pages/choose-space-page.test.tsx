import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { AuthApi } from '@/features/auth/api/auth-api';
import { createFakeAuthApi } from '@/features/auth/api/fake-auth-api';
import { authRoutes, spaceRoutes } from '@/features/auth/lib/destination';
import { fr } from '@/lib/i18n/fr';
import { openSession, renderApp } from '@/test/render-app';

async function renderChooser(identifier: string, api: AuthApi = createFakeAuthApi()) {
  const session = await openSession(api, identifier);

  return renderApp({ api, session, entry: authRoutes.chooseSpace });
}

describe('Sélecteur d’espace (F-AUTH-04, 03-APPFLOW §2)', () => {
  it('RG-ACC-02 · une carte par espace : organisation, rôle, notifications non lues', async () => {
    await renderChooser('presidente@cncga.ci');

    const cards = screen.getAllByRole('button');

    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByText('CNCGA')).toBeInTheDocument();
    expect(within(cards[0]).getByText(fr.roles.cncga_president)).toBeInTheDocument();
    expect(within(cards[0]).getByText(fr.chooseSpace.unread('5'))).toBeInTheDocument();
    expect(within(cards[1]).getByText('DC-KNOWING CGA')).toBeInTheDocument();
    expect(within(cards[1]).getByText(fr.roles.cga_accountant_expert)).toBeInTheDocument();
  });

  it('03-APPFLOW §1 · présélectionne le dernier espace utilisé', async () => {
    await renderChooser('presidente@cncga.ci');

    const last = screen.getByRole('button', { name: /DC-KNOWING CGA/ });

    expect(last).toHaveFocus();
    expect(within(last).getByText(fr.chooseSpace.last)).toBeInTheDocument();
  });

  it('RG-ACC-02 · le clic ouvre l’espace côté serveur et mène à son tableau de bord', async () => {
    const { router } = await renderChooser('presidente@cncga.ci');

    await userEvent.click(screen.getByRole('button', { name: /CNCGA/ }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(spaceRoutes.cncga);
    });
    // Le menu suit les droits du nouvel espace, renvoyés par le serveur.
    expect(await screen.findByRole('link', { name: fr.nav.cncgaDues })).toBeInTheDocument();
  });

  it('F-AUTH-04 · nomme l’espace d’un adhérent par son entreprise', async () => {
    await renderChooser('adherent@inc.ci');

    expect(screen.getByText('INC SARL')).toBeInTheDocument();
    expect(screen.getByText(`${fr.roles.member_owner} · DC-KNOWING CGA`)).toBeInTheDocument();
    expect(screen.getByText(fr.chooseSpace.current)).toBeInTheDocument();
  });

  it('03-APPFLOW §7 · un échec garde l’utilisateur sur le sélecteur avec un message', async () => {
    const api = createFakeAuthApi();
    const failing: AuthApi = { ...api, chooseSpace: () => Promise.reject(new Error('panne')) };
    const { router } = await renderChooser('presidente@cncga.ci', failing);

    await userEvent.click(screen.getByRole('button', { name: /CNCGA/ }));

    expect(await screen.findByText(fr.errors.unexpected)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(authRoutes.chooseSpace);
    expect(screen.getByRole('button', { name: /CNCGA/ })).toBeEnabled();
  });

  it('sans aucun rattachement, renvoie vers le CGA', () => {
    const session = {
      user: {
        first_name: 'Yao',
        last_name: 'Konan',
        phone: '+2250700000005',
        email: null,
        notification_preferences: { sms: true, whatsapp: false },
      },
      memberships: [],
      active_membership_id: null,
      last_membership_id: null,
      permissions: [],
    };

    renderApp({ session, entry: authRoutes.chooseSpace });

    expect(screen.getByText(fr.chooseSpace.empty)).toBeInTheDocument();
  });

  it('sans session, renvoie à la connexion', () => {
    const { router } = renderApp({ entry: authRoutes.chooseSpace });

    expect(router.state.location.pathname).toBe(authRoutes.login);
  });
});
