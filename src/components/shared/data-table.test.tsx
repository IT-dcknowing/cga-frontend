import { createColumnHelper, type PaginationState, type SortingState } from '@tanstack/react-table';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DataTable } from '@/components/shared/data-table';

type Item = { id: string; name: string; amount: number };

const items: Item[] = Array.from({ length: 23 }, (_, index) => ({
  id: `item-${index + 1}`,
  name: `Adhérent ${String(index + 1).padStart(2, '0')}`,
  amount: (index + 1) * 1000,
}));

const column = createColumnHelper<Item>();
const columns = [
  column.accessor('name', { header: 'Nom' }),
  column.accessor('amount', { header: 'Montant', enableSorting: false }),
];

type HarnessProps = {
  data?: Item[];
  sortable?: boolean;
  isLoading?: boolean;
  onRowClick?: (item: Item) => void;
};

/** Joue le rôle de l'API : renvoie la page demandée. */
function Harness({ data = items, sortable = true, isLoading = false, onRowClick }: HarnessProps) {
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [sorting, setSorting] = useState<SortingState>([]);
  const start = pagination.pageIndex * pagination.pageSize;

  return (
    <DataTable
      caption="Adhérents"
      columns={columns}
      data={data.slice(start, start + pagination.pageSize)}
      rowCount={data.length}
      getRowId={(item) => item.id}
      pagination={pagination}
      onPaginationChange={setPagination}
      sorting={sorting}
      onSortingChange={sortable ? setSorting : undefined}
      isLoading={isLoading}
      onRowClick={onRowClick}
    />
  );
}

const table = () => screen.getByRole('table', { name: 'Adhérents' });
const mobileList = () => screen.getByRole('list', { name: 'Adhérents' });

describe('DataTable', () => {
  it('affiche les en-têtes et la page courante, première colonne en gras', () => {
    render(<Harness />);

    expect(within(table()).getByRole('columnheader', { name: /Nom/ })).toBeInTheDocument();
    expect(within(table()).getAllByRole('row')).toHaveLength(11);
    expect(within(table()).getByText('Adhérent 01').closest('td')).toHaveClass('font-semibold');
  });

  it('présente chaque ligne en carte sur mobile, avec le libellé de chaque colonne', () => {
    render(<Harness />);

    const [firstCard] = within(mobileList()).getAllByRole('listitem');
    expect(within(firstCard).getByText('Adhérent 01')).toBeInTheDocument();
    expect(within(firstCard).getByText('Montant')).toBeInTheDocument();
    expect(within(firstCard).getByText('1000')).toBeInTheDocument();
  });

  it('demande le tri croissant puis décroissant au clic sur un en-tête', async () => {
    render(<Harness />);

    const header = within(table()).getByRole('columnheader', { name: /Nom/ });
    expect(header).toHaveAttribute('aria-sort', 'none');

    await userEvent.click(within(header).getByRole('button'));
    expect(header).toHaveAttribute('aria-sort', 'ascending');

    await userEvent.click(within(header).getByRole('button'));
    expect(header).toHaveAttribute('aria-sort', 'descending');
  });

  it('ne propose pas de tri sur une colonne non triable ni sans gestionnaire de tri', () => {
    const { unmount } = render(<Harness />);
    const amountHeader = within(table()).getByRole('columnheader', { name: 'Montant' });
    expect(within(amountHeader).queryByRole('button')).not.toBeInTheDocument();
    expect(amountHeader).not.toHaveAttribute('aria-sort');
    unmount();

    render(<Harness sortable={false} />);
    expect(within(table()).queryAllByRole('button')).toHaveLength(0);
  });

  it('pagine : plage affichée, boutons désactivés aux extrémités', async () => {
    render(<Harness />);

    const previous = screen.getByRole('button', { name: 'Précédent' });
    const next = screen.getByRole('button', { name: 'Suivant' });
    expect(screen.getByText('1–10 sur 23')).toBeInTheDocument();
    expect(previous).toBeDisabled();

    await userEvent.click(next);
    expect(screen.getByText('11–20 sur 23')).toBeInTheDocument();
    expect(within(table()).getByText('Adhérent 11')).toBeInTheDocument();
    expect(previous).toBeEnabled();

    await userEvent.click(next);
    expect(screen.getByText('21–23 sur 23')).toBeInTheDocument();
    expect(next).toBeDisabled();

    await userEvent.click(previous);
    expect(screen.getByText('11–20 sur 23')).toBeInTheDocument();
  });

  it('affiche un message quand la liste est vide, sans pagination', () => {
    render(<Harness data={[]} />);

    expect(within(table()).getByText('Aucun résultat.')).toBeInTheDocument();
    expect(within(mobileList()).getByText('Aucun résultat.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Suivant' })).not.toBeInTheDocument();
  });

  it('affiche des squelettes pendant le chargement', () => {
    render(<Harness isLoading />);

    expect(table()).toHaveAttribute('aria-busy', 'true');
    expect(mobileList()).toHaveAttribute('aria-busy', 'true');
    expect(within(table()).getAllByRole('row')).toHaveLength(6);
    expect(within(table()).queryByText('Adhérent 01')).not.toBeInTheDocument();
    expect(screen.queryByText(/sur 23/)).not.toBeInTheDocument();
  });

  it('ouvre une ligne au clic et au clavier (Entrée, Espace)', async () => {
    const onRowClick = vi.fn();
    render(<Harness onRowClick={onRowClick} />);

    const row = within(table()).getByText('Adhérent 02').closest('tr') as HTMLElement;
    await userEvent.click(row);
    expect(onRowClick).toHaveBeenLastCalledWith(items[1]);

    row.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    expect(onRowClick).toHaveBeenCalledTimes(3);

    const [firstCard] = within(mobileList()).getAllByRole('listitem');
    await userEvent.click(firstCard);
    expect(onRowClick).toHaveBeenLastCalledWith(items[0]);
  });

  it('ne rend pas les lignes focalisables quand elles ne s’ouvrent pas', () => {
    render(<Harness />);

    expect(within(table()).getByText('Adhérent 01').closest('tr')).not.toHaveAttribute('tabindex');
  });
});
