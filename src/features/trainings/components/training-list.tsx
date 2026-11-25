import { useQuery } from '@tanstack/react-query';
import type { ColumnDef, PaginationState, Updater } from '@tanstack/react-table';
import { GraduationCap } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { DataTable } from '@/components/shared/data-table';
import { EmptyState } from '@/components/shared/empty-state';
import { SegmentedControl } from '@/components/shared/segmented-control';
import { StatusBadge } from '@/components/shared/status-badge';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  trainingKeys,
  trainingsApi,
  type Training,
  type TrainingPeriod,
  type TrainingSpace,
} from '@/features/trainings/api/trainings-api';
import { trainingRoutes } from '@/features/trainings/lib/routes';
import { seatsLine } from '@/features/trainings/lib/training-helpers';
import { config } from '@/lib/config';
import { formatTimestamp } from '@/lib/format';
import { fr } from '@/lib/i18n/fr';

/*
 * Liste des formations (03-APPFLOW §3.2 « à venir, passées », §4.3 ; gabarit « Liste » du 04-UX-UI §7) :
 * celles de l'organisateur (`/network/trainings`, `/cga/trainings`) ou, pour un CGA, celles du réseau
 * (`/cga/network-trainings`). Groupe segmenté « À venir · Passées », puis `DataTable` dans une carte
 * sans marge ; une ligne ouvre la formation. Pagination et période côté serveur.
 */
const labels = fr.trainings;

const PERIODS: { value: TrainingPeriod; label: string }[] = [
  { value: 'upcoming', label: labels.tabs.upcoming },
  { value: 'past', label: labels.tabs.past },
];

function columns(catalog: boolean): ColumnDef<Training>[] {
  const text = labels.columns;

  return [
    { id: 'title', header: text.title, cell: ({ row }) => row.original.title },
    { id: 'date', header: text.date, cell: ({ row }) => formatTimestamp(row.original.starts_at) },
    {
      id: 'format',
      header: text.format,
      cell: ({ row }) => labels.formats[row.original.format] ?? row.original.format_label,
    },
    ...(catalog
      ? [
          {
            id: 'organizer',
            header: text.organizer,
            cell: ({ row }) => row.original.organizer?.name ?? null,
          } satisfies ColumnDef<Training>,
        ]
      : []),
    { id: 'seats', header: text.seats, cell: ({ row }) => seatsLine(row.original) },
    {
      id: 'status',
      header: text.status,
      cell: ({ row }) => <StatusBadge domain="training" status={row.original.status} />,
    },
  ];
}

type TrainingListProps = {
  /** Organisateur (`network`, `cga`) ou formations du réseau vues d'un CGA (`catalog`). */
  source: TrainingSpace | 'catalog';
};

export function TrainingList({ source }: TrainingListProps) {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<TrainingPeriod>('upcoming');
  const [page, setPage] = useState(1);
  const filters = { period, page };
  const query = useQuery({
    queryKey:
      source === 'catalog' ? trainingKeys.networkList(filters) : trainingKeys.list(source, filters),
    queryFn: () =>
      source === 'catalog' ? trainingsApi.networkList(filters) : trainingsApi.list(source, filters),
    placeholderData: (previous) => previous,
  });
  const pagination: PaginationState = {
    pageIndex: page - 1,
    pageSize: query.data?.meta.per_page ?? config.pageSize,
  };

  function onPaginationChange(updater: Updater<PaginationState>) {
    const next = typeof updater === 'function' ? updater(pagination) : updater;

    setPage(next.pageIndex + 1);
  }

  return (
    <Card>
      <CardContent className="border-b border-border">
        <SegmentedControl
          label={labels.list.period}
          value={period}
          choices={PERIODS}
          onChange={(value) => {
            setPeriod(value);
            setPage(1);
          }}
        />
      </CardContent>
      {query.isError && query.data === undefined ? (
        <CardContent>
          <Banner
            tone="danger"
            role="alert"
            action={
              <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
                {fr.common.retry}
              </Button>
            }
          >
            {labels.list.loadError}
          </Banner>
        </CardContent>
      ) : (
        <CardContent flush>
          <DataTable
            caption={labels.list.caption}
            columns={columns(source === 'catalog')}
            data={query.data?.data ?? []}
            rowCount={query.data?.meta.total ?? 0}
            pagination={pagination}
            onPaginationChange={onPaginationChange}
            isLoading={query.isPending}
            getRowId={(training) => training.id}
            onRowClick={(training) => {
              void navigate(
                source === 'catalog'
                  ? trainingRoutes.network(training.id)
                  : trainingRoutes.detail(source, training.id),
              );
            }}
            empty={<EmptyState icon={GraduationCap}>{labels.list.empty}</EmptyState>}
          />
        </CardContent>
      )}
    </Card>
  );
}
