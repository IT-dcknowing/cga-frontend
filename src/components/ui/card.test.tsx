import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card, CardActions, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

describe('Card', () => {
  it('affiche le titre, les actions et le corps avec sa marge', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Dossier adhérent</CardTitle>
          <CardActions>
            <button type="button">Modifier</button>
          </CardActions>
        </CardHeader>
        <CardContent>Contenu</CardContent>
      </Card>,
    );

    expect(screen.getByRole('heading', { level: 2, name: 'Dossier adhérent' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Modifier' })).toBeInTheDocument();
    expect(screen.getByText('Contenu')).toHaveClass('p-4');
  });

  it('retire la marge du corps pour un tableau', () => {
    render(
      <Card>
        <CardContent flush>Tableau</CardContent>
      </Card>,
    );

    expect(screen.getByText('Tableau')).not.toHaveClass('p-4');
  });
});
