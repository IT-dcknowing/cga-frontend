import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';

describe('FormField (04-UX-UI §6)', () => {
  it('relie le libellé au champ', () => {
    render(
      <FormField id="phone" label="Téléphone">
        <Input id="phone" />
      </FormField>,
    );

    expect(screen.getByLabelText('Téléphone')).toHaveAttribute('id', 'phone');
  });

  it('marque un champ obligatoire d’un astérisque décoratif', () => {
    const { container } = render(
      <FormField id="phone" label="Téléphone" required>
        <Input id="phone" />
      </FormField>,
    );

    expect(container.querySelector('[aria-hidden="true"]')).toHaveClass('text-danger');
  });

  it('affiche l’aide et l’erreur sous le champ, aux identifiants attendus', () => {
    render(
      <FormField id="phone" label="Téléphone" hint="Format local" error="Numéro invalide">
        <Input id="phone" aria-invalid aria-describedby="phone-error" />
      </FormField>,
    );

    expect(screen.getByText('Format local')).toHaveAttribute('id', 'phone-hint');
    expect(screen.getByText('Numéro invalide')).toHaveAttribute('id', 'phone-error');
    expect(screen.getByLabelText(/Téléphone/)).toHaveAccessibleDescription('Numéro invalide');
  });
});
