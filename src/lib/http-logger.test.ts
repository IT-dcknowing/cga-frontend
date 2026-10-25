import axios, { AxiosError, type AxiosAdapter, type AxiosResponse } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import {
  attachApiLogger,
  MASK,
  maskSecrets,
  REQUEST_SECRETS,
  RESPONSE_SECRETS,
  type ConsoleOutput,
} from '@/lib/http-logger';

function fakeConsole() {
  return {
    groupCollapsed: vi.fn(),
    groupEnd: vi.fn(),
    log: vi.fn(),
    error: vi.fn(),
  } satisfies ConsoleOutput;
}

/** Client de test : même configuration que l'application, réponses simulées par l'adaptateur. */
function clientAnswering(adapter: AxiosAdapter) {
  const client = axios.create({ baseURL: '/api/v1', adapter });
  const output = fakeConsole();

  attachApiLogger(client, output);

  return { client, output };
}

function answer(status: number, data: unknown): AxiosAdapter {
  return (config) =>
    Promise.resolve({ data, status, statusText: '', headers: {}, config } as AxiosResponse);
}

function allLogged(output: ReturnType<typeof fakeConsole>): string {
  return JSON.stringify([
    output.groupCollapsed.mock.calls,
    output.log.mock.calls,
    output.error.mock.calls,
  ]);
}

describe('maskSecrets (02-TRD §6.5 : jamais de secret en clair dans un journal)', () => {
  it('masque mots de passe, codes et jetons, à toute profondeur', () => {
    const body = {
      phone: '0700000002',
      password: 'secret1',
      nested: { current_password: 'secret2', items: [{ code: '123456', token: 'abc' }] },
    };

    expect(maskSecrets(body, REQUEST_SECRETS)).toEqual({
      phone: '0700000002',
      password: MASK,
      nested: { current_password: MASK, items: [{ code: MASK, token: MASK }] },
    });
  });

  it('ne modifie pas l’objet d’origine', () => {
    const body = { password: 'secret' };

    maskSecrets(body, REQUEST_SECRETS);

    expect(body.password).toBe('secret');
  });

  it('garde le code d’erreur d’une réponse, mais masque un jeton', () => {
    expect(maskSecrets({ code: 'validation_failed', token: '1|abc' }, RESPONSE_SECRETS)).toEqual({
      code: 'validation_failed',
      token: MASK,
    });
  });
});

describe('attachApiLogger (journal de la console)', () => {
  it('ouvre un groupe vert par appel réussi : méthode, adresse, statut et durée', async () => {
    const { client, output } = clientAnswering(answer(200, { data: { id: 1 } }));

    await client.get('/me');

    expect(output.groupCollapsed).toHaveBeenCalledTimes(1);
    expect(output.groupCollapsed.mock.calls[0][0]).toMatch(
      /^%c✔ GET \/api\/v1\/me → 200 \(\d+ ms\)$/,
    );
    expect(output.log).toHaveBeenCalledWith('Réponse', { data: { id: 1 } });
    expect(output.groupEnd).toHaveBeenCalledTimes(1);
  });

  it('affiche le corps de la requête avec le mot de passe masqué', async () => {
    const { client, output } = clientAnswering(answer(200, {}));

    await client.post('/auth/login', { phone: '0700000002', password: 'password' });

    expect(output.log).toHaveBeenCalledWith('Requête', {
      method: 'POST',
      url: '/api/v1/auth/login',
      body: { phone: '0700000002', password: MASK },
    });
    expect(allLogged(output)).not.toContain('"password":"password"');
  });

  it('n’affiche jamais les en-têtes (cookies, jeton CSRF)', async () => {
    const { client, output } = clientAnswering(answer(200, {}));

    await client.post('/auth/logout', undefined, { headers: { 'X-XSRF-TOKEN': 'jeton-csrf' } });

    expect(allLogged(output)).not.toContain('jeton-csrf');
  });

  it('ouvre un groupe rouge pour un échec, avec le corps de l’erreur, puis relance l’erreur', async () => {
    const failure = { message: 'Server Error', exception: 'QueryException', line: 42 };
    const { client, output } = clientAnswering((config) =>
      Promise.reject(
        new AxiosError('Request failed', 'ERR_BAD_RESPONSE', config, undefined, {
          status: 500,
          data: failure,
          config,
        } as AxiosResponse),
      ),
    );

    await expect(client.get('/ref/regimes')).rejects.toBeInstanceOf(AxiosError);

    expect(output.groupCollapsed.mock.calls[0][0]).toMatch(
      /^%c✖ GET \/api\/v1\/ref\/regimes → 500/,
    );
    expect(output.error).toHaveBeenCalledWith('Réponse', failure);
  });

  it('signale un serveur injoignable comme une erreur réseau', async () => {
    const { client, output } = clientAnswering((config) =>
      Promise.reject(new AxiosError('Network Error', 'ERR_NETWORK', config)),
    );

    await expect(client.get('/me')).rejects.toBeInstanceOf(AxiosError);

    expect(output.groupCollapsed.mock.calls[0][0]).toContain('→ réseau (Network Error)');
  });
});
