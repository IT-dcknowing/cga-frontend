import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { httpAuthApi } from '@/features/auth/api/auth-api';
import { fr } from '@/lib/i18n/fr';
import { apiUrl, demoIds, installApiServer } from '@/test/api-server';
import { renderApp } from '@/test/render-app';

/*
 * Tableaux de bord et statistiques (06-IMPLEMENTATION-PLAN étapes 8.4 et 8.5, F-DSH-01, 02, 04,
 * F-STA-01, 02) : sélecteur de période, indicateurs, graphique, alertes cliquables, « Actualiser » ;
 * statistiques nationales (macro, graphiques, carte par DR et communes, plaquette PDF) ; position du
 * centre face au réseau. Vrai client `http`, backend simulé (`api-statistics.ts`).
 */
const labels = fr.statistics;

let server: ReturnType<typeof installApiServer>;

afterEach(() => {
  server.restore();
});

const WHO = {
  president: ['0700000001', demoIds.president],
  manager: ['0700000002', demoIds.manager],
} as const;

async function open(entry: string, who: keyof typeof WHO, prepare?: () => void) {
  const [phone, membershipId] = WHO[who];

  server = installApiServer();
  server.signIn(phone, membershipId);
  prepare?.();

  const session = await httpAuthApi.currentSession();
  const user = userEvent.setup({ delay: null });
  const view = renderApp({ api: httpAuthApi, session, entry });

  return { user, ...view };
}

function lastQuery(path: string): URLSearchParams {
  const request = server.requests.filter((item) => item.url.includes(path)).at(-1);

  return new URL(request?.url ?? 'http://x', 'http://localhost').searchParams;
}

describe('/cncga/tableau-de-bord (8.4, F-DSH-01)', { timeout: 30_000 }, () => {
  it('indicateurs, cotisations par mois, alertes cliquables et période', async () => {
    const { user } = await open('/cncga/tableau-de-bord', 'president');

    expect(await screen.findByText(labels.period.view('mars 2026'))).toBeVisible();
    expect(
      screen.getByRole('link', { name: `${labels.dashboard.network.cgas} : 18 / 111` }),
    ).toHaveAttribute('href', '/cncga/membres');
    const dues = screen.getByRole('link', { name: new RegExp(labels.dashboard.network.dues) });

    expect(dues).toHaveTextContent(/4,8\sM\sF/);
    expect(dues).toHaveTextContent(/58\s%\sde l’attendu 2026/);
    expect(
      screen.getByRole('link', { name: `${labels.dashboard.network.concerns} : 3` }),
    ).toBeVisible();
    expect(screen.getByText(/\+12,7\s%\ssur un an/)).toBeVisible();

    const chart = screen.getByRole('figure', { name: labels.dashboard.duesChart('2026') });

    expect(within(chart).getAllByRole('row')).toHaveLength(4);
    const alerts = within(screen.getByRole('list', { name: labels.dashboard.alerts }));

    expect(alerts.getAllByRole('link')).toHaveLength(3);
    expect(alerts.getByRole('link', { name: '2 rapports en retard' })).toHaveAttribute(
      'href',
      '/cncga/rapports?filter=late',
    );
    expect(alerts.queryByText('Aucun agrément à échéance')).toBeNull();

    await user.click(screen.getByRole('radio', { name: labels.period.types.year }));
    expect(await screen.findByText(labels.period.view('2026'))).toBeVisible();
    expect(lastQuery('/network/dashboard').get('period')).toBe('year');

    await user.click(screen.getByRole('radio', { name: labels.period.types.custom }));
    fireEvent.change(screen.getByLabelText(labels.period.from), {
      target: { value: '2026-01-01' },
    });
    fireEvent.change(screen.getByLabelText(labels.period.to), { target: { value: '2026-01-31' } });
    expect(
      await screen.findByText(labels.period.view(labels.period.custom('01/01/2026', '31/01/2026'))),
    ).toBeVisible();
    expect(lastQuery('/network/dashboard').get('from')).toBe('2026-01-01');

    await user.click(screen.getByRole('button', { name: labels.period.refresh }));
    expect(await screen.findByText(labels.period.refreshed)).toBeInTheDocument();
    expect(server.statistics.refreshes()).toContain('/network/statistics/refresh');
  });

  it('chiffres indisponibles : message et « Réessayer »', async () => {
    const { user } = await open('/cncga/tableau-de-bord', 'president', () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        server.failNext('GET', apiUrl('/network/dashboard'), {
          status: 500,
          data: { message: 'x' },
        });
      }
    });

    expect(await screen.findByText(labels.loadError, {}, { timeout: 5_000 })).toBeVisible();
    await user.click(screen.getByRole('button', { name: fr.common.retry }));
    expect(await screen.findByRole('list', { name: labels.dashboard.alerts })).toBeVisible();
  });
});

