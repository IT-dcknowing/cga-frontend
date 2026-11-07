import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, GraduationCap } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/shared/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  trainingKeys,
  trainingsApi,
  type Training,
  type TrainingPeriod,
  type TrainingSpace,
} from '@/features/trainings/api/trainings-api';
import { trainingRoutes } from '@/features/trainings/lib/routes';
import { seatsLine } from '@/features/trainings/lib/training-helpers';
import { formatTimestamp } from '@/lib/format';
import { fr } from '@/lib/i18n/fr';
import { cn } from '@/lib/utils';

/*
 * Liste des formations (03-APPFLOW §3.2 « à venir, passées », §4.3) : celles de l'organisateur
 * (`/network/trainings`, `/cga/trainings`) ou, pour un CGA, celles du réseau (`/cga/network-trainings`).
 * Pagination et filtre de période côté serveur.
 */
const labels = fr.trainings;

type TrainingListProps = {
  /** Organisateur (`network`, `cga`) ou formations du réseau vues d'un CGA (`catalog`). */
  source: TrainingSpace | 'catalog';
};

export function TrainingList({ source }: TrainingListProps) {
  const [period, setPeriod] = useState<TrainingPeriod>('upcoming');
  const [page, setPage] = useState(1);
  const filters = { period, page };
  const query = useQuery({
    queryKey:
      source === 'catalog' ? trainingKeys.networkList(filters) : trainingKeys.list(source, filters),
    queryFn: () =>
      source === 'catalog' ? trainingsApi.networkList(filters) : trainingsApi.list(source, filters),
  });
  const items = query.data?.data ?? [];

  function link(training: Training): string {
    return source === 'catalog'
      ? trainingRoutes.network(training.id)
      : trainingRoutes.detail(source, training.id);
  }

  return (
    <div className="grid gap-4">
      <div role="group" aria-label={labels.list.caption} className="flex gap-2">
        {(['upcoming', 'past'] as const).map((value) => (
          <Button
            key={value}
            size="sm"
            variant={period === value ? 'primary' : 'secondary'}
            aria-pressed={period === value}
            onClick={() => {
              setPeriod(value);
              setPage(1);
            }}
          >
            {value === 'upcoming' ? labels.tabs.upcoming : labels.tabs.past}
          </Button>
        ))}
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
        <EmptyState icon={GraduationCap}>{labels.list.empty}</EmptyState>
      ) : (
        <>
          <ul aria-label={labels.list.caption} className="divide-y divide-border">
            {items.map((training) => (
              <li key={training.id}>
                <Link
                  to={link(training)}
                  aria-label={labels.list.open(training.title)}
                  className={cn(
                    'flex flex-wrap items-center justify-between gap-3 py-3 hover:bg-primary-soft/40',
                  )}
                >
                  <span className="grid gap-0.5">
                    <span className="font-semibold">{training.title}</span>
                    <span className="text-note text-muted">
                      {[
                        formatTimestamp(training.starts_at),
                        labels.formats[training.format] ?? training.format_label,
                        source === 'catalog' && training.organizer !== undefined
                          ? labels.list.organizer(training.organizer.name)
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    <span className="text-note text-muted">{seatsLine(training)}</span>
                  </span>
                  <StatusBadge domain="training" status={training.status} />
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
                  setPage(query.data.meta.current_page - 1);
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
                  setPage(query.data.meta.current_page + 1);
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
