import { useQueryClient } from '@tanstack/react-query';
import { ChevronRight, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  statisticsApi,
  statisticsKeys,
  type DashboardAlert,
} from '@/features/statistics/api/statistics-api';
import { ApiBusinessError } from '@/lib/api-errors';
import { formatTimestamp } from '@/lib/format';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';
import { cn } from '@/lib/utils';

/*
 * Éléments communs des tableaux de bord et statistiques (04-UX-UI §7 « Tableau de bord ») : alertes
 * cliquables vers la liste filtrée, date de calcul des chiffres et « Actualiser », états de chargement.
 */
const labels = fr.statistics;

/** Alertes du tableau de bord ; une alerte non nulle mène à sa liste quand elle en a une. */
export function AlertsCard({
  alerts,
  routes,
}: {
  alerts: DashboardAlert[];
  routes: Partial<Record<string, string>>;
}) {
  const active = alerts.filter((alert) => alert.count > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{labels.dashboard.alerts}</CardTitle>
      </CardHeader>
      <CardContent>
        {active.length === 0 ? (
          <p className="text-note text-muted">{labels.dashboard.noAlert}</p>
        ) : (
          <ul aria-label={labels.dashboard.alerts} className="divide-y divide-border">
            {active.map((alert) => {
              const route = routes[alert.code];
              const content = (
                <>
                  <span className="flex items-center gap-2">
                    <span aria-hidden="true" className="h-5 w-1 shrink-0 rounded-full bg-accent" />
                    {alert.label}
                  </span>
                  {route === undefined ? null : (
                    <ChevronRight aria-hidden="true" className="size-4 text-muted" />
                  )}
                </>
              );
              const classes = 'flex items-center justify-between gap-3 py-2.5 text-table';

              return (
                <li key={alert.code}>
                  {route === undefined ? (
                    <span className={classes}>{content}</span>
                  ) : (
                    <Link to={route} className={cn(classes, 'hover:bg-primary-soft/40')}>
                      {content}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Date de calcul des chiffres (vues matérialisées) et « Actualiser » (202, limité par le serveur). */
export function ComputedAt({
  computedAt,
  space,
}: {
  computedAt: string | null;
  space: 'network' | 'cga';
}) {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    try {
      await statisticsApi.refresh(space);
      await queryClient.invalidateQueries({ queryKey: statisticsKeys.all });
      toast.success(labels.period.refreshed);
    } catch (error) {
      if (error instanceof ApiBusinessError) {
        toast.error(error.message);
      } else {
        toastUnexpectedError(error);
      }
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-note text-muted">
      <span>
        {computedAt === null
          ? labels.period.notComputed
          : labels.period.computedAt(formatTimestamp(computedAt))}
      </span>
      <Button size="sm" variant="secondary" loading={refreshing} onClick={() => void refresh()}>
        <RefreshCw aria-hidden="true" />
        {labels.period.refresh}
      </Button>
    </div>
  );
}

export function StatsLoading() {
  return (
    <div aria-busy="true" className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

export function StatsError({ onRetry }: { onRetry: () => void }) {
  return (
    <Banner
      tone="danger"
      role="alert"
      action={
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {fr.common.retry}
        </Button>
      }
    >
      {labels.loadError}
    </Banner>
  );
}
