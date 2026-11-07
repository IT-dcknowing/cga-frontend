import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, MessageSquare } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { EmptyState } from '@/components/shared/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Checkbox, CheckboxField } from '@/components/ui/checkbox';
import { FormField } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CONCERN_CATEGORIES,
  CONCERN_STATUSES,
  concernKeys,
  concernsApi,
  type ConcernFilters,
  type ConcernSpace,
} from '@/features/concerns/api/concerns-api';
import { concernRoutes } from '@/features/concerns/lib/routes';
import { formatTimestampDate } from '@/lib/format';
import { fr } from '@/lib/i18n/fr';
import { oneOf } from '@/lib/list-params';

/*
 * Liste des demandes d'un espace (étape 7.4) : filtres dans l'adresse (statut, catégorie ; centre :
 * « sans réponse depuis 15 j »), ligne avec objet, catégorie, date, délai écoulé et statut, badges
 * « sans réponse » et « délai dépassé » ; chaque demande ouvre son fil.
 */
const labels = fr.concerns;

export function ConcernStatusBadge({ status }: { status: string }) {
  return <StatusBadge domain="concern" status={status} />;
}

export function ConcernList({
  space,
  level,
}: {
  space: ConcernSpace;
  level?: 'member_to_cga' | 'cga_to_cncga';
}) {
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

  const items = query.data?.data ?? [];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-4">
        <FormField
          id={`concerns-status-${level ?? space}`}
          label={labels.filters.status}
          className="w-44"
        >
          <Select
            id={`concerns-status-${level ?? space}`}
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
            id={`concerns-category-${level ?? space}`}
            label={labels.filters.category}
            className="w-56"
          >
            <Select
              id={`concerns-category-${level ?? space}`}
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
      </div>

      {query.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : query.isError ? (
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
      ) : items.length === 0 ? (
        <EmptyState icon={MessageSquare}>{labels.list.empty}</EmptyState>
      ) : (
        <>
          <ul aria-label={labels.list.caption} className="divide-y divide-border">
            {items.map((concern) => (
              <li key={concern.id}>
                <Link
                  to={concernRoutes.detail(space, concern.id)}
                  aria-label={labels.list.open(concern.subject)}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 hover:bg-primary-soft/40"
                >
                  <span className="grid gap-0.5">
                    <span className="font-semibold">{concern.subject}</span>
                    <span className="text-note text-muted">
                      {[
                        concern.member?.company_name ??
                          concern.organization?.name ??
                          concern.author?.name,
                        labels.list.line(
                          labels.categories[concern.category] ?? concern.category_label,
                          formatTimestampDate(concern.created_at),
                          String(concern.elapsed_days),
                        ),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    <span className="flex flex-wrap gap-2">
                      {concern.stale === true ? (
                        <span className="text-note font-semibold text-danger">
                          {labels.list.stale}
                        </span>
                      ) : null}
                      {concern.response_late && space !== 'member' ? (
                        <span className="text-note font-semibold text-accent-text">
                          {labels.list.late}
                        </span>
                      ) : null}
                      {concern.transferred ? (
                        <span className="text-note text-muted">{labels.list.transferred}</span>
                      ) : null}
                      {concern.from_transfer === true ? (
                        <span className="text-note text-muted">{labels.list.fromTransfer}</span>
                      ) : null}
                    </span>
                  </span>
                  <ConcernStatusBadge status={concern.status} />
                </Link>
              </li>
            ))}
          </ul>
          {query.data.meta.last_page > 1 ? (
            <div className="flex items-center justify-end gap-2 text-note text-muted">
              <Button
                variant="secondary"
                size="sm"
                disabled={query.data.meta.current_page <= 1}
                aria-label={fr.referentials.previous}
                onClick={() => {
                  filter('page', String(query.data.meta.current_page - 1));
                }}
              >
                <ChevronLeft aria-hidden="true" />
              </Button>
              {fr.referentials.page(
                String(query.data.meta.current_page),
                String(query.data.meta.last_page),
              )}
              <Button
                variant="secondary"
                size="sm"
                disabled={query.data.meta.current_page >= query.data.meta.last_page}
                aria-label={fr.referentials.next}
                onClick={() => {
                  filter('page', String(query.data.meta.current_page + 1));
                }}
              >
                <ChevronRight aria-hidden="true" />
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
