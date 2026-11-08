import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileDown } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { FormDialog } from '@/components/shared/form-dialog';
import { KpiCard } from '@/components/shared/kpi-card';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TextField } from '@/components/ui/text-field';
import type { ReportChart } from '@/features/reports/api/reports-api';
import { ChartFigure } from '@/features/reports/components/report-charts';
import {
  POSITION_METRICS,
  statisticsApi,
  statisticsKeys,
  type MacroRate,
  type NationalStatistics,
} from '@/features/statistics/api/statistics-api';
import {
  ComputedAt,
  StatsError,
  StatsLoading,
} from '@/features/statistics/components/dashboard-parts';
import { EconomicMap } from '@/features/statistics/components/economic-map';
import { PeriodSelector } from '@/features/statistics/components/period-selector';
import { countOf, usePeriodQuery } from '@/features/statistics/lib/statistics-format';
import { ApiBusinessError, ApiValidationError } from '@/lib/api-errors';
import { formatCompactAmount, formatNumber, formatRate, formatTimestampDate } from '@/lib/format';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';

/*
 * Statistiques (03-APPFLOW §3.2 et §4.3, F-STA-01 et 02, étape 8.5) :
 * - `/cncga/statistiques` : période, couverture (« Sur la base de n CGA abonnés »), 4 indicateurs macro
 *   (« Non disponible — saisir les références » si absentes, lien vers les paramètres), graphiques (impôts
 *   par CGA, secteurs, régimes, natures d'impôt), carte par Direction régionale, plaquette PDF ;
 * - `/cga/statistiques` : position du centre face à la moyenne du réseau (masquée sous le minimum de
 *   contributeurs). Données agrégées seulement, aucun nom d'adhérent.
 */
const labels = fr.statistics.national;

/** Écran des données de référence macro (PIB, recettes fiscales) du CNCGA. */
const REFERENCES_ROUTE = '/cncga/parametres?onglet=references';

function macroCard(label: string, rate: MacroRate) {
  return rate.available && rate.rate !== null ? (
    <KpiCard key={label} label={label} value={formatRate(rate.rate)} />
  ) : (
    <KpiCard
      key={label}
      label={label}
      value={fr.statistics.position.none}
      sub={rate.label ?? labels.macro.settings}
      to={REFERENCES_ROUTE}
    />
  );
}

/** Graphiques du rapport réutilisés (même palette, tableau des valeurs pour les lecteurs d'écran). */
function chartsOf(data: NationalStatistics): ReportChart[] {
  const text = labels.charts;

  return [
    {
      type: 'bar',
      title: text.byCga,
      categories: data.by_cga.map((cga) => cga.sigle ?? cga.name ?? ''),
      series: { [text.amount]: data.by_cga.map((cga) => cga.tax_paid_total) },
      value_axis: text.amount,
    },
    {
      type: 'column',
      title: text.bySector,
      categories: data.by_sector.map((sector) => sector.name ?? text.unspecified),
      series: { [text.members]: data.by_sector.map((sector) => sector.members) },
      value_axis: text.members,
    },
    {
      type: 'pie',
      title: text.byRegime,
      categories: Object.keys(data.by_regime),
      series: { [text.members]: Object.values(data.by_regime) },
      value_axis: null,
    },
    {
      type: 'bar',
      title: text.byNature,
      categories: Object.keys(data.tax_revenue.by_nature),
      series: { [text.amount]: Object.values(data.tax_revenue.by_nature) },
      value_axis: text.amount,
    },
  ].filter((chart) => chart.categories.length > 0) as ReportChart[];
}

function BrochureDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const text = labels.brochure;
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [error, setError] = useState<string | undefined>();
  const [conflict, setConflict] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setConflict(null);
    try {
      await statisticsApi.produceBrochure(Number(year));
      await queryClient.invalidateQueries({ queryKey: statisticsKeys.brochures });
      toast.success(text.requested);
      onClose();
    } catch (caught) {
      if (caught instanceof ApiValidationError) {
        setError(caught.fields.year);
      } else if (caught instanceof ApiBusinessError) {
        setConflict(caught.message);
      } else {
        toastUnexpectedError(caught);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title={text.title}
      submitLabel={text.submit}
      submitting={submitting}
      onSubmit={(event) => void submit(event)}
      conflict={conflict}
    >
      <TextField
        id="brochure-year"
        label={text.year}
        required
        inputMode="numeric"
        value={year}
        error={error}
        onChange={(event) => {
          setYear(event.target.value);
        }}
      />
    </FormDialog>
  );
}

