import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
} from '@/components/ui/dialog';
import { fr } from '@/lib/i18n/fr';

function Example({ description }: { description?: string }) {
  const [open, setOpen] = useState(true);

  return (
    <>
      <p>Page derrière la modale</p>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Nouveau CGA" description={description}>
          <DialogBody>
            <label htmlFor="name">Dénomination</label>
            <input id="name" />
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Annuler</Button>
            </DialogClose>
            <Button>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

describe('Dialog (04-UX-UI §6, Modal)', () => {
  it('annonce une modale avec son titre et son sous-titre', () => {
    render(<Example description="Fiche minimale" />);

    const dialog = screen.getByRole('dialog', { name: 'Nouveau CGA' });

    expect(dialog).toHaveAccessibleDescription('Fiche minimale');
    expect(dialog).toHaveClass('md:max-w-[560px]');
  });

  it('sans sous-titre, la modale n’est décrite par rien', () => {
    render(<Example />);

    expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-describedby');
  });

  it('pied : « Annuler » à gauche, action principale à droite', () => {
    render(<Example />);

    const buttons = screen.getAllByRole('button').map((button) => button.textContent);

    expect(buttons.slice(-2)).toEqual(['Annuler', 'Enregistrer']);
  });

  it('se ferme par la croix et par « Annuler »', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Example />);

    await user.click(screen.getByRole('button', { name: fr.common.close }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    unmount();

    render(<Example />);
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('se ferme par Échap', async () => {
    const user = userEvent.setup();
    render(<Example />);

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('un clic hors de la modale ne la ferme pas : la saisie n’est pas perdue', async () => {
    const user = userEvent.setup();
    render(<Example />);

    await user.type(screen.getByLabelText('Dénomination'), 'CGA du Nord');
    // Radix coupe les clics hors de la modale (`pointer-events: none`) : l'événement est envoyé
    // directement à la page, comme un clic sur le voile.
    fireEvent.pointerDown(document.body);
    fireEvent.click(document.body);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Dénomination')).toHaveValue('CGA du Nord');
  });

  it('format « aperçu » : 720 px', () => {
    render(
      <Dialog open>
        <DialogContent title="Aperçu" size="preview" />
      </Dialog>,
    );

    expect(screen.getByRole('dialog')).toHaveClass('md:max-w-[720px]');
  });
});