describe('/cga/tableau-de-bord (8.4, F-DSH-02)', { timeout: 30_000 }, () => {
  it('adhérents, honoraires, échéances, rapport du trimestre et alertes vers les listes', async () => {
    const { user } = await open('/cga/tableau-de-bord', 'manager');

    const text = labels.dashboard.cga;
    const members = await screen.findByRole('link', { name: `${text.members} : 142` });

    expect(members).toHaveTextContent(text.membersSub('6', '1'));
    expect(screen.getByText(text.fees)).toBeVisible();
    expect(screen.getByRole('link', { name: `${text.upcoming('15')} : 5` })).toHaveAttribute(
      'href',
      '/cga/echeances',
    );
    expect(
      screen.getByRole('link', { name: `${text.report('1', '2026')} : 79 %` }),
    ).toHaveAttribute('href', '/cga/rapports/01rpt000000000000000000001');
    expect(screen.getByText(labels.period.notComputed)).toBeVisible();

    const alerts = within(screen.getByRole('list', { name: labels.dashboard.alerts }));

    expect(alerts.getByRole('link', { name: '3 adhérents reclassés au réel' })).toHaveAttribute(
      'href',
      '/cga/adherents?regime=RSI',
    );
    expect(alerts.getByRole('link', { name: '1 préoccupation sans réponse' })).toHaveAttribute(
      'href',
      '/cga/preoccupations?sans-reponse=1',
    );

    server.failNext('POST', apiUrl('/cga/statistics/refresh'), {
      status: 409,
      data: { message: 'Actualisation déjà demandée.', code: 'stats_refresh_limited' },
    });
    await user.click(screen.getByRole('button', { name: labels.period.refresh }));
    expect(await screen.findByText('Actualisation déjà demandée.')).toBeInTheDocument();
  });
});

describe('/cncga/statistiques (8.5, F-STA-01)', { timeout: 30_000 }, () => {
  it('couverture, indicateurs macro, graphiques et carte par Direction régionale', async () => {
    const { user } = await open('/cncga/statistiques', 'president');

    expect(await screen.findByText('Sur la base de 18 CGA abonnés sur 111.')).toBeVisible();
    expect(screen.getByText(/15,3\sMds\sF/)).toBeVisible();
    expect(screen.getByText(/1,2\s%/)).toBeVisible();
    expect(
      screen.getByRole('link', { name: `${labels.national.macro.gdp} : ${labels.position.none}` }),
    ).toHaveAttribute('href', '/cncga/parametres?onglet=references');

    const charts = within(screen.getByRole('region', { name: fr.reports.charts.title }));

    expect(charts.getAllByRole('figure')).toHaveLength(4);
    expect(charts.getByRole('figure', { name: labels.national.charts.byRegime })).toBeVisible();

    const map = screen.getByRole('img', { name: labels.national.map.title });
    const titles = [...map.querySelectorAll('title')].map((title) =>
      (title.textContent ?? '').replace(/\s/g, ' '),
    );

    expect(titles).toHaveLength(3);
    expect(titles[0]).toBe('Abidjan : 8,2 Mds F, 12 CGA, 580 adhérents');
    expect(screen.getByText(labels.national.map.unspecified)).toBeVisible();
    expect(screen.getByRole('button', { name: labels.national.map.open('Man') })).toBeVisible();

    await user.click(screen.getByRole('button', { name: labels.national.map.open('Bouaké') }));
    const dialog = await screen.findByRole('dialog', { name: labels.national.map.open('Bouaké') });
    const communes = within(await within(dialog).findByRole('table'));

    expect(communes.getByRole('rowheader', { name: 'Bouaké' }).closest('tr')).toHaveTextContent(
      '110',
    );
    await user.click(
      within(dialog)
        .getAllByRole('button', { name: labels.national.communes.close })
        .at(-1) as HTMLElement,
    );

    await user.click(screen.getByRole('button', { name: labels.national.map.open('Korhogo') }));
    expect(await screen.findByText(labels.national.communes.empty)).toBeVisible();
  });

  it('plaquette PDF : liste, année refusée (422), production demandée', async () => {
    const { user } = await open('/cncga/statistiques', 'president');

    const history = within(
      await screen.findByRole('list', { name: labels.national.brochure.history }),
    );

    expect(
      history.getByRole('link', { name: labels.national.brochure.download('plaquette-2025.pdf') }),
    ).toHaveAttribute('href', '/fichiers/plaquette-2025.pdf');

    await user.click(screen.getByRole('button', { name: labels.national.brochure.action }));
    const dialog = await screen.findByRole('dialog', { name: labels.national.brochure.title });
    const year = within(dialog).getByLabelText(new RegExp(labels.national.brochure.year));

    await user.clear(year);
    await user.type(year, '2019');
    await user.click(within(dialog).getByRole('button', { name: labels.national.brochure.submit }));
    expect(
      await within(dialog).findByText('L’année doit être comprise entre 2020 et 2026.'),
    ).toBeVisible();

    await user.clear(year);
    await user.type(year, '2026');
    await user.click(within(dialog).getByRole('button', { name: labels.national.brochure.submit }));
    expect(await screen.findByText(labels.national.brochure.requested)).toBeInTheDocument();
    expect(await screen.findByText('Plaquette statistique 2026')).toBeVisible();
  });

  it('statistiques indisponibles, détail par commune en panne', async () => {
    const { user } = await open('/cncga/statistiques', 'president', () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        server.failNext('GET', apiUrl('/network/statistics'), {
          status: 500,
          data: { message: 'x' },
        });
      }
    });

    expect(await screen.findByText(labels.loadError, {}, { timeout: 5_000 })).toBeVisible();
    await user.click(screen.getByRole('button', { name: fr.common.retry }));

    for (let attempt = 0; attempt < 2; attempt += 1) {
      server.failNext('GET', apiUrl('/network/statistics/map/01drg000000000000000000003'), {
        status: 500,
        data: { message: 'x' },
      });
    }
    await user.click(
      await screen.findByRole('button', { name: labels.national.map.open('Bouaké') }),
    );
    expect(
      await screen.findByText(labels.national.communes.loadError, {}, { timeout: 5_000 }),
    ).toBeVisible();
  });
});

