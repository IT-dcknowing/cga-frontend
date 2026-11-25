import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ReportChart } from '@/features/reports/api/reports-api';
import { formatNumber } from '@/lib/format';
import { fr } from '@/lib/i18n/fr';

/*
 * Graphiques du rapport modernisé (RG-RPT-09, 02-TRD §8.4, étape 5.12), dessinés avec recharts
 * (02-TRD §5.1) d'après les données préparées par le serveur (`ReportCharts`) : secteurs, colonnes,
 * barres ou courbe, aux couleurs de la charte (04-UX-UI §6 « Charts ») : valeurs en étiquette au-dessus
 * des barres, info-bulle et graduations formatées, légende sous le graphique. Chaque graphique a son
 * titre et, pour les lecteurs d'écran, le tableau de ses valeurs (le dessin est décoratif).
 */
/**
 * Palette des graphiques (04-UX-UI §6 « Charts ») : barres `primary`, série secondaire, alerte `accent`,
 * puis `info`, `accent-text`, `muted` — dans l'ordre de `documents.charts.palette` du serveur, pour que
 * l'aperçu à l'écran et le document généré se ressemblent.
 */
const COLORS = [
  'var(--color-primary)',
  'var(--color-chart-secondary)',
  'var(--color-accent)',
  'var(--color-info)',
  'var(--color-accent-text)',
  'var(--color-muted)',
];

/** Axes et grilles en `border`, graduations en `muted`. */
const AXIS = { stroke: 'var(--color-border)', tick: { fill: 'var(--color-muted)', fontSize: 12 } };

/**
 * Valeur affichée (étiquette, info-bulle, graduation) : séparateur des milliers à la française. Les
 * graphiques s'affichent sans animation (04-UX-UI §1 : pas d'animation gratuite).
 */
function formatValue(value: unknown): string {
  return formatNumber(Number(value));
}

function rowsOf(chart: ReportChart): Record<string, string | number>[] {
  const names = Object.keys(chart.series);

  return chart.categories.map((category, index) => ({
    category,
    ...Object.fromEntries(names.map((name) => [name, chart.series[name][index] ?? 0])),
  }));
}

/**
 * Dessin d'un graphique ; `width` et `height` sont fournis par `ResponsiveContainer` (ou fixés).
 */
export function ChartDrawing({
  chart,
  width,
  height,
}: {
  chart: ReportChart;
  width?: number;
  height?: number;
}) {
  const names = Object.keys(chart.series);
  const rows = rowsOf(chart);

  if (chart.type === 'pie') {
    const name = names[0] ?? '';

    return (
      <PieChart width={width} height={height}>
        <Pie
          data={rows}
          dataKey={name}
          nameKey="category"
          outerRadius="80%"
          isAnimationActive={false}
          label={({ value }: { value?: unknown }) => formatValue(value)}
        >
          {rows.map((row, index) => (
            <Cell key={String(row.category)} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={formatValue} />
        <Legend verticalAlign="bottom" />
      </PieChart>
    );
  }

  if (chart.type === 'line') {
    return (
      <LineChart width={width} height={height} data={rows}>
        <CartesianGrid stroke="var(--color-border)" vertical={false} />
        <XAxis dataKey="category" {...AXIS} />
        <YAxis allowDecimals={false} tickFormatter={formatValue} {...AXIS} />
        <Tooltip formatter={formatValue} />
        <Legend verticalAlign="bottom" />
        {names.map((name, index) => (
          <Line
            key={name}
            type="monotone"
            dataKey={name}
            stroke={COLORS[index % COLORS.length]}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    );
  }

  const horizontal = chart.type === 'bar';

  return (
    <BarChart
      width={width}
      height={height}
      data={rows}
      layout={horizontal ? 'vertical' : 'horizontal'}
    >
      <CartesianGrid stroke="var(--color-border)" vertical={horizontal} horizontal={!horizontal} />
      {horizontal ? (
        <XAxis type="number" tickFormatter={formatValue} {...AXIS} />
      ) : (
        <XAxis dataKey="category" {...AXIS} />
      )}
      {horizontal ? (
        <YAxis type="category" dataKey="category" width={96} {...AXIS} />
      ) : (
        <YAxis tickFormatter={formatValue} {...AXIS} />
      )}
      <Tooltip formatter={formatValue} />
      <Legend verticalAlign="bottom" />
      {names.map((name, index) => (
        <Bar
          key={name}
          dataKey={name}
          fill={COLORS[index % COLORS.length]}
          isAnimationActive={false}
        >
          {/* Valeur en étiquette au-dessus de la barre (à droite pour les barres horizontales). */}
          <LabelList
            dataKey={name}
            position={horizontal ? 'right' : 'top'}
            formatter={formatValue}
            fill="var(--color-ink)"
            fontSize={12}
          />
        </Bar>
      ))}
    </BarChart>
  );
}

export function ChartFigure({ chart }: { chart: ReportChart }) {
  const names = Object.keys(chart.series);
  const rows = rowsOf(chart);

  return (
    <figure className="grid gap-2 rounded-lg border border-border p-3" aria-label={chart.title}>
      <figcaption className="text-note font-semibold">{chart.title}</figcaption>
      <div className="h-56 w-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <ChartDrawing chart={chart} />
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>{chart.title}</caption>
        <thead>
          <tr>
            <th scope="col">{fr.reports.charts.category}</th>
            {names.map((name) => (
              <th key={name} scope="col">
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={String(row.category)}>
              <th scope="row">{row.category}</th>
              {names.map((name) => (
                <td key={name}>{formatNumber(Number(row[name]))}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export function ReportCharts({ charts }: { charts: Record<string, ReportChart> | undefined }) {
  const list = Object.entries(charts ?? {});

  if (list.length === 0) {
    return null;
  }

  return (
    <section aria-label={fr.reports.charts.title} className="grid gap-3 md:grid-cols-2">
      {list.map(([key, chart]) => (
        <ChartFigure key={key} chart={chart} />
      ))}
    </section>
  );
}
