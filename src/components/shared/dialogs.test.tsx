import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Building2 } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { FormDialog } from '@/components/shared/form-dialog';
import { KeyValueList } from '@/components/shared/key-value-list';
import { Button } from '@/components/ui/button';
import { fr } from '@/lib/i18n/fr';

function formDialog(overrides: Partial<Parameters<typeof FormDialog>[0]> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    title: 'Inviter un gérant',
    submitLabel: 'Envoyer l’invitation',
    submitting: false,
    onSubmit: vi.fn((event: { preventDefault: () => void }) => {
      event.preventDefault();
    }),
    children: <input aria-label="Nom" />,
    ...overrides,
  };

  render(<FormDialog {...props} />);

  return props;
}

describe('FormDialog (04-UX-UI §6)', () => {
  it('envoie le formulaire par son action principale', async () => {
    const user = userEvent.setup();
    const props = formDialog();

    await user.click(screen.getByRole('button', { name: 'Envoyer l’invitation' }));

    expect(props.onSubmit).toHaveBeenCalledOnce();
  });

  it('« Annuler » ferme la modale', async () => {
    const user = userEvent.setup();
    const props = formDialog();

    await user.click(screen.getByRole('button', { name: fr.common.cancel }));

    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('pendant l’envoi : boutons désactivés, la modale ne se ferme pas', async () => {
    const user = userEvent.setup();
    const props = formDialog({ submitting: true });

    expect(screen.getByRole('button', { name: 'Envoyer l’invitation' })).toBeDisabled();
    expect(screen.getByRole('button', { name: fr.common.cancel })).toBeDisabled();

    await user.keyboard('{Escape}');

    expect(props.onOpenChange).not.toHaveBeenCalled();
  });

  it('03-APPFLOW §7 · conflit 409 : le message de l’API en bandeau dans la modale', () => {
    formDialog({ conflict: 'Cette personne a déjà cet accès.' });

    expect(screen.getByRole('alert')).toHaveTextContent('Cette personne a déjà cet accès.');
  });
});

describe('ConfirmDialog (04-UX-UI §6)', () => {
  it('liste les effets et confirme par un bouton danger', () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Suspendre le CGA"
        effects={['Ses agents ne pourront plus que consulter.', 'La suspension est tracée.']}
        submitLabel="Confirmer la suspension"
        submitting={false}
        onSubmit={vi.fn()}
      >
        <input aria-label="Motif" />
      </ConfirmDialog>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Suspendre le CGA' });

    expect(within(dialog).getByText(fr.common.effects)).toBeInTheDocument();
    expect(
      within(dialog)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Ses agents ne pourront plus que consulter.', 'La suspension est tracée.']);
    expect(within(dialog).getByRole('button', { name: 'Confirmer la suspension' })).toHaveClass(
      'bg-danger',
    );
    expect(within(dialog).getByLabelText('Motif')).toBeInTheDocument();
  });
});

describe('EmptyState (04-UX-UI §6)', () => {
  it('icône, phrase et action principale', () => {
    render(
      <EmptyState icon={Building2} action={<Button>Enregistrer un CGA</Button>}>
        Aucun CGA dans le registre pour l’instant.
      </EmptyState>,
    );

    expect(screen.getByText('Aucun CGA dans le registre pour l’instant.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enregistrer un CGA' })).toBeInTheDocument();
  });
});

describe('KeyValueList (04-UX-UI §7)', () => {
  it('étiquette à gauche, valeur à droite ; une valeur absente est « Non renseigné »', () => {
    render(
      <KeyValueList
        items={[
          { label: 'Ville', value: 'Abidjan' },
          { label: 'Adresse', value: null },
          { label: 'E-mail', value: '' },
        ]}
      />,
    );

    const terms = screen.getAllByRole('term').map((term) => term.textContent);
    const values = screen.getAllByRole('definition').map((value) => value.textContent);

    expect(terms).toEqual(['Ville', 'Adresse', 'E-mail']);
    expect(values).toEqual(['Abidjan', fr.common.notProvided, fr.common.notProvided]);
  });
});
