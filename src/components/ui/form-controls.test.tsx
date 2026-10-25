import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Radio, RadioGroupField, RadioOption } from '@/components/ui/radio';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TextField } from '@/components/ui/text-field';
import { Textarea } from '@/components/ui/textarea';

describe('TextField (04-UX-UI §6, §9)', () => {
  it('relie libellé, aide et erreur au champ, avec l’astérisque d’un champ obligatoire', () => {
    render(
      <TextField
        id="city"
        label="Ville"
        required
        hint="Siège du CGA"
        error="Renseignez la ville."
      />,
    );

    const field = screen.getByRole('textbox', { name: /Ville/ });

    expect(field).toHaveAttribute('aria-required', 'true');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription('Siège du CGA Renseignez la ville.');
  });

  it('un champ facultatif sans erreur n’est ni requis ni invalide', () => {
    render(<TextField id="email" label="E-mail" type="email" />);

    const field = screen.getByRole('textbox', { name: 'E-mail' });

    expect(field).not.toHaveAttribute('aria-required');
    expect(field).toHaveAttribute('aria-invalid', 'false');
    expect(field).toHaveAttribute('type', 'email');
  });
});

describe('Select, Textarea, Skeleton', () => {
  it('liste déroulante native, bordure danger en erreur', () => {
    render(
      <Select aria-label="Statut" aria-invalid>
        <option value="">Tous</option>
      </Select>,
    );

    expect(screen.getByRole('combobox', { name: 'Statut' })).toHaveClass(
      'aria-[invalid=true]:border-danger',
    );
  });

  it('zone de texte pour un motif', async () => {
    const user = userEvent.setup();
    render(<Textarea aria-label="Motif" />);

    await user.type(screen.getByRole('textbox', { name: 'Motif' }), 'Rapport non transmis');

    expect(screen.getByRole('textbox', { name: 'Motif' })).toHaveValue('Rapport non transmis');
  });

  it('squelette animé', () => {
    const { container } = render(<Skeleton className="h-8" />);

    expect(container.firstChild).toHaveClass('animate-pulse', 'h-8');
  });
});

describe('RadioGroupField', () => {
  it('groupe nommé par sa légende ; l’erreur décrit le groupe', async () => {
    const user = userEvent.setup();
    render(
      <RadioGroupField id="agreement" legend="Statut d’agrément" required error="Choisissez.">
        <RadioOption label="En cours">
          <Radio name="agreement" value="pending" />
        </RadioOption>
        <RadioOption label="Agréé">
          <Radio name="agreement" value="granted" />
        </RadioOption>
      </RadioGroupField>,
    );

    const group = screen.getByRole('group', { name: /Statut d’agrément/ });

    expect(group).toHaveAccessibleDescription('Choisissez.');

    await user.click(screen.getByRole('radio', { name: 'Agréé' }));

    expect(screen.getByRole('radio', { name: 'Agréé' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'En cours' })).not.toBeChecked();
  });
});

describe('Tabs (04-UX-UI §6)', () => {
  function Example() {
    return (
      <Tabs defaultValue="identity">
        <TabsList>
          <TabsTrigger value="identity">Identité</TabsTrigger>
          <TabsTrigger value="users">Utilisateurs</TabsTrigger>
        </TabsList>
        <TabsContent value="identity" forceMount>
          <input aria-label="Dénomination" />
        </TabsContent>
        <TabsContent value="users">Liste des utilisateurs</TabsContent>
      </Tabs>
    );
  }

  it('l’onglet actif est souligné en primary ; un clic change d’onglet', async () => {
    const user = userEvent.setup();
    render(<Example />);

    expect(screen.getByRole('tab', { name: 'Identité' })).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByRole('tab', { name: 'Utilisateurs' }));

    expect(screen.getByRole('tabpanel', { name: 'Utilisateurs' })).toHaveTextContent(
      'Liste des utilisateurs',
    );
    // L'onglet monté d'office reste dans la page, caché par le CSS (`data-[state=inactive]:hidden`).
    expect(screen.getByRole('tabpanel', { name: 'Identité' })).toHaveAttribute(
      'data-state',
      'inactive',
    );
    expect(screen.getByRole('tab', { name: 'Utilisateurs' })).toHaveClass(
      'data-[state=active]:border-primary',
    );
  });

  it('les flèches du clavier passent d’un onglet à l’autre', async () => {
    const user = userEvent.setup();
    render(<Example />);

    await user.click(screen.getByRole('tab', { name: 'Identité' }));
    await user.keyboard('{ArrowRight}');

    expect(screen.getByRole('tab', { name: 'Utilisateurs' })).toHaveFocus();
  });

  it('un onglet monté d’office garde sa saisie quand on le quitte', async () => {
    const user = userEvent.setup();
    render(<Example />);

    await user.type(screen.getByLabelText('Dénomination'), 'CGA du Nord');
    await user.click(screen.getByRole('tab', { name: 'Utilisateurs' }));
    await user.click(screen.getByRole('tab', { name: 'Identité' }));

    expect(screen.getByLabelText('Dénomination')).toHaveValue('CGA du Nord');
  });
});
