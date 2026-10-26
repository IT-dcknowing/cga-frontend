import { screen } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import { data } from 'react-router';
import { describe, expect, it } from 'vitest';
import { createFakeAuthApi } from '@/features/auth/api/fake-auth-api';
import { authRoutes, spaceRoutes } from '@/features/auth/lib/destination';
import { errorKindOf } from '@/features/errors/lib/error-kind';
import { ErrorScreen, RouteErrorPage } from '@/features/errors/pages/error-screen';
import { fr } from '@/lib/i18n/fr';
import { openSession, renderApp } from '@/test/render-app';

function axiosErrorWith(status: number): AxiosError {
  return new AxiosError('refusé', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
  } as AxiosResponse);
}

describe('errorKindOf (03-APPFLOW §7)', () => {
  it('403 et 404 de l’API donnent leur écran, le reste l’erreur imprévue', () => {
    expect(errorKindOf(axiosErrorWith(403))).toBe('forbidden');
    expect(errorKindOf(axiosErrorWith(404))).toBe('notFound');
    expect(errorKindOf(axiosErrorWith(500))).toBe('unexpected');
    expect(errorKindOf(new Error('panne'))).toBe('unexpected');
  });
});

describe('Écrans d’erreur hors de la coque', () => {
  it('03-APPFLOW §7 · « Élément introuvable » ramène un visiteur à la connexion', () => {
    renderApp({
      entry: '/introuvable',
      routeList: [{ path: '*', element: <ErrorScreen kind="notFound" /> }],
    });

    expect(
      screen.getByRole('heading', { level: 1, name: fr.errorScreens.notFoundTitle }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: fr.errorScreens.backToLogin })).toHaveAttribute(
      'href',
      authRoutes.login,
    );
  });

  it('ramène au sélecteur un utilisateur connecté qui n’a pas encore choisi d’espace', async () => {
    const api = createFakeAuthApi();
    const session = await openSession(api, 'presidente@cncga.ci');

    renderApp({
      api,
      session,
      entry: '/introuvable',
      routeList: [{ path: '*', element: <ErrorScreen kind="forbidden" /> }],
    });

    expect(
      screen.getByRole('heading', { level: 1, name: fr.errorScreens.forbiddenTitle }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: fr.chooseSpace.title })).toHaveAttribute(
      'href',
      authRoutes.chooseSpace,
    );
  });

  it('un 404 levé par le routeur donne « Élément introuvable »', async () => {
    renderApp({
      entry: '/dossier',
      routeList: [
        {
          path: '/dossier',
          loader: () => {
            throw data(null, { status: 404 });
          },
          element: <p>Dossier</p>,
          errorElement: <RouteErrorPage />,
        },
      ],
    });

    expect(
      await screen.findByRole('heading', { level: 1, name: fr.errorScreens.notFoundTitle }),
    ).toBeInTheDocument();
  });

  it('une erreur imprévue pendant l’affichage donne un écran, jamais une page blanche', async () => {
    const api = createFakeAuthApi();
    const session = await openSession(api, 'gerant@dc-knowing.ci');

    function Broken(): never {
      throw new Error('panne');
    }

    renderApp({
      api,
      session,
      entry: '/casse',
      routeList: [{ path: '/casse', element: <Broken />, errorElement: <RouteErrorPage /> }],
    });

    expect(
      await screen.findByRole('heading', { level: 1, name: fr.errorScreens.unexpectedTitle }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: fr.errorScreens.backToDashboard })).toHaveAttribute(
      'href',
      spaceRoutes.cga,
    );
  });
});
