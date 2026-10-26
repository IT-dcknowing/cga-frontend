import { createColumnHelper, type PaginationState, type SortingState } from '@tanstack/react-table';
import { Download, Pencil } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable } from '@/components/shared/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardActions, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { demoMembers, type DemoMember } from '@/features/demo/demo-members';
import { formatAmount, formatDate } from '@/lib/format';
import { fr } from '@/lib/i18n/fr';

const column = createColumnHelper<DemoMember>();

const columns = [
  column.accessor('companyName', { header: fr.demo.columns.companyName }),
  column.accessor('number', { header: fr.demo.columns.number, enableSorting: false }),
  column.accessor('adhesionDate', {
    header: fr.demo.columns.adhesionDate,
    cell: (info) => formatDate(info.getValue()),
  }),
  column.accessor('regime', {
    header: fr.demo.columns.regime,
    enableSorting: false,
    cell: (info) => <StatusBadge domain="regime" status={info.getValue()} />,
  }),
  column.accessor('status', {
    header: fr.demo.columns.status,
    enableSorting: false,
    cell: (info) => <StatusBadge domain="member" status={info.getValue()} />,
  }),
  column.accessor('feesAmount', {
    header: fr.demo.columns.fees,
    cell: (info) => formatAmount(info.getValue()),
  }),
  column.accessor('pieces', {
    header: fr.demo.columns.pieces,
    enableSorting: false,
    cell: (info) => <StatusBadge domain="pieces" status={info.getValue()} />,
  }),
];

/** Page de démonstration de l'étape 0.4 (06-IMPLEMENTATION-PLAN) : composants conformes à la maquette. */
export function DemoPage() {
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [sorting, setSorting] = useState<SortingState>([]);

  // Simule le tri et la pagination que fera l'API.
  const page = useMemo(() => {
    const [sort] = sorting;
    const sorted = sort
      ? [...demoMembers].sort((a, b) => {
          const key = sort.id as keyof DemoMember;
          const order = a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0;

          return sort.desc ? -order : order;
        })
      : demoMembers;
    const start = pagination.pageIndex * pagination.pageSize;

    return sorted.slice(start, start + pagination.pageSize);
  }, [pagination, sorting]);

  return (
    <main className="mx-auto max-w-[1280px] space-y-6 px-4 py-6 md:px-6">
      <header>
        <h1 className="text-[1.25rem] leading-7 font-extrabold md:text-page-title">
          {fr.demo.title}
        </h1>
        <div className="mt-2 h-1 w-10 rounded-full bg-accent" aria-hidden="true" />
        <p className="mt-3 text-note text-muted">{fr.demo.intro}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{fr.demo.buttons}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button>{fr.demo.buttonPrimary}</Button>
          <Button variant="secondary">{fr.demo.buttonSecondary}</Button>
          <Button variant="danger">{fr.demo.buttonDanger}</Button>
          <Button variant="link">{fr.demo.buttonLink}</Button>
          <Button size="sm" variant="secondary">
            <Download aria-hidden="true" />
            {fr.demo.buttonSmall}
          </Button>
          <Button loading>{fr.demo.buttonLoading}</Button>
          <Button disabled>{fr.demo.buttonDisabled}</Button>
          <Button variant="secondary" onClick={() => toast.success(fr.demo.toastMessage)}>
            {fr.demo.toast}
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{fr.demo.cardTitle}</CardTitle>
            <CardActions>
              <Button size="sm" variant="secondary">
                <Pencil aria-hidden="true" />
                {fr.demo.cardAction}
              </Button>
            </CardActions>
          </CardHeader>
          <CardContent>
            <p>{fr.demo.cardBody}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{fr.demo.statuses}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <StatusBadge domain="member" status="active" />
            <StatusBadge domain="member" status="draft" />
            <StatusBadge domain="member" status="radiation_pending" />
            <StatusBadge domain="member" status="radiated" />
            <StatusBadge domain="member" status="closed" />
            <StatusBadge domain="pieces" status="pending" />
            <StatusBadge domain="regime" status="RME" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{fr.demo.table}</CardTitle>
        </CardHeader>
        <CardContent flush>
          <DataTable
            caption={fr.demo.table}
            columns={columns}
            data={page}
            rowCount={demoMembers.length}
            getRowId={(member) => member.id}
            pagination={pagination}
            onPaginationChange={setPagination}
            sorting={sorting}
            onSortingChange={setSorting}
            onRowClick={(member) => toast(fr.demo.selected(member.companyName))}
          />
        </CardContent>
      </Card>
    </main>
  );
}
