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
