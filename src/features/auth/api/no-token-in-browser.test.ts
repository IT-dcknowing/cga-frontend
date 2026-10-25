import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { httpAuthApi, type Session } from '@/features/auth/api/auth-api';
import { config as apiConfig } from '@/lib/config';
import { http } from '@/lib/http';

/*
 * 02-TRD §6.7 (règle 9) : le navigateur ne garde aucun jeton. Parcours complet de la connexion par
 * le vrai client de l'API ; seules les réponses du serveur sont simulées, avec un jeton glissé dans
 * la réponse de connexion pour vérifier qu'il n'est ni stocké ni renvoyé.
 */

const session: Session = {
  user: {
    first_name: 'Koffi',
    last_name: 'Gérant',
    phone: '+2250700000002',
    email: null,
    notification_preferences: { sms: false, whatsapp: false },
  },
  memberships: [
    {
      id: '01m5fw2b6acrc1rpgfvg3fenyt',
      role: 'cga_manager',
      organization: {
        id: '01m5fw2ag62rmpgtw69t02ejtx',
        type: 'cga',
        name: 'DC-KNOWING CGA',
        banking_enabled: false,
      },
      member: null,
      unread_notifications: 0,
    },
  ],
  active_membership_id: '01m5fw2b6acrc1rpgfvg3fenyt',
  last_membership_id: null,
  permissions: ['members.view'],
};

const answers: Record<string, unknown> = {
  '/sanctum/csrf-cookie': '',
  '/auth/login': { data: { ...session, token: '1|jeton-qui-ne-doit-pas-rester' } },
  '/me': { data: session },
  '/me/space': { data: session },
  '/auth/logout': '',
};

const sent: InternalAxiosRequestConfig[] = [];
const defaultAdapter = http.defaults.adapter;

beforeEach(() => {
  sent.length = 0;
  localStorage.clear();
  sessionStorage.clear();
  http.defaults.adapter = (config) => {
    sent.push(config);

    return Promise.resolve({
      data: answers[config.url ?? ''],
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    } as AxiosResponse);
  };
});

afterEach(() => {
  http.defaults.adapter = defaultAdapter;
  vi.restoreAllMocks();
});

describe('Aucun jeton dans le navigateur (02-TRD §6.7)', () => {
  it('connexion, choix d’espace et déconnexion n’écrivent rien dans le stockage du navigateur', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    const opened = await httpAuthApi.login({ identifier: '0700000002', password: 'x' });
    await httpAuthApi.chooseSpace(session.memberships[0].id);
    await httpAuthApi.currentSession();
    await httpAuthApi.logout();

    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage).toHaveLength(0);
    expect(sessionStorage).toHaveLength(0);
    expect(JSON.stringify(opened)).not.toContain('jeton-qui-ne-doit-pas-rester');
  });

  it('chaque requête part avec le cookie de session, jamais avec un en-tête Authorization', async () => {
    await httpAuthApi.login({ identifier: '0700000002', password: 'x' });
    await httpAuthApi.chooseSpace(session.memberships[0].id);
    await httpAuthApi.logout();

    expect(sent.map((config) => config.url)).toEqual([
      '/sanctum/csrf-cookie',
      '/auth/login',
      '/me',
      '/me/space',
      '/me',
      '/auth/logout',
    ]);
    // Adresses complètes : celles de VITE_API_BASE_URL, cookie CSRF à la racine de son serveur.
    expect(sent.map((config) => http.getUri(config))).toEqual([
      `${apiConfig.apiRootUrl.replace(/\/$/, '')}/sanctum/csrf-cookie`,
      `${apiConfig.apiBaseUrl}/auth/login`,
      `${apiConfig.apiBaseUrl}/me`,
      `${apiConfig.apiBaseUrl}/me/space`,
      `${apiConfig.apiBaseUrl}/me`,
      `${apiConfig.apiBaseUrl}/auth/logout`,
    ]);

    for (const config of sent) {
      expect(config.withCredentials).toBe(true);
      expect(config.headers.Authorization).toBeUndefined();
    }
  });
});
