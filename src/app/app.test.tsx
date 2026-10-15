import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/providers';
import { routes } from '@/app/router';

function renderApp() {
  const router = createMemoryRouter(routes, { initialEntries: ['/'] });

  return render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  );
}

describe('Application (étape 0.4)', () => {
  it('affiche la page de démonstration à la racine', () => {
    renderApp();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Composants de base' }),
    ).toBeInTheDocument();
  });

  it('montre un message éphémère', async () => {
    renderApp();

    await userEvent.click(screen.getByRole('button', { name: 'Afficher un message' }));

    expect(await screen.findByText('Adhésion validée — n° 2026-DEMO-0143')).toBeInTheDocument();
  });

  it('trie et pagine le tableau des adhérents comme le fera l’API', async () => {
    renderApp();
    const table = screen.getByRole('table', { name: 'Tableau des adhérents' });

    expect(screen.getByText('1–10 sur 28')).toBeInTheDocument();
    expect(within(table).getAllByRole('row')).toHaveLength(11);

    // Un montant se trie d'abord du plus élevé au plus faible, puis l'inverse.
    const feesHeader = within(table).getByRole('button', { name: /Honoraires/ });
    const firstRowFees = () =>
      within(within(table).getAllByRole('row')[1]).getByText(/\d+\s000\sF/);
    await userEvent.click(feesHeader);
    expect(firstRowFees()).toHaveTextContent(/^35\s000\sF$/);
    await userEvent.click(feesHeader);
    expect(firstRowFees()).toHaveTextContent(/^15\s000\sF$/);

    await userEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    expect(screen.getByText('11–20 sur 28')).toBeInTheDocument();
  });

  it('ouvre un dossier au clic sur une ligne', async () => {
    renderApp();
    const table = screen.getByRole('table', { name: 'Tableau des adhérents' });

    await userEvent.click(within(table).getByText('BOULANGERIE DU PLATEAU'));

    expect(await screen.findByText('Dossier ouvert : BOULANGERIE DU PLATEAU')).toBeInTheDocument();
  });
});
