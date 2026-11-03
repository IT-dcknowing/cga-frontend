import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  memberFinanceApi,
  memberFinanceKeys,
} from '@/features/member-space/api/member-finance-api';
import { memberSpaceRoutes } from '@/features/member-space/lib/routes';
import {
  memberObligationKeys,
  memberObligationsApi,
} from '@/features/obligations/api/member-obligations-api';
import type {
  InstanceStatus,
  ObligationInstance,
} from '@/features/obligations/api/obligations-api';
import { formatAmount, formatDate, formatTimestampDate } from '@/lib/format';
import { fr } from '@/lib/i18n/fr';

/*
 * Cartes de l'accueil adhérent (F-DSH-03, 03-APPFLOW §5.2, étape 4.8), sans période : prochaine
 * échéance à traiter (carte vers les obligations), ce qu'il doit (impôts, CNPS et CMU), échéances
 * du mois, reste des honoraires, documents récents. Une échéance déjà signalée au CGA ou une
 * diligence du CGA ne demande rien à l'adhérent : elle n'est pas « à traiter ».
 */
const labels = fr.memberSpace.home;
const OPEN: InstanceStatus[] = ['todo', 'to_pay', 'partially_paid'];

function actionable(instance: ObligationInstance): boolean {
  return (
    instance.kind !== 'diligence' &&
    OPEN.includes(instance.status) &&
    instance.member_declared_status === null
  );
}

export function ObligationCards() {
  const query = useQuery({
    queryKey: memberObligationKeys.all,
    queryFn: () => memberObligationsApi.list(),
  });

  if (query.isPending) {
    return <Skeleton className="h-28 w-full" />;
  }

  if (query.isError) {
    return (
      <Banner tone="danger" role="alert">
        {fr.obligations.member.loadError}
      </Banner>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const todo = query.data.instances.filter(actionable);
  const upcoming = todo
    .filter((instance) => instance.due_date >= today)
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.label.localeCompare(b.label, 'fr'));
  const [next] = upcoming;
  const month = upcoming.filter((instance) => instance.due_date.startsWith(today.slice(0, 7)));
  const overdue = todo.filter((instance) => instance.overdue).length;
  const { summary } = query.data;

  return (
    <>
      <Card aria-label={labels.next}>
        <CardHeader>
          <CardTitle>{labels.next}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          <p className="text-card-title font-bold">
            {next === undefined
              ? labels.nextNone
              : labels.nextLine(next.label, formatDate(next.due_date))}
          </p>
          {overdue > 0 ? (
            <p className="text-note font-semibold text-danger">{labels.overdue(String(overdue))}</p>
          ) : null}
          <Button size="sm" className="justify-self-start" asChild>
            <Link to={memberSpaceRoutes.obligations}>{labels.seeObligations}</Link>
          </Button>
        </CardContent>
      </Card>

      <Card aria-label={labels.dues}>
        <CardHeader>
          <CardTitle>{labels.dues}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-3">
            <div className="grid gap-0.5">
              <dt className="text-label text-muted">{labels.taxesDue}</dt>
              <dd className="text-card-title font-bold">{formatAmount(summary.tax.total_due)}</dd>
            </div>
            <div className="grid gap-0.5">
              <dt className="text-label text-muted">{labels.socialDue}</dt>
              <dd className="text-card-title font-bold">
                {formatAmount(summary.cnps.total_due + summary.cmu.total_due)}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card aria-label={labels.month}>
        <CardHeader>
          <CardTitle>{labels.month}</CardTitle>
        </CardHeader>
        <CardContent>
          {month.length === 0 ? (
            <p className="text-note text-muted">{labels.monthNone}</p>
          ) : (
            <ul aria-label={labels.month} className="divide-y divide-border">
              {month.map((instance) => (
                <li key={instance.id} className="flex justify-between gap-2 py-2 text-table">
                  <span>{instance.label}</span>
                  <span className="text-muted">{formatDate(instance.due_date)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

/** Reste des honoraires, sous la carte « Mes honoraires ». */
export function FeesBalance() {
  const charges = useQuery({
    queryKey: memberFinanceKeys.charges,
    queryFn: () => memberFinanceApi.charges(),
  });

  if (charges.data === undefined) {
    return null;
  }
  const balance = charges.data
    .filter((charge) => charge.status !== 'cancelled')
    .reduce((sum, charge) => sum + charge.balance, 0);

  return <p className="text-table font-semibold">{labels.feesBalance(formatAmount(balance))}</p>;
}

export function RecentDocuments() {
  const documents = useQuery({
    queryKey: memberFinanceKeys.documents,
    queryFn: () => memberFinanceApi.documents(),
  });
  const recent = (documents.data ?? []).slice(0, 3);

  return (
    <Card aria-label={labels.recentDocuments}>
      <CardHeader>
        <CardTitle>{labels.recentDocuments}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {recent.length === 0 ? (
          <p className="text-note text-muted">{labels.noDocuments}</p>
        ) : (
          <ul aria-label={labels.recentDocuments} className="divide-y divide-border">
            {recent.map((document) => (
              <li key={document.id} className="flex justify-between gap-2 py-2 text-table">
                {document.pdf === null ? (
                  <span>{document.title}</span>
                ) : (
                  <a
                    className="text-primary underline"
                    href={document.pdf.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {document.title}
                  </a>
                )}
                <span className="text-muted">
                  {document.issued_at === null ? '' : formatTimestampDate(document.issued_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Button variant="secondary" size="sm" className="justify-self-start" asChild>
          <Link to={memberSpaceRoutes.documents}>{labels.documentsLink}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
