import {
  AxiosError,
  CanceledError,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { toast } from 'sonner';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginError } from '@/features/auth/api/auth-api';
import {
  errorToastFor,
  toastApiError,
  toastUnexpectedError,
  wasNotified,
} from '@/lib/http-error-toast';
import { http } from '@/lib/http';
import { fr } from '@/lib/i18n/fr';

afterEach(() => {
  vi.restoreAllMocks();
});

function requestConfig(
  overrides: Partial<InternalAxiosRequestConfig> = {},
): InternalAxiosRequestConfig {
  return { method: 'get', url: '/ref/regimes', ...overrides } as InternalAxiosRequestConfig;
}

function failure(
  status: number | undefined,
  data: unknown = {},
  config: InternalAxiosRequestConfig = requestConfig(),
): AxiosError {
  return new AxiosError(
    'refusé',
    status === undefined ? 'ERR_NETWORK' : 'ERR_BAD_RESPONSE',
    config,
    undefined,
    status === undefined ? undefined : ({ status, data, config } as AxiosResponse),
  );
}

describe('errorToastFor (03-APPFLOW §7)', () => {
  it.each([
    [500, fr.errors.http.server],
    [502, fr.errors.http.server],
    [503, fr.errors.http.serviceUnavailable],
    [404, fr.errors.http.notFound],
    [403, fr.errors.http.forbidden],
    [405, fr.errors.http.methodNotAllowed],
    [419, fr.errors.http.csrfExpired],
    [429, fr.errors.http.tooManyRequests],
    [400, fr.errors.http.badRequest],
    [418, fr.errors.unexpected],
  ])('donne un titre clair pour un statut %i', (status, title) => {
    expect(errorToastFor(failure(status))?.title).toBe(title);
  });

  it('signale un serveur injoignable', () => {
    expect(errorToastFor(failure(undefined))?.title).toBe(fr.errors.http.network);
  });

  it('reprend le message et le code de l’API en description', () => {
    const toastShown = errorToastFor(
      failure(403, { message: 'Choisissez un espace de travail.', code: 'space_required' }),
    );

    expect(toastShown?.description).toBe('Choisissez un espace de travail. [space_required]');
  });

  it('ne répète pas un message identique au titre, et coupe un message trop long', () => {
    expect(
      errorToastFor(failure(404, { message: 'Ressource introuvable.', code: 'not_found' }))
        ?.description,
    ).toBe('[not_found]');

    const long = errorToastFor(failure(500, { message: 'x'.repeat(500) }))?.description ?? '';

    expect(long).toHaveLength(201);
    expect(long.endsWith('…')).toBe(true);
  });

  it('ne montre jamais la trace d’une erreur serveur', () => {
    const shown = errorToastFor(
      failure(500, {
        message: 'SQLSTATE',
        exception: 'QueryException',
        trace: [{ file: 'a.php' }],
      }),
    );

    expect(JSON.stringify(shown)).not.toContain('QueryException');
    expect(JSON.stringify(shown)).not.toContain('a.php');
  });

  it.each([401, 409, 422])('laisse le statut %i à l’écran (session, conflit, champs)', (status) => {
    expect(errorToastFor(failure(status))).toBeNull();
  });

  it('respecte les statuts exclus par la requête, ou toutes les erreurs avec true', () => {
    const skipped = requestConfig({ skipErrorToast: [403, 429] });

    expect(errorToastFor(failure(403, {}, skipped))).toBeNull();
    expect(errorToastFor(failure(500, {}, skipped))).not.toBeNull();
    expect(errorToastFor(failure(500, {}, requestConfig({ skipErrorToast: true })))).toBeNull();
  });

  it('ignore une requête annulée et une erreur qui ne vient pas de l’API', () => {
    expect(errorToastFor(new CanceledError())).toBeNull();
    expect(errorToastFor(new Error('bogue'))).toBeNull();
  });

  it('donne le même identifiant à la même erreur, pour ne pas empiler les toasts', () => {
    expect(errorToastFor(failure(500))?.id).toBe(errorToastFor(failure(500))?.id);
    expect(errorToastFor(failure(500))?.id).not.toBe(errorToastFor(failure(404))?.id);
  });
});

describe('toastApiError et toastUnexpectedError : un seul toast par erreur', () => {
  it('affiche le toast puis relance l’erreur d’origine', async () => {
    const shown = vi.spyOn(toast, 'error');
    const error = failure(500, { message: 'Erreur', code: 'server_error' });

    await expect(toastApiError(error)).rejects.toBe(error);

    expect(shown).toHaveBeenCalledWith(fr.errors.http.server, {
      id: 'api-500-GET-/ref/regimes',
      description: 'Erreur [server_error]',
    });
    expect(wasNotified(error)).toBe(true);
  });

  it('l’écran n’ajoute pas son toast générique à une erreur déjà signalée, même enveloppée', async () => {
    const error = failure(500);
    await toastApiError(error).catch(() => undefined);
    const shown = vi.spyOn(toast, 'error');

    toastUnexpectedError(error);
    toastUnexpectedError(new LoginError('unexpected', { cause: error }));

    expect(shown).not.toHaveBeenCalled();
  });

  it('l’écran affiche son toast générique pour une erreur non signalée', () => {
    const shown = vi.spyOn(toast, 'error');

    toastUnexpectedError(new Error('bouchon'));
    toastUnexpectedError(failure(422));

    expect(shown).toHaveBeenCalledTimes(2);
    expect(shown).toHaveBeenCalledWith(fr.errors.unexpected);
  });

  it('03-APPFLOW §7 · aucun toast générique pour une session expirée (401), même enveloppée', () => {
    const shown = vi.spyOn(toast, 'error');
    const expired = failure(401, { code: 'unauthenticated' });

    toastUnexpectedError(expired);
    toastUnexpectedError(new LoginError('unexpected', { cause: expired }));

    expect(shown).not.toHaveBeenCalled();

    toastUnexpectedError(new LoginError('unexpected', { cause: failure(403) }));

    expect(shown).toHaveBeenCalledTimes(1);
  });

  it('est branché sur les réponses du client de l’API', async () => {
    const shown = vi.spyOn(toast, 'error');

    await expect(
      http.get('/route-inconnue', {
        adapter: (config) =>
          Promise.reject(
            new AxiosError('introuvable', 'ERR_BAD_REQUEST', config, undefined, {
              status: 404,
              data: { message: 'Ressource introuvable.', code: 'not_found' },
              config,
            } as AxiosResponse),
          ),
      }),
    ).rejects.toBeInstanceOf(AxiosError);

    expect(shown).toHaveBeenCalledTimes(1);
    expect(shown).toHaveBeenCalledWith(fr.errors.http.notFound, {
      id: 'api-404-GET-/route-inconnue',
      description: '[not_found]',
    });
  });
});
