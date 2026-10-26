import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';

describe('Banner (04-UX-UI §6)', () => {
  it('affiche le texte avec une icône décorative', () => {
    render(<Banner>Rapport en retard</Banner>);

    expect(screen.getByText('Rapport en retard')).toBeInTheDocument();
  });

  it('porte une bordure gauche de la couleur du ton', () => {
    const { container } = render(<Banner tone="danger">Bloquant</Banner>);
    const banner = container.querySelector('[data-slot="banner"]');

    expect(banner).toHaveClass('border-l-4', 'border-l-danger', 'bg-danger-soft');
  });

  it('accepte un rôle d’annonce et une action', () => {
    render(
      <Banner tone="success" role="alert" action={<Button size="sm">Voir</Button>}>
        Enregistré
      </Banner>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Enregistré');
    expect(screen.getByRole('button', { name: 'Voir' })).toBeInTheDocument();
  });
});
