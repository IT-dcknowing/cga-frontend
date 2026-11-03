import type { AppNotification } from '@/features/notifications/api/notifications-api';
import { notFound, ok, paginated, type ApiReply } from './api-replies';

/*
 * Notifications simulées, d'après `NotificationController` (`NotificationResource`) : celles de
 * l'utilisateur dans son espace actif, les plus récentes d'abord, avec `meta.unread_count` ; lecture
 * d'une notification, « Tout marquer comme lu ».
 */
type Context = { membershipId: string | null };

const NOW = '2026-11-02T09:00:00Z';

export function demoNotification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: '9a1b2c3d-0000-4000-8000-000000000001',
    type: 'dues_payment_reviewed',
    title: 'Paiement de cotisation confirmé',
    body: 'Votre paiement de 300 000 F pour la cotisation 2026 est confirmé.',
    link: '/cga/cotisation',
    read_at: null,
    created_at: NOW,
    ...overrides,
  };
}

/** `notifications` : par accès (espace) ; par défaut, aucune. */
export function createNotificationsBackend(seed: Record<string, AppNotification[]> = {}) {
  const store = new Map(Object.entries(seed).map(([id, items]) => [id, [...items]]));

  function own(context: Context): AppNotification[] {
    return context.membershipId === null ? [] : (store.get(context.membershipId) ?? []);
  }

  function save(context: Context, items: AppNotification[]) {
    if (context.membershipId !== null) {
      store.set(context.membershipId, items);
    }
  }

  function route(
    method: string,
    path: string,
    query: URLSearchParams,
    context: Context,
  ): ApiReply | undefined {
    if (!path.startsWith('/me/notifications')) {
      return undefined;
    }

    const items = own(context);

    if (method === 'GET' && path === '/me/notifications') {
      const reply = paginated(items, query) as { status: number; data: { meta: object } };

      return {
        ...reply,
        data: {
          ...reply.data,
          meta: {
            ...reply.data.meta,
            unread_count: items.filter((item) => item.read_at === null).length,
          },
        },
      };
    }

    if (method === 'POST' && path === '/me/notifications/read-all') {
      const marked = items.filter((item) => item.read_at === null).length;

      save(
        context,
        items.map((item) => ({ ...item, read_at: item.read_at ?? NOW })),
      );

      return ok({ marked });
    }

    const match = /^\/me\/notifications\/([^/]+)\/read$/.exec(path);
    const target = match === null ? undefined : items.find((item) => item.id === match[1]);

    if (method !== 'POST' || target === undefined) {
      return notFound;
    }

    const read = { ...target, read_at: target.read_at ?? NOW };

    save(
      context,
      items.map((item) => (item.id === read.id ? read : item)),
    );

    return ok(read);
  }

  return { route, of: (membershipId: string) => store.get(membershipId) ?? [] };
}
