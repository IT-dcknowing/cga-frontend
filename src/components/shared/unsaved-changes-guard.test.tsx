import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { createMemoryRouter, Link, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { UnsavedChangesGuard } from '@/components/shared/unsaved-changes-guard';
import { fr } from '@/lib/i18n/fr';

function EditPage() {
  const [value, setValue] = useState('');

  return (
    <>
      <h1>Fiche</h1>
      <UnsavedChangesGuard when={value !== ''} />
      <input
        aria-label="Dénomination"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
        }}
      />
      <Link to="/liste">Liste</Link>
      <Link to="/fiche?onglet=utilisateurs">Utilisateurs</Link>
    </>
  );
}

function renderPages() {
  const router = createMemoryRouter(
    [
      { path: '/fiche', element: <EditPage /> },
      { path: '/liste', element: <h1>Liste</h1> },
    ],
    { initialEntries: ['/fiche'] },
  );

  render(<RouterProvider router={router} />);

  return router;
}

describe('UnsavedChangesGuard (03-APPFLOW §7, formulaire modifié non enregistré)', () => {
  it('sans modification, on quitte la page librement', async () => {
    const user = userEvent.setup();
    const router = renderPages();

    await user.click(screen.getByRole('link', { name: 'Liste' }));

    expect(router.state.location.pathname).toBe('/liste');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('formulaire modifié : quitter la page ouvre « Quitter sans enregistrer ? »', async () => {
    const user = userEvent.setup();
    const router = renderPages();

    await user.type(screen.getByLabelText('Dénomination'), 'CGA du Nord');
    await user.click(screen.getByRole('link', { name: 'Liste' }));

    expect(screen.getByRole('dialog', { name: fr.unsaved.title })).toHaveAccessibleDescription(
      fr.unsaved.body,
    );
    expect(router.state.location.pathname).toBe('/fiche');
  });

  it('« Rester sur la page » garde la saisie', async () => {
    const user = userEvent.setup();
    const router = renderPages();

    await user.type(screen.getByLabelText('Dénomination'), 'CGA du Nord');
    await user.click(screen.getByRole('link', { name: 'Liste' }));
    await user.click(screen.getByRole('button', { name: fr.unsaved.stay }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/fiche');
    expect(screen.getByLabelText('Dénomination')).toHaveValue('CGA du Nord');
  });

  it('« Quitter sans enregistrer » poursuit la navigation', async () => {
    const user = userEvent.setup();
    const router = renderPages();

    await user.type(screen.getByLabelText('Dénomination'), 'CGA du Nord');
    await user.click(screen.getByRole('link', { name: 'Liste' }));
    await user.click(screen.getByRole('button', { name: fr.unsaved.leave }));

    expect(router.state.location.pathname).toBe('/liste');
    expect(screen.getByRole('heading', { name: 'Liste' })).toBeInTheDocument();
  });

  it('Échap referme la modale sans quitter la page', async () => {
    const user = userEvent.setup();
    const router = renderPages();

    await user.type(screen.getByLabelText('Dénomination'), 'CGA');
    await user.click(screen.getByRole('link', { name: 'Utilisateurs' }));
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(router.state.location.search).toBe('');
  });

  it('formulaire modifié : recharger la page demande la confirmation du navigateur', async () => {
    const user = userEvent.setup();
    renderPages();

    const before = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(before);
    expect(before.defaultPrevented).toBe(false);

    await user.type(screen.getByLabelText('Dénomination'), 'CGA');

    const after = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(true);
  });
});
