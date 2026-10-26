import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from '@/components/shared/status-badge';

describe('StatusBadge (04-UX-UI §2.1)', () => {
  it('écrit le statut en toutes lettres avec le ton de la charte', () => {
    render(<StatusBadge domain="member" status="radiated" />);

    const badge = screen.getByText('Radié');
    expect(badge).toHaveAttribute('data-tone', 'danger');
    expect(badge).toHaveClass('bg-danger-soft', 'text-danger');
  });

  it('affiche un statut favorable en vert', () => {
    render(<StatusBadge domain="member" status="active" />);

    expect(screen.getByText('Actif')).toHaveClass('bg-primary-soft', 'text-primary-dark');
  });

  it('affiche un code inconnu tel quel, en gris', () => {
    render(<StatusBadge domain="member" status="archived" />);

    expect(screen.getByText('archived')).toHaveAttribute('data-tone', 'neutral');
  });
});
