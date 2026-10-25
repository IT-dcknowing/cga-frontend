import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { config } from '@/lib/config';
import { toast } from 'sonner';
import { http, onUnauthorized, rejectWithUnauthorizedNotice, retryWithFreshCsrf } from '@/lib/http';

describe('http (02-TRD §6.1)', () => {
  const defaultAdapter = http.defaults.adapter;

  afterEach(() => {
    http.defaults.adapter = defaultAdapter;
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('vise l’API versionnée déclarée dans .env (VITE_API_BASE_URL)', () => {
    expect(http.defaults.baseURL).toBe(config.apiBaseUrl);
    expect(http.defaults.baseURL).toBe(import.meta.env.VITE_API_BASE_URL);
  });

  it('chaque appel part de cette adresse, sans aucune adresse écrite dans le code', async () => {
    const urls: string[] = [];

    http.defaults.adapter = (request: InternalAxiosRequestConfig) => {
      urls.push(http.getUri(request));

      return Promise.resolve({
        data: {},
        status: 200,
        statusText: 'OK',
        headers: {},
        config: request,
      });
    };

    await http.get('/me');
    await http.post('/auth/switch-space', { membership_id: 4 });

    expect(urls).toEqual([`${config.apiBaseUrl}/me`, `${config.apiBaseUrl}/auth/switch-space`]);
  });

  it('suit un changement de VITE_API_BASE_URL, sans toucher au code', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_API_BASE_URL', 'https://recette.cga-connect.ci/api/v1');

    const { http: reloaded } = await import('@/lib/http');

    expect(reloaded.defaults.baseURL).toBe('https://recette.cga-connect.ci/api/v1');
    expect(reloaded.getUri({ url: '/me' })).toBe('https://recette.cga-connect.ci/api/v1/me');
  });

  it('envoie le cookie de session et le jeton CSRF de Sanctum', () => {
    expect(http.defaults.withCredentials).toBe(true);
    expect(http.defaults.withXSRFToken).toBe(true);
    expect(http.defaults.xsrfCookieName).toBe('XSRF-TOKEN');
    expect(http.defaults.xsrfHeaderName).toBe('X-XSRF-TOKEN');
  });

  it('demande des réponses JSON', () => {
    expect(http.defaults.headers.Accept).toBe('application/json');
  });
});

describe('Session expirée (03-APPFLOW §7)', () => {
  it('prévient les abonnés d’une réponse 401, puis relance l’erreur', async () => {
    const listener = vi.fn();
    const unsubscribe = onUnauthorized(listener);
    const error = new AxiosError('session expirée', 'ERR_BAD_REQUEST', undefined, undefined, {
      status: 401,
    } as AxiosResponse);

    await expect(rejectWithUnauthorizedNotice(error)).rejects.toBe(error);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    await expect(rejectWithUnauthorizedNotice(error)).rejects.toBe(error);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('ne dit rien pour les autres erreurs', async () => {
    const listener = vi.fn();
    const unsubscribe = onUnauthorized(listener);
    const forbidden = new AxiosError('refusé', 'ERR_BAD_REQUEST', undefined, undefined, {
      status: 403,
    } as AxiosResponse);

    await expect(rejectWithUnauthorizedNotice(forbidden)).rejects.toBe(forbidden);
    await expect(rejectWithUnauthorizedNotice(new Error('réseau'))).rejects.toThrow('réseau');
    expect(listener).not.toHaveBeenCalled();

    unsubscribe();
  });

  it('est branché sur les réponses du client de l’API', async () => {
    const listener = vi.fn();
    const unsubscribe = onUnauthorized(listener);

    await expect(
      http.get('/me', {
        adapter: () =>
          Promise.reject(
            new AxiosError('session expirée', 'ERR_BAD_REQUEST', undefined, undefined, {
              status: 401,
            } as AxiosResponse),
          ),
      }),
    ).rejects.toBeInstanceOf(AxiosError);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });
});

describe('Jeton CSRF expiré (419, 02-TRD §6.1)', () => {
  const defaultAdapter = http.defaults.adapter;

  afterEach(() => {
    http.defaults.adapter = defaultAdapter;
    vi.restoreAllMocks();
  });

  /** Serveur qui répond 419 aux premières écritures, puis 200 ; garde la trace des appels. */
  function serverRefusing(times: number) {
    const calls: string[] = [];
    let refusals = times;

    http.defaults.adapter = (request: InternalAxiosRequestConfig) => {
      const url = http.getUri(request);
      calls.push(`${(request.method ?? 'get').toUpperCase()} ${url}`);

      if (request.method === 'post' && refusals > 0) {
        refusals -= 1;
        const response = {
          data: { message: 'CSRF token mismatch.' },
          status: 419,
          statusText: '',
          headers: {},
          config: request,
        } as AxiosResponse;

        return Promise.reject(
          new AxiosError('419', AxiosError.ERR_BAD_REQUEST, request, null, response),
        );
      }

      return Promise.resolve({
        data: { ok: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: request,
      });
    };

    return calls;
  }

  it('reprend un cookie CSRF à la racine du serveur, puis rejoue la requête une seule fois, sans toast', async () => {
    const error = vi.spyOn(toast, 'error');
    const calls = serverRefusing(1);

    const { data } = await http.post('/cga/members', { name: 'X' });

    expect(data).toEqual({ ok: true });
    expect(calls).toEqual([
      `POST ${config.apiBaseUrl}/cga/members`,
      `GET ${config.apiRootUrl.replace(/\/$/, '')}/sanctum/csrf-cookie`,
      `POST ${config.apiBaseUrl}/cga/members`,
    ]);
    expect(error).not.toHaveBeenCalled();
  });

  it('un second 419 n’est pas rejoué : il devient une erreur ordinaire, avec son toast', async () => {
    const error = vi.spyOn(toast, 'error');
    const calls = serverRefusing(2);

    await expect(http.post('/cga/members', {})).rejects.toMatchObject({
      response: { status: 419 },
    });
    expect(calls).toHaveLength(3);
    expect(error).toHaveBeenCalledOnce();
  });

  it('laisse passer les autres erreurs telles quelles', async () => {
    const other = new AxiosError('500');

    await expect(retryWithFreshCsrf(other)).rejects.toBe(other);
    await expect(retryWithFreshCsrf(new Error('code'))).rejects.toThrow('code');
  });
});
