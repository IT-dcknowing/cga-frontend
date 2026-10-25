import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { AppProviders } from '@/app/providers';
import { routes } from '@/app/router';
import type { AuthApi, Session } from '@/features/auth/api/auth-api';
import { createFakeAuthApi, DEMO_PASSWORD } from '@/features/auth/api/fake-auth-api';

type RenderAppOptions = {
  /** Adresse de départ. */
  entry?: string;
  /** API des accès : par défaut un bouchon neuf, dont les compteurs repartent de zéro. */
  api?: AuthApi;
  /** Session déjà ouverte ; `null` pour un visiteur. */
  session?: Session | null;
  /** Routes à monter ; par défaut celles de l'application. */
  routeList?: RouteObject[];
};

/** Monte l'application (ou quelques routes) avec ses fournisseurs, dans un routeur en mémoire. */
export function renderApp({
  entry = '/',
  api = createFakeAuthApi(),
  session = null,
  routeList = routes,
}: RenderAppOptions = {}) {
  const router = createMemoryRouter(routeList, { initialEntries: [entry] });

  const view = render(
    <AppProviders authApi={api} initialSession={session}>
      <RouterProvider router={router} />
    </AppProviders>,
  );

  return { router, api, ...view };
}

/**
 * Ouvre la session d'un compte de démonstration auprès du bouchon, puis, si demandé, choisit un
 * espace : la session renvoyée est celle que le serveur aurait renvoyée.
 */
export async function openSession(
  api: AuthApi,
  identifier: string,
  membershipId?: string,
): Promise<Session> {
  const session = await api.login({ identifier, password: DEMO_PASSWORD });

  return membershipId === undefined ? session : await api.chooseSpace(membershipId);
}
