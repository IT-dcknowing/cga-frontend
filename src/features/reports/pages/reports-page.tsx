import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, FileSpreadsheet, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { reportKeys, reportsApi } from '@/features/reports/api/reports-api';
import { reportRoutes } from '@/features/reports/lib/routes';
import { ApiBusinessError } from '@/lib/api-errors';
import { formatDate } from '@/lib/format';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';

/*
 * `/cga/rapports` (03-APPFLOW §4.3, F-RPT-02, étape 5.8) : rapports du centre (année, trimestre,
 * statut, date limite, version, avancement) ; « + Préparer le rapport T{n} » pour chaque trimestre
 * encore à préparer (liste du serveur), qui ouvre le rapport.
 */
const labels = fr.reports;

export function ReportsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState<string | null>(null);
  const query = useQuery({ queryKey: reportKeys.list, queryFn: () => reportsApi.list() });

  async function prepare(year: number, quarter: number) {
    setCreating(`${year}-${quarter}`);
    try {
      const report = await reportsApi.create(year, quarter);

      toast.success(labels.created(report.label));
      await queryClient.invalidateQueries({ queryKey: reportKeys.list });
      await navigate(reportRoutes.detail(report.id));
    } catch (error) {
      if (error instanceof ApiBusinessError) {
        toast.error(error.message);
      } else {
        toastUnexpectedError(error);
      }
    } finally {
      setCreating(null);
    }
  }

  const actions =
    query.data?.canPrepare === true && query.data.creatable.length > 0 ? (
      <div className="flex flex-wrap gap-2">
        {query.data.creatable.map((period) => (
          <Button
            key={`${period.year}-${period.quarter}`}
            disabled={creating !== null}
            onClick={() => void prepare(period.year, period.quarter)}
          >
            <Plus aria-hidden="true" />
            {labels.prepare(String(period.quarter), String(period.year))}
          </Button>
        ))}
      </div>
    ) : null;

  return (
    <>
      <PageHeader title={labels.title} actions={actions} />
      <Card>
        <CardContent>
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
              {labels.loadError}
            </Banner>
          ) : query.data.reports.length === 0 ? (
            <EmptyState icon={FileSpreadsheet}>{labels.empty}</EmptyState>
          ) : (
            <ul aria-label={labels.caption} className="divide-y divide-border">
              {query.data.reports.map((report) => (
                <li key={report.id}>
                  <Link
                    to={reportRoutes.detail(report.id)}
                    aria-label={labels.open(report.label)}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 hover:bg-primary-soft/40"
                  >
                    <span className="grid gap-0.5">
                      <span className="font-semibold">{report.label}</span>
                      <span className="text-note text-muted">
                        {[
                          labels.line(
                            formatDate(report.deadline),
                            String(Math.max(1, report.current_version)),
                          ),
                          labels.completeness(String(report.completeness_overall)),
                        ].join(' · ')}
                      </span>
                      {report.is_legally_late || report.is_late ? (
                        <span className="text-note font-semibold text-danger">
                          {report.is_legally_late ? labels.legallyLateShort : labels.lateShort}
                        </span>
                      ) : null}
                    </span>
                    <span className="flex items-center gap-2">
                      <StatusBadge domain="report" status={report.status} />
                      <ChevronRight className="size-4 text-muted" aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
