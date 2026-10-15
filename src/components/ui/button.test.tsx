import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/button';

describe('Button', () => {
  it('est un bouton qui ne soumet pas de formulaire par défaut', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Valider l’adhésion</Button>);

    const button = screen.getByRole('button', { name: 'Valider l’adhésion' });
    await userEvent.click(button);

    expect(button).toHaveAttribute('type', 'button');
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('garde le type demandé', () => {
    render(<Button type="submit">Enregistrer</Button>);

    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });

  it('pendant le chargement : libellé conservé, bouton désactivé et occupé', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Enregistrement
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Enregistrement' });
    await userEvent.click(button);

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(onClick).not.toHaveBeenCalled();
  });

  it('applique les styles de la variante et de la taille, 44 px minimum sur mobile', () => {
    render(
      <Button variant="danger" size="sm">
        Valider la radiation
      </Button>,
    );

    expect(screen.getByRole('button')).toHaveClass('bg-danger', 'h-11', 'md:h-8');
  });

  it('peut habiller un lien', () => {
    render(
      <Button asChild variant="link">
        <a href="/adherents">Voir le dossier</a>
      </Button>,
    );

    const link = screen.getByRole('link', { name: 'Voir le dossier' });
    expect(link).toHaveAttribute('href', '/adherents');
    expect(link).not.toHaveAttribute('type');
    expect(link).toHaveClass('text-primary', 'h-auto', 'md:h-auto');
    expect(link).not.toHaveClass('h-11');
  });
});
