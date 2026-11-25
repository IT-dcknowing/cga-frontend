import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PageHeader } from '@/components/layout/page-header';
import { KpiCard } from '@/components/shared/kpi-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  statisticsApi,
  statisticsKeys,
  type NetworkDashboard,
} from '@/features/statistics/api/statistics-api';
import {
  AlertsCard,
  ComputedAt,
  StatsError,
  StatsLoading,
} from '@/features/statistics/components/dashboard-parts';
import { PeriodSelector } from '@/features/statistics/components/period-selector';
import {
  countOf,
  usePeriodQuery,
  variationLabel,
} from '@/features/statistics/lib/statistics-format';
import { formatCompactAmount, formatNumber, formatRate } from '@/lib/format';
import { fr } from '@/lib/i18n/fr';

/*
 * Tableaux de bord (03-APPFLOW §3.2 et §4.3, F-DSH-01, 02 et 04, gabarit « Tableau de bord » du
 * 04-UX-UI §7, étape 8.4) : sélecteur de période, rangée de 4 indicateurs (selon les droits, le serveur
 * ne renvoyant que ceux permis), graphique et alertes cliquables vers les listes filtrées.
 */
const labels = fr.statistics.dashboard;

/** Alertes du CNCGA → liste filtrée. */
const NETWORK_ALERT_ROUTES: Partial<Record<string, string>> = {
  reports_late: '/cncga/rapports?filter=late',
  dues_unpaid: '/cncga/cotisations?statut=unpaid',
  agreements_expiring: '/cncga/membres',
  trainings_almost_full: '/cncga/formations',
};

/** Alertes d'un CGA → liste filtrée. */
const CGA_ALERT_ROUTES: Partial<Record<string, string>> = {
  rsi_active: '/cga/adherents?regime=RSI',
  members_to_complete: '/cga/adherents?tab=brouillons',
  pieces_pending: '/cga/adherents',
  fees_overdue: '/cga/adherents',
  radiations_pending: '/cga/adherents?tab=radiations-en-cours',
  invoices_pending: '/cga/factures?statut=pending_certification',
  closing_late: '/cga/cloture?retard=1',
  concerns_unanswered: '/cga/preoccupations?sans-reponse=1',
};

const monthFormatter = new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'UTC' });

function DuesChart({ chart }: { chart: NonNullable<NetworkDashboard['dues_chart']> }) {
  const rows = chart.map((month) => ({
    month: monthFormatter.format(new Date(`${month.month}T00:00:00Z`)),
    collected: month.collected,
    expected: month.expected,
  }));
  const year = chart.length === 0 ? '' : chart[0].month.slice(0, 4);
  const title = labels.duesChart(year);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <figure aria-label={title} className="grid gap-2">
          <div className="h-56 w-full" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows}>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis
                  dataKey="month"
                  stroke="var(--color-border)"
                  tick={{ fill: 'var(--color-muted)', fontSize: 12 }}
                />
                <YAxis
                  stroke="var(--color-border)"
                  tick={{ fill: 'var(--color-muted)', fontSize: 12 }}
                  tickFormatter={(value: number) => formatCompactAmount(value)}
                />
                <Tooltip formatter={(value) => formatCompactAmount(Number(value))} />
                <Bar
                  dataKey="collected"
                  name={labels.collected}
                  fill="var(--color-primary)"
                  isAnimationActive={false}
                >
                  <LabelList
                    dataKey="collected"
                    position="top"
                    formatter={(value: unknown) => formatCompactAmount(Number(value))}
                    fill="var(--color-ink)"
                    fontSize={11}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table className="sr-only">
            <caption>{title}</caption>
            <thead>
              <tr>
                <th scope="col">{labels.month}</th>
                <th scope="col">{labels.collected}</th>
                <th scope="col">{labels.expected}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.month}>
                  <th scope="row">{row.month}</th>
                  <td>{formatCompactAmount(row.collected)}</td>
                  <td>{formatCompactAmount(row.expected)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </figure>
      </CardContent>
    </Card>
  );
}