function Brochures() {
  const text = labels.brochure;
  const query = useQuery({
    queryKey: statisticsKeys.brochures,
    queryFn: () => statisticsApi.brochures(),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{text.history}</CardTitle>
      </CardHeader>
      <CardContent>
        {query.isPending ? null : query.isError ? (
          <Banner tone="danger" role="alert">
            {fr.statistics.loadError}
          </Banner>
        ) : query.data.length === 0 ? (
          <p className="text-note text-muted">{text.empty}</p>
        ) : (
          <ul aria-label={text.history} className="divide-y divide-border">
            {query.data.map((brochure) => (
              <li
                key={brochure.id}
                className="flex flex-wrap items-center justify-between gap-3 py-2"
              >
                <span className="grid">
                  <span className="font-semibold">{brochure.title}</span>
                  <span className="text-note text-muted">
                    {[
                      brochure.status_label,
                      brochure.issued_at === null ? null : formatTimestampDate(brochure.issued_at),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                {brochure.pdf === null ? null : (
                  <Button asChild size="sm" variant="secondary">
                    <a href={brochure.pdf.url} aria-label={text.download(brochure.pdf.name)}>
                      <Download aria-hidden="true" />
                      {brochure.pdf.name}
                    </a>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function NetworkStatisticsPage() {
  const [query, setQuery] = usePeriodQuery();
  const [producing, setProducing] = useState(false);
  const statistics = useQuery({
    queryKey: statisticsKeys.national(query),
    queryFn: () => statisticsApi.national(query),
    placeholderData: (previous) => previous,
  });
  const data = statistics.data;

  return (
    <>
      <PageHeader
        title={labels.title}
        actions={
          <Button
            onClick={() => {
              setProducing(true);
            }}
          >
            <FileDown aria-hidden="true" />
            {labels.brochure.action}
          </Button>
        }
      />
      <div className="grid gap-4">
        <PeriodSelector value={query} onChange={setQuery} period={data?.period} />
        {statistics.isPending ? (
          <StatsLoading />
        ) : statistics.isError && data === undefined ? (
          <StatsError onRetry={() => void statistics.refetch()} />
        ) : data === undefined ? null : (
          <>
            <p className="text-note text-muted">{data.coverage.label}</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                label={labels.macro.taxRevenue}
                value={formatCompactAmount(data.macro.tax_revenue)}
                sub={String(data.macro.year)}
              />
              <KpiCard
                label={labels.macro.memberRevenue}
                value={formatCompactAmount(data.macro.member_revenue)}
                sub={String(data.macro.year)}
              />
              {macroCard(labels.macro.budget, data.macro.budget_contribution)}
              {macroCard(labels.macro.gdp, data.macro.gdp_contribution)}
            </div>
            <section aria-label={fr.reports.charts.title} className="grid gap-3 md:grid-cols-2">
              {chartsOf(data).map((chart) => (
                <ChartFigure key={chart.title} chart={chart} />
              ))}
            </section>
            <EconomicMap directorates={data.by_directorate} query={query} />
            <Brochures />
            <ComputedAt computedAt={data.computed_at} space="network" />
          </>
        )}
      </div>
      {producing ? (
        <BrochureDialog
          onClose={() => {
            setProducing(false);
          }}
        />
      ) : null}
    </>
  );
}

const AMOUNT_METRICS = new Set(['fees_paid', 'tax_paid_total', 'declared_revenue']);

function metricValue(metric: string, value: number | null): string {
  if (value === null) {
    return fr.statistics.position.none;
  }
  if (AMOUNT_METRICS.has(metric)) {
    return formatCompactAmount(value);
  }
  if (metric === 'concerns_avg_response_hours') {
    return fr.statistics.position.hours(formatNumber(Math.round(value)));
  }

  return countOf(Math.round(value));
}

export function CgaStatisticsPage() {
  const [query, setQuery] = usePeriodQuery();
  const position = useQuery({
    queryKey: statisticsKeys.position(query),
    queryFn: () => statisticsApi.position(query),
    placeholderData: (previous) => previous,
  });
  const text = fr.statistics.position;
  const data = position.data;

  return (
    <>
      <PageHeader title={text.title} />
      <div className="grid gap-4">
        <PeriodSelector value={query} onChange={setQuery} period={data?.period} />
        {position.isPending ? (
          <StatsLoading />
        ) : position.isError && data === undefined ? (
          <StatsError onRetry={() => void position.refetch()} />
        ) : data === undefined ? null : (
          <>
            {data.network.sufficient ? null : (
              <Banner tone="warning" role="status">
                {text.insufficient(
                  formatNumber(data.network.contributors),
                  formatNumber(data.network.minimum),
                )}
              </Banner>
            )}
            <Card>
              <CardHeader>
                <CardTitle>{text.caption}</CardTitle>
              </CardHeader>
              <CardContent flush>
                <table className="w-full text-table tabular-nums">
                  <caption className="sr-only">{text.caption}</caption>
                  <thead>
                    <tr className="border-b border-border bg-bg text-left text-[0.75rem] font-bold uppercase tracking-[0.04em] text-muted">
                      <th scope="col" className="px-3 py-2">
                        {text.indicator}
                      </th>
                      <th scope="col" className="px-3 py-2 text-right">
                        {text.own}
                      </th>
                      <th scope="col" className="px-3 py-2 text-right">
                        {text.network}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {POSITION_METRICS.filter((metric) => metric in data.indicators).map(
                      (metric) => (
                        <tr key={metric} className="h-12 border-b border-border last:border-b-0">
                          <th scope="row" className="px-3 py-2 text-left font-semibold">
                            {text.metrics[metric]}
                          </th>
                          <td className="px-3 py-2 text-right">
                            {metricValue(metric, data.indicators[metric].own)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {metricValue(metric, data.indicators[metric].network_average)}
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
            <ComputedAt computedAt={data.computed_at} space="cga" />
          </>
        )}
      </div>
    </>
  );
}
