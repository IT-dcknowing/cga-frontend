import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { MessageSquare } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';
import { DataTable } from '@/components/shared/data-table';
import { EmptyState } from '@/components/shared/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox, CheckboxField } from '@/components/ui/checkbox';
import { FormField } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';
import {
  CONCERN_CATEGORIES,
  CONCERN_STATUSES,
  concernKeys,
  concernsApi,
  type Concern,
  type ConcernFilters,
  type ConcernSpace,
} from '@/features/concerns/api/concerns-api';
import { concernRoutes } from '@/features/concerns/lib/routes';
import { formatNumber, formatTimestampDate } from '@/lib/format';
import { fr } from '@/lib/i18n/fr';
import { oneOf, useTableParams } from '@/lib/list-params';

/*
 * Liste des demandes d'un espace (étape 7.4, gabarit « Liste » du 04-UX-UI §7) : filtres dans l'adresse
 * (statut, catégorie ; centre : « sans réponse depuis 15 j »), puis `DataTable` dans une carte sans marge
 * — objet (avec « sans réponse » et « délai dépassé »), demandeur, catégorie, date et délai écoulé,
 * statut ; une ligne ouvre le fil. Pagination côté serveur.
 */
const labels = fr.concerns;

export function ConcernStatusBadge({ status }: { status: string }) {
  return <StatusBadge domain="concern" status={status} />;
}

/** Demandeur affiché : l'entreprise (centre), le CGA (réseau) ; rien pour l'adhérent lui-même. */
function requester(concern: Concern): string | null {
  return concern.member?.company_name ?? concern.organization?.name ?? concern.author?.name ?? null;
}

function columns(space: ConcernSpace, withRequester: boolean): ColumnDef<Concern>[] {
  const text = labels.columns;

  return [
    {
      id: 'subject',
      header: text.subject,
      cell: ({ row }) => {
        const concern = row.original;

        return (
          <span className="grid gap-0.5">
            <span>{concern.subject}</span>
            <span className="flex flex-wrap gap-2 font-normal">
              {concern.stale === true ? (
                <span className="text-note font-semibold text-danger">{labels.list.stale}</span>
              ) : null}
              {concern.response_late && space !== 'member' ? (
                <span className="text-note font-semibold text-accent-text">{labels.list.late}</span>
              ) : null}
              {concern.transferred ? (
                <span className="text-note text-muted">{labels.list.transferred}</span>
              ) : null}
              {concern.from_transfer === true ? (
                <span className="text-note text-muted">{labels.list.fromTransfer}</span>
              ) : null}
            </span>
          </span>
        );
      },
    },
    ...(withRequester
      ? [
          {
            id: 'requester',
            header: space === 'network' ? text.cga : text.requester,
            cell: ({ row }) => requester(row.original),
          } satisfies ColumnDef<Concern>,
        ]
      : []),
    {
      id: 'category',
      header: text.category,
      cell: ({ row }) => labels.categories[row.original.category] ?? row.original.category_label,
    },
    {
      id: 'opened',
      header: text.opened,
      cell: ({ row }) =>
        text.openedValue(
          formatTimestampDate(row.original.created_at),
          formatNumber(row.original.elapsed_days),
        ),
    },
    {
      id: 'status',
      header: text.status,
      cell: ({ row }) => <ConcernStatusBadge status={row.original.status} />,
    },
  ];
}

export function ConcernList({
  space,
  level,
}: {
  space: ConcernSpace;
  level?: 'member_to_cga' | 'cga_to_cncga';
}) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filters: ConcernFilters = {
    status: oneOf(CONCERN_STATUSES, params.get('statut')) ?? '',
    category: oneOf(CONCERN_CATEGORIES, params.get('categorie')) ?? '',
    level,
    stale: params.get('sans-reponse') === '1',
    page: Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1),
  };
  const query = useQuery({
    queryKey: concernKeys.list(space, filters),
    queryFn: () => concernsApi.list(space, filters),
    placeholderData: (previous) => previous,
  });

  function filter(key: string, value: string) {
    const next = new URLSearchParams(params);

    if (value === '') {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    if (key !== 'page') {
      next.delete('page');
    }
    setParams(next, { replace: true });
  }

  const { pagination, onPaginationChange } = useTableParams({
    page: filters.page,
    pageSize: query.data?.meta.per_page,
    sort: null,
    setFilter: filter,
  });
  const idSuffix = level ?? space;

  return (
    <Card>
      <CardContent className="flex flex-wrap items-end gap-4 border-b border-border">
        <FormField
          id={`concerns-status-${idSuffix}`}
          label={labels.filters.status}
          className="w-44"
        >
          <Select
            id={`concerns-status-${idSuffix}`}
            value={filters.status}
            onChange={(event) => {
              filter('statut', event.target.value);
            }}
          >
            <option value="">{labels.filters.all}</option>
            {CONCERN_STATUSES.map((status) => (
              <option key={status} value={status}>
                {labels.statuses[status]}
              </option>
            ))}
          </Select>
        </FormField>
        {space === 'member' ? null : (
          <FormField
            id={`concerns-category-${idSuffix}`}
            label={labels.filters.category}
            className="w-56"
          >
            <Select
              id={`concerns-category-${idSuffix}`}
              value={filters.category}
              onChange={(event) => {
                filter('categorie', event.target.value);
              }}
            >
              <option value="">{labels.filters.all}</option>
              {CONCERN_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {labels.categories[category]}
                </option>
              ))}
            </Select>
          </FormField>
        )}
        {space === 'cga' && level === 'member_to_cga' ? (
          <CheckboxField id="concerns-stale" label={labels.filters.staleOnly}>
            <Checkbox
              id="concerns-stale"
              checked={filters.stale === true}
              onChange={(event) => {
                filter('sans-reponse', event.target.checked ? '1' : '');
              }}
            />
          </CheckboxField>
        ) : null}
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
            columns={columns(space, space !== 'member' && level !== 'cga_to_cncga')}
            data={query.data?.data ?? []}
            rowCount={query.data?.meta.total ?? 0}
            pagination={pagination}
            onPaginationChange={onPaginationChange}
            isLoading={query.isPending}
            getRowId={(concern) => concern.id}
            onRowClick={(concern) => {
              void navigate(concernRoutes.detail(space, concern.id));
            }}
            empty={<EmptyState icon={MessageSquare}>{labels.list.empty}</EmptyState>}
          />
        </CardContent>
      )}
    </Card>
  );
}
