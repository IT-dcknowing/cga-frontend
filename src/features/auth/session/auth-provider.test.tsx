import { act, render, screen } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/providers';
import { createFakeAuthApi } from '@/features/auth/api/fake-auth-api';
import { useAuth } from '@/features/auth/session/auth-context';
import { fr } from '@/lib/i18n/fr';
import { rejectWithUnauthorizedNotice } from '@/lib/http';
import { openSession } from '@/test/render-app';

function SessionProbe() {
  const { session, activeMembership, can } = useAuth();

  return (
    <p>
      {session === null
        ? 'aucune session'
        : `${session.user.first_name} · ${activeMembership?.id ?? 'sans espace'} · ${
            // Un droit du catalogue du backend, accordé au gérant par la matrice par défaut.
            can('cga.profile.manage') ? 'paramètres' : 'sans paramètres'
          }`}
    </p>
  );
}

describe('AuthProvider (02-TRD §6.1, §6.2)', () => {
  it('relit /me au chargement, avec un écran d’attente plutôt qu’une page blanche', async () => {
    const api = createFakeAuthApi();
    await openSession(api, 'gerant@dc-knowing.ci');

    render(
      <AppProviders authApi={api}>
        <SessionProbe />
      </AppProviders>,
    );

    expect(screen.getByRole('status')).toHaveTextContent(fr.common.loading);
    expect(await screen.findByText('Koffi · m-cga · paramètres')).toBeInTheDocument();
  });

  it('sans session côté serveur, l’application démarre sans session', async () => {
    render(
      <AppProviders authApi={createFakeAuthApi()}>
        <SessionProbe />
      </AppProviders>,
    );

    expect(await screen.findByText('aucune session')).toBeInTheDocument();
  });

  it('03-APPFLOW §7 · une panne au chargement prévient et repart sans session', async () => {
    const api = { ...createFakeAuthApi(), currentSession: vi.fn().mockRejectedValue(new Error()) };

    render(
      <AppProviders authApi={api}>
        <SessionProbe />
      </AppProviders>,
    );

    expect(await screen.findByText('aucune session')).toBeInTheDocument();
    expect(await screen.findByText(fr.errors.unexpected)).toBeInTheDocument();
  });

  it('03-APPFLOW §7 · une réponse 401 ferme la session locale', async () => {
    const api = createFakeAuthApi();
    const session = await openSession(api, 'gerant@dc-knowing.ci');

    render(
      <AppProviders authApi={api} initialSession={session}>
        <SessionProbe />
      </AppProviders>,
    );
    expect(screen.getByText('Koffi · m-cga · paramètres')).toBeInTheDocument();

    await act(async () => {
      await rejectWithUnauthorizedNotice(
        new AxiosError('expirée', 'ERR_BAD_REQUEST', undefined, undefined, {
          status: 401,
        } as AxiosResponse),
      ).catch(() => undefined);
    });

    expect(screen.getByText('aucune session')).toBeInTheDocument();
  });

  it('refuse d’être utilisé hors de son fournisseur', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => render(<SessionProbe />)).toThrow('useAuth doit être appelé dans <AuthProvider>.');

    vi.restoreAllMocks();
  });
});
