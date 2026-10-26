import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ActionMenu } from '@/components/shared/action-menu';

/* Menu « ⋯ » des actions d'une fiche (04-UX-UI §6). */
describe('ActionMenu', () => {
  it('ouvre la liste, lance l’action choisie et se referme', async () => {
    const user = userEvent.setup();
    const regime = vi.fn();

    render(
      <ActionMenu
        label="Actions"
        items={[
          { label: 'Changer de régime', onSelect: regime },
          { label: 'Supprimer le brouillon', onSelect: vi.fn(), danger: true },
        ]}
      />,
    );

    const button = screen.getByRole('button', { name: 'Actions' });

    expect(button).toHaveAttribute('aria-expanded', 'false');
    await user.click(button);
    expect(screen.getByRole('menuitem', { name: 'Supprimer le brouillon' })).toHaveClass(
      'text-danger',
    );

    await user.click(screen.getByRole('menuitem', { name: 'Changer de régime' }));

    expect(regime).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('se ferme par Échap ou un clic à côté', async () => {
    const user = userEvent.setup();

    const { container } = render(
      <ActionMenu label="Actions" items={[{ label: 'Valider', onSelect: vi.fn() }]} />,
    );

    await user.click(screen.getByRole('button', { name: 'Actions' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Actions' }));
    await user.click(container.querySelector('button[tabindex="-1"]') as HTMLElement);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('sans action permise, rien n’est affiché', () => {
    const { container } = render(<ActionMenu label="Actions" items={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
