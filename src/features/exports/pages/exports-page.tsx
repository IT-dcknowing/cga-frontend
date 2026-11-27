import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { PageHeader } from '@/components/layout/page-header';
import { KeyValueList } from '@/components/shared/key-value-list';
import { StatusBadge } from '@/components/shared/status-badge';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  exportKeys,
  exportsApi,
  isFinished,
  type ExportRecord,
  type ExportSpace,
} from '@/features/exports/api/exports-api';
import { exportRoutes } from '@/features/exports/lib/routes';
import { config } from '@/lib/config';
import { formatDate, formatNumber, formatTimestamp } from '@/lib/format';
import { fr } from '@/lib/i18n/fr';
import { isScreenError, retryUnlessScreenError } from '@/lib/query';
import { cn } from '@/lib/utils';

/*
 * « Mes exports » (`/cncga/exports`, `/cga/exports`, F-EXP-01, étape 8.6) : l'export ouvert depuis la
 * notification « Export prêt » (avancement relu tant qu'il n'est pas fini, téléchargement par lien
 * temporaire signé), puis les derniers exports de la personne. Le serveur ne renvoie que les siens.
 */
const text = fr.exports.page;

function periodOf(record: ExportRecord): string {
  return record.period === null
    ? text.noPeriod
    : fr.statistics.period.custom(
        formatDate(record.period.from),
        formatDate(record.period.to ?? record.period.from),
      );
}

function rowsOf(record: ExportRecord): string {
  return fr.exports.rows(record.rows_count, formatNumber(record.rows_count));
}

function DownloadLink({ record }: { record: ExportRecord }) {
  return record.file === null ? null : (
    <Button asChild size="sm" variant="secondary">
      <a href={record.file.url} aria-label={text.downloadFile(record.file.name)}>
        <Download aria-hidden="true" />
        {record.file.name}
      </a>
    </Button>
  );
}

function ExportDetail({ space, id }: { space: ExportSpace; id: string }) {
  const query = useQuery({
    queryKey: exportKeys.detail(space, id),
    queryFn: () => exportsApi.show(space, id),
    throwOnError: isScreenError,
    retry: retryUnlessScreenError,
    refetchInterval: (current) => (isFinished(current.state.data) ? false : config.exportPollMs),
  });

  if (query.isPending) {
    return <Skeleton className="h-40 w-full" />;
  }
  if (query.isError) {
    return (
      <Banner
        tone="danger"
        role="alert"
        action={
          <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
            {fr.common.retry}
          </Button>
        }
      >
        {text.loadError}
      </Banner>
    );
  }

  const record = query.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{text.detail(record.type_label)}</CardTitle>
        <StatusBadge domain="export" status={record.status} />
      </CardHeader>
      <CardContent className="grid gap-4">
        <KeyValueList
          items={[
            { label: text.period, value: periodOf(record) },
            { label: text.rows, value: record.status === 'done' ? rowsOf(record) : null },
            { label: text.requestedAt, value: formatTimestamp(record.requested_at) },
            {
              label: text.finishedAt,
              value: record.finished_at === null ? null : formatTimestamp(record.finished_at),
            },
          ]}
        />
        {record.status === 'failed' ? (
          <Banner tone="danger" role="alert">
            {text.failed}
          </Banner>
        ) : record.file === null ? (
          <p className="text-note text-muted">{text.pending}</p>
        ) : (
          <div>
            <DownloadLink record={record} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ExportHistory({ space, current }: { space: ExportSpace; current?: string }) {
  const query = useQuery({
    queryKey: exportKeys.list(space),
    queryFn: () => exportsApi.list(space),
    // Relue tant qu'un export de la liste n'est pas fini.
    refetchInterval: (current) =>
      (current.state.data ?? []).every((record) => isFinished(record))
        ? false
        : config.exportPollMs,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{text.history}</CardTitle>
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : query.isError ? (
          <Banner tone="danger" role="alert">
            {text.loadError}
          </Banner>
        ) : query.data.length === 0 ? (
          <p className="text-note text-muted">{text.empty}</p>
        ) : (
          <ul aria-label={text.history} className="divide-y divide-border">
            {query.data.map((record) => (
              <li
                key={record.id}
                aria-current={record.id === current ? 'true' : undefined}
                className={cn(
                  'flex flex-wrap items-center justify-between gap-3 py-2',
                  record.id === current && 'font-semibold',
                )}
              >
                <span className="grid gap-0.5">
                  <Link
                    to={exportRoutes.detail(space, record.id)}
                    className="font-semibold text-primary underline"
                  >
                    {record.type_label}
                  </Link>
                  <span className="text-note font-normal text-muted">
                    {[
                      formatTimestamp(record.requested_at),
                      periodOf(record),
                      record.status === 'done' ? rowsOf(record) : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <StatusBadge domain="export" status={record.status} />
                  <DownloadLink record={record} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function ExportsPage({ space }: { space: ExportSpace }) {
  const { id } = useParams();

  return (
    <>
      <PageHeader title={text.title} />
      <div className="grid gap-4">
        {id === undefined ? null : <ExportDetail key={id} space={space} id={id} />}
        <ExportHistory space={space} current={id} />
      </div>
    </>
  );
}
