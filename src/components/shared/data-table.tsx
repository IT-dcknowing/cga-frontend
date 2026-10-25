import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type OnChangeFn,
  type PaginationState,
  type Row,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatNumber } from '@/lib/format';
import { fr } from '@/lib/i18n/fr';
import { cn } from '@/lib/utils';

type DataTableProps<TData> = {
  // Les colonnes ont des types de valeur différents : `any` est le type prévu par TanStack Table ici.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<TData, any>[];
  /** Lignes de la page courante, déjà triées et paginées par l'API. */
  data: TData[];
  /** Nombre total de lignes, toutes pages confondues. */
  rowCount: number;
  pagination: PaginationState;
  onPaginationChange: OnChangeFn<PaginationState>;
  /** Sans `onSortingChange`, les en-têtes ne sont pas cliquables. */
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  isLoading?: boolean;
  onRowClick?: (row: TData) => void;
  getRowId?: (row: TData) => string;
  /** Titre lu par les lecteurs d'écran. */
  caption: string;
  empty?: ReactNode;
};

const SKELETON_ROWS = 5;

/**
 * Tableau paginé, trié et filtré côté serveur (02-TRD §5.1, 04-UX-UI §6) ;
 * sous 768 px, il devient une liste de cartes (04-UX-UI §5.2).
 */
export function DataTable<TData>({
  columns,
  data,
  rowCount,
  pagination,
  onPaginationChange,
  sorting = [],
  onSortingChange,
  isLoading = false,
  onRowClick,
  getRowId,
  caption,
  empty = fr.table.empty,
}: DataTableProps<TData>) {
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table n'est pas compatible avec la mémoïsation automatique.
  const table = useReactTable({
    data,
    columns,
    getRowId,
    rowCount,
    state: { pagination, sorting },
    onPaginationChange,
    onSortingChange,
    enableSorting: onSortingChange !== undefined,
    enableMultiSort: false,
    manualPagination: true,
    manualSorting: true,
    getCoreRowModel: getCoreRowModel(),
  });

  const rows = table.getRowModel().rows;
  const columnCount = table.getVisibleLeafColumns().length;
  const skeletonCount = Math.min(pagination.pageSize, SKELETON_ROWS);

  const rowProps = (row: Row<TData>) =>
    onRowClick
      ? {
          tabIndex: 0,
          onClick: () => onRowClick(row.original),
          onKeyDown: (event: KeyboardEvent) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onRowClick(row.original);
            }
          },
        }
      : {};

  return (
    <div data-slot="data-table">
      <table
        className="hidden w-full border-collapse text-table tabular-nums md:table"
        aria-busy={isLoading || undefined}
      >
        <caption className="sr-only">{caption}</caption>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  scope="col"
                  aria-sort={ariaSort(header.column)}
                  className="border-b border-border bg-bg px-3 py-2 text-left text-[0.75rem] font-bold uppercase tracking-[0.04em] text-muted"
                >
                  {header.isPlaceholder ? null : header.column.getCanSort() ? (
                    <button
                      type="button"
                      onClick={header.column.getToggleSortingHandler()}
                      title={fr.table.sortBy(columnLabel(header.column))}
                      className="inline-flex items-center gap-1 uppercase hover:text-ink"
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      <SortIcon column={header.column} />
                    </button>
                  ) : (
                    flexRender(header.column.columnDef.header, header.getContext())
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {isLoading ? (
            Array.from({ length: skeletonCount }, (_, index) => (
              <tr key={index} className="h-12 border-b border-border">
                {Array.from({ length: columnCount }, (__, cell) => (
                  <td key={cell} className="px-3 py-2">
                    <Skeleton />
                  </td>
                ))}
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columnCount} className="px-3 py-10 text-center text-muted">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.id}
                {...rowProps(row)}
                className={cn(
                  'h-12 border-b border-border last:border-b-0',
                  onRowClick && 'cursor-pointer hover:bg-primary-soft/40',
                )}
              >
                {row.getVisibleCells().map((cell, index) => (
                  <td
                    key={cell.id}
                    className={cn('px-3 py-2 align-middle', index === 0 && 'font-semibold')}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>

      <ul
        className="divide-y divide-border md:hidden"
        aria-label={caption}
        aria-busy={isLoading || undefined}
      >
        {isLoading ? (
          Array.from({ length: skeletonCount }, (_, index) => (
            <li key={index} className="space-y-2 p-4">
              <Skeleton />
              <Skeleton className="w-1/2" />
            </li>
          ))
        ) : rows.length === 0 ? (
          <li className="px-4 py-10 text-center text-muted">{empty}</li>
        ) : (
          rows.map((row) => {
            const [first, ...others] = row.getVisibleCells();

            return (
              <li
                key={row.id}
                {...rowProps(row)}
                className={cn(
                  'space-y-1 p-4',
                  onRowClick && 'cursor-pointer hover:bg-primary-soft/40',
                )}
              >
                <div className="font-bold">
                  {flexRender(first.column.columnDef.cell, first.getContext())}
                </div>
                {others.map((cell) => (
                  <div key={cell.id} className="flex items-center justify-between gap-3 text-table">
                    <span className="text-muted">{columnLabel(cell.column)}</span>
                    <span className="text-right">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </span>
                  </div>
                ))}
              </li>
            );
          })
        )}
      </ul>

      {!isLoading && rowCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-2 text-label text-muted">
          <span>
            {fr.table.range(
              formatNumber(pagination.pageIndex * pagination.pageSize + 1),
              formatNumber(Math.min((pagination.pageIndex + 1) * pagination.pageSize, rowCount)),
              formatNumber(rowCount),
            )}
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft aria-hidden="true" />
              {fr.table.previous}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              {fr.table.next}
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ariaSort<TData>(column: Column<TData>): 'ascending' | 'descending' | 'none' | undefined {
  if (!column.getCanSort()) {
    return undefined;
  }

  const direction = column.getIsSorted();

  return direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none';
}

function SortIcon<TData>({ column }: { column: Column<TData> }) {
  const direction = column.getIsSorted();
  const Icon = direction === 'asc' ? ArrowUp : direction === 'desc' ? ArrowDown : ArrowUpDown;

  return <Icon className={cn('size-3.5', !direction && 'opacity-40')} aria-hidden="true" />;
}

/** Libellé d'une colonne pour la liste mobile et les infobulles : son en-tête s'il est un texte. */
function columnLabel<TData>(column: Column<TData>): string {
  const header = column.columnDef.header;

  return typeof header === 'string' ? header : column.id;
}