export function NetworkDashboardPage() {
  const [query, setQuery] = usePeriodQuery();
  const dashboard = useQuery({
    queryKey: statisticsKeys.networkDashboard(query),
    queryFn: () => statisticsApi.networkDashboard(query),
    placeholderData: (previous) => previous,
  });
  const text = labels.network;
  const data = dashboard.data;

  return (
    <>
      <PageHeader title={labels.title} />
      <div className="grid gap-4">
        <PeriodSelector value={query} onChange={setQuery} period={data?.period} />
        {dashboard.isPending ? (
          <StatsLoading />
        ) : dashboard.isError && data === undefined ? (
          <StatsError onRetry={() => void dashboard.refetch()} />
        ) : data === undefined ? null : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                label={text.cgas}
                value={text.cgasValue(
                  formatNumber(data.indicators.cgas.subscribed_cgas),
                  formatNumber(data.indicators.cgas.total_cgas),
                )}
                sub={text.cgasSub}
                to="/cncga/membres"
              />
              {data.indicators.dues === undefined ? null : (
                <KpiCard
                  label={text.dues}
                  value={formatCompactAmount(data.indicators.dues.collected.value ?? 0)}
                  sub={
                    data.indicators.dues.rate === null
                      ? variationLabel(data.indicators.dues.collected)
                      : text.duesSub(
                          formatRate(data.indicators.dues.rate),
                          String(data.indicators.dues.year),
                        )
                  }
                  to="/cncga/cotisations"
                />
              )}
              {data.indicators.concerns === undefined ? null : (
                <KpiCard
                  label={text.concerns}
                  value={formatNumber(data.indicators.concerns.open)}
                  sub={text.concernsSub(countOf(data.indicators.concerns.submitted.value))}
                  alert={data.indicators.concerns.open > 0}
                  to="/cncga/preoccupations"
                />
              )}
              {data.indicators.members === undefined ? null : (
                <KpiCard
                  label={text.members}
                  value={countOf(data.indicators.members.value)}
                  sub={variationLabel(data.indicators.members)}
                />
              )}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {data.dues_chart === null ? null : <DuesChart chart={data.dues_chart} />}
              <AlertsCard alerts={data.alerts} routes={NETWORK_ALERT_ROUTES} />
            </div>
            <ComputedAt computedAt={data.computed_at} space="network" />
          </>
        )}
      </div>
    </>
  );
}

export function CgaDashboardPage() {
  const [query, setQuery] = usePeriodQuery();
  const dashboard = useQuery({
    queryKey: statisticsKeys.cgaDashboard(query),
    queryFn: () => statisticsApi.cgaDashboard(query),
    placeholderData: (previous) => previous,
  });
  const text = labels.cga;
  const data = dashboard.data;
  const indicators = data?.indicators;

  return (
    <>
      <PageHeader title={labels.title} />
      <div className="grid gap-4">
        <PeriodSelector value={query} onChange={setQuery} period={data?.period} />
        {dashboard.isPending ? (
          <StatsLoading />
        ) : dashboard.isError && data === undefined ? (
          <StatsError onRetry={() => void dashboard.refetch()} />
        ) : data === undefined || indicators === undefined ? null : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {indicators.members === undefined ? null : (
                <KpiCard
                  label={text.members}
                  value={countOf(indicators.members.active.value)}
                  sub={text.membersSub(
                    countOf(indicators.members.new.value),
                    countOf(indicators.members.radiations.value),
                  )}
                  to="/cga/adherents"
                />
              )}
              {indicators.fees === undefined ? null : (
                <KpiCard
                  label={text.fees}
                  value={formatCompactAmount(indicators.fees.due.value ?? 0)}
                  sub={text.feesSub(
                    formatCompactAmount(indicators.fees.paid.value ?? 0),
                    formatCompactAmount(indicators.fees.unpaid),
                  )}
                  alert={indicators.fees.unpaid > 0}
                />
              )}
              {indicators.upcoming === undefined ? null : (
                <KpiCard
                  label={text.upcoming(formatNumber(indicators.upcoming.days))}
                  value={formatNumber(indicators.upcoming.count)}
                  sub={text.upcomingSub(formatNumber(indicators.upcoming.members))}
                  alert={indicators.upcoming.count > 0}
                  to="/cga/echeances"
                />
              )}
              {indicators.report === undefined ? null : indicators.report === null ? (
                <KpiCard label={text.noReport} value={text.noReportValue} to="/cga/rapports" />
              ) : (
                <KpiCard
                  label={text.report(
                    String(indicators.report.quarter),
                    String(indicators.report.year),
                  )}
                  value={
                    indicators.report.status === 'draft'
                      ? `${formatNumber(indicators.report.completeness)} %`
                      : ((fr.status.report as Record<string, string>)[indicators.report.status] ??
                        indicators.report.status)
                  }
                  sub={text.reportSub}
                  to={`/cga/rapports/${encodeURIComponent(indicators.report.id)}`}
                />
              )}
            </div>
            <AlertsCard alerts={data.alerts} routes={CGA_ALERT_ROUTES} />
            <ComputedAt computedAt={data.computed_at} space="cga" />
          </>
        )}
      </div>
    </>
  );
}