describe('/cga/statistiques (8.5, F-STA-02)', { timeout: 30_000 }, () => {
  it('position du centre face à la moyenne du réseau', async () => {
    await open('/cga/statistiques', 'manager');

    const table = within(await screen.findByRole('table', { name: labels.position.caption }));
    const row = (metric: string) =>
      (
        table.getByRole('rowheader', { name: labels.position.metrics[metric] }).closest('tr')
          ?.textContent ?? ''
      ).replace(/\s/g, ' ');

    expect(row('active_members')).toBe(`${labels.position.metrics.active_members}14296`);
    expect(row('fees_paid')).toBe(`${labels.position.metrics.fees_paid}3,9 M F2,8 M F`);
    expect(row('concerns_avg_response_hours')).toBe(
      `${labels.position.metrics.concerns_avg_response_hours}30 h41 h`,
    );
  });

  it('moyenne masquée sous le minimum de contributeurs', async () => {
    await open('/cga/statistiques', 'manager', () => {
      server.statistics.hideAverages();
    });

    expect(await screen.findByText(labels.position.insufficient('3', '5'))).toBeVisible();
    const table = within(screen.getByRole('table', { name: labels.position.caption }));

    expect(
      table.getByRole('rowheader', { name: labels.position.metrics.radiations }).closest('tr'),
    ).toHaveTextContent(`${labels.position.metrics.radiations}1${labels.position.none}`);
  });
});

describe('Sélecteur de période', () => {
  it('une période incomplète ou inversée n’est pas envoyée', async () => {
    const { user } = await open('/cga/tableau-de-bord', 'manager');

    await screen.findByText(labels.period.view('mars 2026'));
    await user.click(screen.getByRole('radio', { name: labels.period.types.custom }));
    fireEvent.change(screen.getByLabelText(labels.period.from), {
      target: { value: '2026-02-10' },
    });
    fireEvent.change(screen.getByLabelText(labels.period.to), { target: { value: '2026-02-01' } });
    await waitFor(() => {
      expect(lastQuery('/cga/dashboard').get('period')).toBe('month');
    });
    await user.click(screen.getByRole('radio', { name: labels.period.types.day }));
    expect(await screen.findByText(labels.period.view('10 mars 2026'))).toBeVisible();
  });
});
