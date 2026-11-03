import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { httpAuthApi } from '@/features/auth/api/auth-api';
import { fr } from '@/lib/i18n/fr';
import { createNotificationsBackend, demoNotification } from '@/test/api-notifications';
import { apiUrl, demoIds, installApiServer } from '@/test/api-server';
import { renderApp } from '@/test/render-app';

/*
 * Cloche de notifications, étape 6.6 (06-IMPLEMENTATION-PLAN, PRD M13, 03-APPFLOW §7) : liste de
 * l'espace actif, clic vers la page de l'objet (marquée lue), « Tout marquer comme lu ». Vrai client
 * `http`, backend simulé (`api-notifications.ts`).
 */
const labels = fr.notifications;

let server: ReturnType<typeof installApiServer>;

afterEach(() => {
  server.restore();
});

const reviewed = demoNotification();
const reminder = demoNotification({
  id: '9a1b2c3d-0000-4000-8000-000000000002',
  type: 'dues_reminder',
  title: 'Relance de cotisation',
  body: 'La cotisation 2026 reste due.',
  read_at: '2026-11-01T08:00:00Z',
  created_at: '2026-11-01T08:00:00Z',
});

async function open(seed: Parameters<typeof createNotificationsBackend>[0]) {
  const notifications = createNotificationsBackend(seed);

  server = installApiServer({ notifications });
  server.signIn('0700000002', demoIds.manager);

  const session = await httpAuthApi.currentSession();
  const user = userEvent.setup({ delay: null });
  const view = renderApp({ api: httpAuthApi, session, entry: '/cga/tableau-de-bord' });

  await screen.findByRole('heading', { level: 1, name: fr.nav.dashboard });

  return { user, notifications, ...view };
}

function bell(count: string) {
  return within(screen.getByRole('banner')).getByRole('button', {
    name: fr.shell.notifications(count),
  });
}

describe('Cloche de notifications (6.6)', { timeout: 20_000 }, () => {
  it('liste les notifications de l’espace actif ; un clic marque la notification lue et ouvre sa page', async () => {
    const { user, router, notifications } = await open({ [demoIds.manager]: [reviewed, reminder] });

    await user.click(bell('0'));
    const panel = await screen.findByRole('dialog', { name: labels.title });
    const items = await within(panel).findAllByRole('listitem');

    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText(reviewed.title ?? '')).toBeVisible();
    expect(within(items[0]).getByText(`(${labels.unread})`)).toBeInTheDocument();
    expect(within(items[1]).queryByText(`(${labels.unread})`)).toBeNull();
    expect(bell('1')).toHaveAttribute('aria-expanded', 'true');

    await user.click(within(items[0]).getByRole('button'));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/cga/cotisation');
    });
    expect(screen.queryByRole('dialog', { name: labels.title })).toBeNull();
    expect(notifications.of(demoIds.manager)[0].read_at).not.toBeNull();
    expect(
      server.requests.some(
        (request) =>
          request.method === 'POST' &&
          request.url.endsWith(`/me/notifications/${reviewed.id}/read`),
      ),
    ).toBe(true);
  });

  it('« Tout marquer comme lu » remet le compteur à zéro ; Échap ferme le panneau', async () => {
    const { user, notifications } = await open({
      [demoIds.manager]: [
        reviewed,
        demoNotification({ id: '9a1b2c3d-0000-4000-8000-000000000003' }),
      ],
    });

    await user.click(bell('0'));
    await screen.findByRole('dialog', { name: labels.title });
    await waitFor(() => {
      expect(bell('2')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: labels.markAllRead }));

    await waitFor(() => {
      expect(bell('0')).toBeInTheDocument();
    });
    expect(notifications.of(demoIds.manager).every((item) => item.read_at !== null)).toBe(true);
    expect(screen.queryByRole('button', { name: labels.markAllRead })).toBeNull();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: labels.title })).toBeNull();
  });

  it('panneau vide ; erreur de chargement avec « Réessayer »', async () => {
    const { user } = await open({});

    // La lecture est réessayée une fois (retryUnlessScreenError) : deux pannes.
    server.failNext('GET', apiUrl('/me/notifications'), { status: 500 });
    server.failNext('GET', apiUrl('/me/notifications'), { status: 500 });
    await user.click(bell('0'));

    // Après la nouvelle tentative de React Query (délai d'une seconde).
    expect(await screen.findByText(labels.loadError, {}, { timeout: 5000 })).toBeVisible();
    await user.click(screen.getByRole('button', { name: labels.retry }));
    expect(await screen.findByText(labels.empty)).toBeVisible();

    await user.click(screen.getByRole('button', { name: labels.close }));
    expect(screen.queryByRole('dialog', { name: labels.title })).toBeNull();
  });
});
