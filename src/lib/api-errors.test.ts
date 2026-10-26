import { AxiosError, type AxiosResponse } from 'axios';
import { describe, expect, it } from 'vitest';
import {
  ApiBusinessError,
  ApiValidationError,
  httpStatusOf,
  toApiError,
  withApiErrors,
} from '@/lib/api-errors';

function axiosErrorWith(status: number, data: unknown = {}): AxiosError {
  return new AxiosError('refusé', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    data,
  } as AxiosResponse);
}

describe('Erreurs de l’API (02-TRD §4.3, 03-APPFLOW §7)', () => {
  it('lit le statut HTTP d’une erreur de l’API, et rien d’une panne réseau', () => {
    expect(httpStatusOf(axiosErrorWith(404))).toBe(404);
    expect(httpStatusOf(new AxiosError('réseau injoignable'))).toBeUndefined();
    expect(httpStatusOf(new Error('autre'))).toBeUndefined();
  });

  it('409 · devient un conflit métier avec son code, son détail et le message du serveur', () => {
    const error = toApiError(
      axiosErrorWith(409, {
        message: 'Code incorrect',
        code: 'wrong_code',
        details: { attempts_left: 2 },
      }),
    );

    expect(error).toBeInstanceOf(ApiBusinessError);
    expect(error).toMatchObject({
      code: 'wrong_code',
      details: { attempts_left: 2 },
      message: 'Code incorrect',
    });
  });

  it('409 · un conflit sans code ni détail reste un conflit métier', () => {
    expect(toApiError(axiosErrorWith(409, null))).toMatchObject({
      code: 'business_error',
      details: {},
    });
  });

  it('422 · garde le premier message de chaque champ', () => {
    const error = toApiError(
      axiosErrorWith(422, {
        message: 'Données invalides',
        errors: { password: ['Trop courant.', 'Trop court.'], email: 'Format.', other: [42] },
      }),
    );

    expect(error).toBeInstanceOf(ApiValidationError);
    expect((error as ApiValidationError).fields).toEqual({
      password: 'Trop courant.',
      email: 'Format.',
    });
  });

  it('422 · une réponse sans détail ne vise aucun champ', () => {
    expect((toApiError(axiosErrorWith(422, {})) as ApiValidationError).fields).toEqual({});
  });

  it('laisse passer les autres erreurs telles quelles', () => {
    const forbidden = axiosErrorWith(403);
    const network = new AxiosError('réseau injoignable');
    const plain = new Error('autre');

    expect(toApiError(forbidden)).toBe(forbidden);
    expect(toApiError(network)).toBe(network);
    expect(toApiError(plain)).toBe(plain);
  });

  it('withApiErrors renvoie le résultat ou l’erreur traduite', async () => {
    await expect(withApiErrors(() => Promise.resolve('ok'))).resolves.toBe('ok');
    await expect(
      withApiErrors(() => Promise.reject(axiosErrorWith(409, { code: 'wrong_password' }))),
    ).rejects.toMatchObject({ code: 'wrong_password' });
  });
});
