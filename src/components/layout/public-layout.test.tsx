import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PublicLayout } from '@/components/layout/public-layout';
import { fr } from '@/lib/i18n/fr';

describe('PublicLayout (04-UX-UI §5.3)', () => {
  it('affiche le bandeau national, le logo et la mention du réseau', () => {
    render(<PublicLayout title="Connexion">Contenu</PublicLayout>);

    expect(screen.getByText(fr.public.banner)).toBeInTheDocument();
    expect(screen.getByText(fr.public.brand)).toBeInTheDocument();
    expect(screen.getByText(fr.public.note)).toBeInTheDocument();
  });

  it('donne un seul titre de niveau 1 et affiche son contenu', () => {
    render(<PublicLayout title="Connexion">Contenu</PublicLayout>);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Connexion' })).toBeInTheDocument();
    expect(screen.getByText('Contenu')).toBeInTheDocument();
  });
});
