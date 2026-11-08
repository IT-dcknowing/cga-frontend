import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ReportChart } from '@/features/reports/api/reports-api';
import {
  ChartDrawing,
  ChartFigure,
  ReportCharts,
} from '@/features/reports/components/report-charts';
import { fr } from '@/lib/i18n/fr';
import { demoReportCharts } from '@/test/api-reports';

/*
 * Graphiques du rapport modernisé (étape 5.12, RG-RPT-09) : un dessin par type (secteurs, colonnes,
 * barres, courbe) et, pour les lecteurs d'écran, le tableau des valeurs de chaque graphique.
 */
const charts = demoReportCharts as unknown as Record<string, ReportChart>;

describe('Graphiques du rapport (5.12)', () => {
  it.each(Object.keys(charts))('RG-RPT-09 · dessine le graphique %s', (key) => {
    const { container } = render(<ChartDrawing chart={charts[key]} width={480} height={240} />);

    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('04-UX-UI · palette de la charte, valeurs formatées au-dessus des barres', () => {
    const bar = Object.values(charts).find((chart) => chart.type === 'bar') as ReportChart;
    const column = charts.chart_movements;
    const drawn = render(<ChartDrawing chart={bar} width={480} height={240} />);
    const text = (drawn.container.textContent ?? '').replace(/\s/g, ' ');

    expect(text).toContain('1 250 000');
    expect(drawn.container.querySelector('[fill="var(--color-primary)"]')).not.toBeNull();
    drawn.unmount();

    const { container } = render(<ChartDrawing chart={column} width={480} height={240} />);

    expect(container.querySelector('[fill="var(--color-chart-secondary)"]')).not.toBeNull();
    expect(container.querySelector('[fill="var(--color-danger)"]')).toBeNull();
  });

  it('donne le titre et le tableau des valeurs de chaque graphique, séries comprises', () => {
    render(<ChartFigure chart={charts.chart_movements} />);

    const figure = screen.getByRole('figure', {
      name: 'Nouveaux adhérents et résiliations du trimestre',
    });
    const table = within(figure).getByRole('table');

    expect(
      within(table).getByRole('columnheader', { name: fr.reports.charts.category }),
    ).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Nouveaux' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Résiliés' })).toBeInTheDocument();
    expect(within(table).getByRole('rowheader', { name: 'TEE' }).closest('tr')).toHaveTextContent(
      'TEE10',
    );
  });

  it('rien à afficher sans graphique', () => {
    const { container } = render(<ReportCharts charts={{}} />);

    expect(container).toBeEmptyDOMElement();
    render(<ReportCharts charts={undefined} />);
    expect(screen.queryByRole('region')).toBeNull();
  });
});
