import { describe, expect, it } from 'vitest';
import { fieldProps } from '@/components/ui/field-props';

describe('fieldProps (04-UX-UI §9)', () => {
  it('un champ sans aide ni erreur n’est relié à rien', () => {
    expect(fieldProps('email', undefined)).toEqual({
      id: 'email',
      'aria-invalid': false,
      'aria-describedby': undefined,
    });
  });

  it('relie l’aide, puis l’erreur, au champ', () => {
    expect(fieldProps('password', undefined, true)['aria-describedby']).toBe('password-hint');
    expect(fieldProps('password', 'Trop court.', true)).toEqual({
      id: 'password',
      'aria-invalid': true,
      'aria-describedby': 'password-hint password-error',
    });
    expect(fieldProps('code', 'Format.')['aria-describedby']).toBe('code-error');
  });
});
