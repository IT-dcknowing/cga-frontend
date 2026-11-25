import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { httpAuthApi } from '@/features/auth/api/auth-api';
import { organizationRoutes } from '@/features/organizations/lib/organization';
import { fr } from '@/lib/i18n/fr';
import { apiUrl, demoIds, installApiServer } from '@/test/api-server';
import { renderApp } from '@/test/render-app';

/*
 * `/cncga/rapports` (06-IMPLEMENTATION-PLAN étape 5.9, RG-RPT-04, RG-RPT-07) : tableau CGA × trimestre,
 * filtre dans l'adresse, tableau de synthèse agrégé d'un rapport transmis, sans nom d'adhérent. Vrai
 * client `http`, backend simulé (`api-reports.ts`).
 */
const labels = fr.reports.network;

let server: ReturnType<typeof installApiServer>;

afterEach(() => {
  server.restore();
});

async function open(entry = '/cncga/rapports?annee=2026') {
  server = installApiServer();
  server.signIn('0700000001', demoIds.president);

  const session = await httpAuthApi.currentSession();
  const user = userEvent.setup({ delay: null });
  const view = renderApp({ api: httpAuthApi, session, entry });

  return { user, ...view };
}

function row(name: string): HTMLElement {
  return screen.getByRole('rowheader', { name: new RegExp(name) }).closest('tr') as HTMLElement;
}

describe('/cncga/rapports (5.9, RG-RPT-04)', { timeout: 30_000 }, () => {
  it('RG-RPT-07 · tableau CGA × trimestre : transmis, accusé reçu, en retard, hors délai, non transmis', async () => {
    await open();

    const table = await screen.findByRole('table', { name: labels.caption('2026') });

    expect(within(table).getAllByRole('row')).toHaveLength(4);
    const dck = within(row('DC-KNOWING CGA'));

    expect(dck.getByRole('button', { name: labels.openSummary('DCK', '1') })).toHaveTextContent(
      'Transmis',
    );
    expect(dck.getByText('Hors délai réglementaire')).toBeVisible();
    expect(dck.getByText('En retard')).toBeVisible();
    expect(
      within(row('CGA Démo Bouaké')).getByRole('button', {
        name: labels.openSummary('DEMOB', '1'),
      }),
    ).toHaveTextContent('Accusé reçu');
    expect(within(row('CGA Démo Suspendu')).queryByRole('button')).toBeNull();
    expect(screen.getByText(labels.quarterHeader('3', '31/10/2026', '15/11/2026'))).toBeVisible();
  });

  it('RG-RPT-04 · tableau de synthèse agrégé par CDI, sans aucun nom d’adhérent', async () => {
    const { user } = await open();

    await user.click(await screen.findByRole('button', { name: labels.openSummary('DCK', '1') }));
    const dialog = await screen.findByRole('dialog', {
      name: labels.summaryTitle('DC-KNOWING CGA', '1', '2026'),
    });

    expect(await within(dialog).findByRole('rowheader', { name: 'CDI Plateau' })).toBeVisible();
    expect(within(dialog).getByText(labels.summaryHint)).toBeVisible();
    expect(dialog).not.toHaveTextContent('QUINCAILLERIE BAMBA');
    await user.click(
      within(dialog).getAllByRole('button', { name: fr.common.close }).at(-1) as HTMLElement,
    );
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    for (let attempt = 0; attempt < 2; attempt++) {
      server.failNext(
        'GET',
        apiUrl('/network/quarterly-reports/01cga000000000000000000002/summary'),
        {
          status: 500,
          data: { message: 'panne' },
        },
      );
    }
    await user.click(screen.getByRole('button', { name: labels.openSummary('DEMOB', '2') }));
    expect(await screen.findByText(labels.summaryError, {}, { timeout: 5_000 })).toBeVisible();
  });

  it('filtres dans l’adresse (« En retard ou hors délai » depuis le tableau de bord) et changement d’année', async () => {
    const { user, router } = await open('/cncga/rapports?annee=2026&filter=late');

    await screen.findByRole('table', { name: labels.caption('2026') });
    expect(screen.getAllByRole('rowheader')).toHaveLength(1);
    expect(row('DC-KNOWING CGA')).toBeVisible();

    await user.selectOptions(
      screen.getByRole('combobox', { name: labels.filter }),
      'not_transmitted',
    );
    await waitFor(() => {
      expect(screen.getAllByRole('rowheader')).toHaveLength(3);
    });
    expect(router.state.location.search).toContain('filter=not_transmitted');

    await user.selectOptions(
      screen.getByRole('combobox', { name: labels.year }),
      String(new Date().getFullYear() - 1),
    );
    expect(
      await screen.findByRole('table', {
        name: labels.caption(String(new Date().getFullYear() - 1)),
      }),
    ).toBeVisible();
    await waitFor(() => {
      expect(screen.queryAllByRole('button', { name: /Tableau de synthèse/ })).toHaveLength(0);
    });

    await user.selectOptions(screen.getByRole('combobox', { name: labels.filter }), 'late');
    expect(await screen.findByText(labels.empty)).toBeVisible();
  });

  it('état indisponible : bandeau puis « Réessayer »', async () => {
    server = installApiServer();
    // Une requête par trimestre, relancée une fois chacune : huit réponses en erreur.
    for (let attempt = 0; attempt < 8; attempt++) {
      server.failNext('GET', apiUrl('/network/quarterly-reports'), {
        status: 500,
        data: { message: 'panne' },
      });
    }
    server.signIn('0700000001', demoIds.president);
    const session = await httpAuthApi.currentSession();
    const user = userEvent.setup({ delay: null });

    renderApp({ api: httpAuthApi, session, entry: '/cncga/rapports?annee=2026' });
    expect(await screen.findByText(labels.loadError, {}, { timeout: 5_000 })).toBeVisible();
    await user.click(screen.getByRole('button', { name: fr.common.retry }));
    expect(await screen.findByRole('table', { name: labels.caption('2026') })).toBeVisible();
  });
});

