import type { MessagingDriver, MessagingProvider } from '@/features/platform/api/messaging-api';
import { forbidden, invalid, notFound, ok, type ApiReply } from './api-replies';

/*
 * Comptes d'envoi simulés, d'après `MessagingProviderController` (`MessagingProviderResource` :
 * identifiants masqués « ••••4F2A ») : pilotes de `config/messaging.php`, un compte actif par canal,
 * identifiants conservés à la modification s'ils ne sont pas ressaisis, test refusé par le pilote
 * « orange_ci » (réponse brute du fournisseur). Droit : `platform.messaging.manage`.
 */
type Context = { allows: (permission: string) => boolean };

const NOW = '2026-11-02T09:00:00Z';

export const demoDrivers: Record<string, MessagingDriver> = {
  log: { channels: ['sms', 'whatsapp', 'email'], settings: [], secrets: [] },
  orange_ci: {
    channels: ['sms'],
    settings: ['base_url', 'sender_address', 'sender_name', 'cost_units'],
    secrets: ['client_id', 'client_secret'],
  },
  whatsapp_cloud: {
    channels: ['whatsapp'],
    settings: ['base_url', 'phone_number_id', 'templates'],
    secrets: ['access_token'],
  },
  smtp: {
    channels: ['email'],
    settings: ['host', 'port', 'encryption', 'from_address', 'from_name'],
    secrets: ['username', 'password'],
  },
};

type Stored = MessagingProvider & { clear: Record<string, string> };

function shown({ clear, ...provider }: Stored): MessagingProvider {
  return {
    ...provider,
    secrets: Object.fromEntries(
      Object.entries(clear).map(([key, value]) => [key, `••••${value.slice(-4)}`]),
    ),
  };
}

export function createMessagingBackend() {
  let providers: Stored[] = [
    {
      id: '01msg000000000000000000001',
      channel: 'sms',
      driver: 'orange_ci',
      label: 'Orange CI',
      settings: {
        base_url: 'https://api.orange.test',
        sender_address: 'tel:+2250000',
        sender_name: 'CGA',
        cost_units: '',
      },
      secrets: {},
      clear: { client_id: 'client-1234', client_secret: 'secret-4F2A' },
      is_active: true,
      last_test_at: null,
      last_test_result: null,
      updated_at: NOW,
    },
  ];
  let sequence = 1;

  function save(id: string | null, body: unknown): ApiReply {
    const input = (body ?? {}) as {
      channel?: string;
      driver?: string;
      label?: string;
      settings?: Record<string, unknown>;
      secrets?: Record<string, string>;
    };
    const driver = demoDrivers[input.driver ?? ''] as MessagingDriver | undefined;

    if (driver === undefined || !driver.channels.includes(input.channel as never)) {
      return invalid({ driver: 'Ce fournisseur ne sert pas ce canal.' });
    }

    if ((input.label ?? '').trim() === '') {
      return invalid({ label: 'Le nom du compte est obligatoire.' });
    }

    const existing = providers.find((provider) => provider.id === id);
    const kept = existing !== undefined && existing.driver === input.driver ? existing.clear : {};
    const clear = { ...kept, ...(input.secrets ?? {}) };
    const missing = driver.secrets.find(
      (key) => key !== 'username' && key !== 'password' && clear[key] === undefined,
    );

    if (missing !== undefined) {
      return invalid({ [`secrets.${missing}`]: 'Cet identifiant est obligatoire.' });
    }

    const saved: Stored = {
      id: existing?.id ?? `01msg9${String(++sequence).padStart(20, '0')}`,
      channel: input.channel as Stored['channel'],
      driver: input.driver ?? '',
      label: (input.label ?? '').trim(),
      settings: input.settings ?? {},
      secrets: {},
      clear,
      is_active: existing?.is_active ?? false,
      last_test_at: existing?.last_test_at ?? null,
      last_test_result: existing?.last_test_result ?? null,
      updated_at: NOW,
    };

    providers =
      existing === undefined
        ? [...providers, saved]
        : providers.map((item) => (item.id === saved.id ? saved : item));

    return ok(shown(saved), existing === undefined ? 201 : 200);
  }

  function route(
    method: string,
    path: string,
    body: unknown,
    context: Context,
  ): ApiReply | undefined {
    if (!path.startsWith('/platform/messaging')) {
      return undefined;
    }

    if (!context.allows('platform.messaging.manage')) {
      return forbidden;
    }

    if (path === '/platform/messaging') {
      if (method === 'POST') {
        return save(null, body);
      }

      return { status: 200, data: { data: providers.map(shown), meta: { drivers: demoDrivers } } };
    }

    const match = /^\/platform\/messaging\/([^/]+)(?:\/(activate|deactivate|test))?$/.exec(path);
    const target = match === null ? undefined : providers.find((item) => item.id === match[1]);

    if (match === null || target === undefined) {
      return notFound;
    }

    if (method === 'PUT') {
      return save(target.id, body);
    }

    if (match[2] === 'activate' || match[2] === 'deactivate') {
      const active = match[2] === 'activate';

      providers = providers.map((item) =>
        item.id === target.id
          ? { ...item, is_active: active }
          : active && item.channel === target.channel
            ? { ...item, is_active: false }
            : item,
      );

      return ok(shown(providers.find((item) => item.id === target.id) as Stored));
    }

    const to = ((body ?? {}) as { to?: string }).to ?? '';

    if (to.trim() === '') {
      return invalid({ to: 'Le destinataire est obligatoire.' });
    }

    const accepted = target.driver !== 'orange_ci';
    const result = accepted
      ? { ok: true, provider_message_id: 'log-01', provider_response: null }
      : {
          ok: false,
          provider_message_id: null,
          provider_response: '401 Unauthorized: invalid client',
        };

    providers = providers.map((item) =>
      item.id === target.id
        ? {
            ...item,
            last_test_at: NOW,
            last_test_result: accepted ? 'ok' : result.provider_response,
          }
        : item,
    );

    return ok(result);
  }

  return { route, providers: () => providers.map(shown) };
}
