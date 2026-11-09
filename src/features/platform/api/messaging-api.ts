import { withApiErrors } from '@/lib/api-errors';
import { http } from '@/lib/http';
import type { ApiItem } from '@/lib/query';

/*
 * Comptes d'envoi de la plateforme (F-ADM-06, RG-NOT-05, `/api/v1/platform/messaging`) : paramètres
 * en clair, identifiants jamais renvoyés (seulement « ••••4F2A »), un compte actif par canal, message
 * de test dont le résultat brut du fournisseur est affiché.
 */
export type MessagingChannel = 'sms' | 'whatsapp' | 'email';

export const MESSAGING_CHANNELS: readonly MessagingChannel[] = ['sms', 'whatsapp', 'email'];

export type MessagingProvider = {
  id: string;
  channel: MessagingChannel;
  driver: string;
  label: string;
  settings: Record<string, unknown>;
  /** Identifiants masqués : « ••••4F2A », `null` s'il n'est pas saisi. */
  secrets: Record<string, string | null>;
  is_active: boolean;
  last_test_at: string | null;
  last_test_result: string | null;
  updated_at: string | null;
};

export type MessagingDriver = {
  channels: MessagingChannel[];
  settings: string[];
  secrets: string[];
};

export type MessagingOverview = {
  providers: MessagingProvider[];
  drivers: Record<string, MessagingDriver>;
};

export type ProviderInput = {
  channel: MessagingChannel;
  driver: string;
  label: string;
  settings: Record<string, unknown>;
  /** Seuls les identifiants saisis : les autres sont conservés à la modification. */
  secrets: Record<string, string>;
};

export type TestResult = {
  ok: boolean;
  provider_message_id: string | null;
  provider_response: string | null;
};

export const messagingKeys = { all: ['platform', 'messaging'] as const };

function providerPath(id: string, action = ''): string {
  return `/platform/messaging/${encodeURIComponent(id)}${action === '' ? '' : `/${action}`}`;
}

export const messagingApi = {
  async overview(): Promise<MessagingOverview> {
    const { data } = await http.get<{
      data: MessagingProvider[];
      meta: { drivers: Record<string, MessagingDriver> };
    }>('/platform/messaging');

    return { providers: data.data, drivers: data.meta.drivers };
  },

  save: (id: string | null, input: ProviderInput) =>
    withApiErrors(async () => {
      const { data } =
        id === null
          ? await http.post<ApiItem<MessagingProvider>>('/platform/messaging', input)
          : await http.put<ApiItem<MessagingProvider>>(providerPath(id), input);

      return data.data;
    }),

  setActive: (id: string, active: boolean) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<MessagingProvider>>(
        providerPath(id, active ? 'activate' : 'deactivate'),
      );

      return data.data;
    }),

  test: (id: string, to: string) =>
    withApiErrors(async () => {
      const { data } = await http.post<ApiItem<TestResult>>(providerPath(id, 'test'), { to });

      return data.data;
    }),
};
