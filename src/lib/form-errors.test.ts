import { describe, expect, it, vi } from 'vitest';
import { ApiBusinessError, ApiValidationError } from '@/lib/api-errors';
import { showValidationErrors } from '@/lib/form-errors';

type Form = { password: string; terms: boolean };

describe('showValidationErrors (03-APPFLOW §7 : 422)', () => {
  it('place chaque erreur sous son champ et donne le focus au premier', () => {
    const setError = vi.fn();
    const error = new ApiValidationError({
      password: 'Ce mot de passe est trop courant.',
      accepted_terms: 'Obligatoire.',
    });

    expect(
      showValidationErrors<Form>(error, setError, {
        password: 'password',
        accepted_terms: 'terms',
      }),
    ).toBe(true);
    expect(setError).toHaveBeenNthCalledWith(
      1,
      'password',
      { type: 'server', message: 'Ce mot de passe est trop courant.' },
      { shouldFocus: true },
    );
    expect(setError).toHaveBeenNthCalledWith(
      2,
      'terms',
      { type: 'server', message: 'Obligatoire.' },
      { shouldFocus: false },
    );
  });

  it('ignore un champ que l’écran n’affiche pas', () => {
    const setError = vi.fn();

    expect(
      showValidationErrors<Form>(new ApiValidationError({ token: 'Invalide.' }), setError, {
        password: 'password',
      }),
    ).toBe(false);
    expect(setError).not.toHaveBeenCalled();
  });

  it('laisse les autres erreurs à l’appelant', () => {
    const setError = vi.fn();

    expect(showValidationErrors<Form>(new ApiBusinessError('wrong_code'), setError, {})).toBe(
      false,
    );
    expect(showValidationErrors<Form>(new Error('réseau'), setError, {})).toBe(false);
    expect(setError).not.toHaveBeenCalled();
  });
});