describe('Fiche d’un CGA · onglet « Rapports » (5.9)', { timeout: 30_000 }, () => {
  it('quatre trimestres de l’année ; un rapport transmis ouvre son tableau de synthèse', async () => {
    const { user } = await open(organizationRoutes.detail(demoIds.dck));

    await user.click(await screen.findByRole('tab', { name: fr.organization.tabs.reports }));
    const panel = within(screen.getByRole('tabpanel', { name: fr.organization.tabs.reports }));
    const quarters = await panel.findByRole('list', {
      name: labels.caption(String(new Date().getFullYear())),
    });

    expect(within(quarters).getAllByRole('listitem')).toHaveLength(4);
    await user.click(panel.getByRole('button', { name: labels.openSummary('DCK', '1') }));
    expect(
      await screen.findByRole('dialog', {
        name: labels.summaryTitle('DC-KNOWING CGA', '1', '2026'),
      }),
    ).toBeVisible();

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('état indisponible : bandeau puis « Réessayer »', async () => {
    server = installApiServer();
    for (let attempt = 0; attempt < 8; attempt++) {
      server.failNext('GET', apiUrl('/network/quarterly-reports'), {
        status: 500,
        data: { message: 'panne' },
      });
    }
    server.signIn('0700000001', demoIds.president);
    const session = await httpAuthApi.currentSession();
    const user = userEvent.setup({ delay: null });

    renderApp({ api: httpAuthApi, session, entry: organizationRoutes.detail(demoIds.dck) });
    await user.click(await screen.findByRole('tab', { name: fr.organization.tabs.reports }));
    expect(await screen.findByText(labels.loadError, {}, { timeout: 5_000 })).toBeVisible();
    await user.click(screen.getByRole('button', { name: fr.common.retry }));
    expect(await screen.findByText(labels.tabIntro)).toBeVisible();
  });
});
