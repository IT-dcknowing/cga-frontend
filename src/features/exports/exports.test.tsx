import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { httpAuthApi } from '@/features/auth/api/auth-api';
import type { ExportRecord } from '@/features/exports/api/exports-api';
import { todayIso } from '@/features/exports/lib/period';
import { config } from '@/lib/config';
import { fr } from '@/lib/i18n/fr';
import { createExportsBackend, EXPORT_ROWS } from '@/test/api-exports';
import { conflict, invalid } from '@/test/api-replies';
import { apiUrl, demoIds, installApiServer } from '@/test/api-server';
import { renderApp } from '@/test/render-app';

/*
 * Boutons « Exporter » des listes (06-IMPLEMENTATION-PLAN étape 8.6, F-EXP-01, RG-GEN-03, RG-SEC-06,
 * décision 0017) : bouton selon `exports.run` et le droit de la liste, filtres de la liste et période
 * envoyés au serveur, export suivi jusqu'au téléchargement (03-APPFLOW §7), erreurs du serveur, et page
 * « Mes exports », cible de la notification « Export prêt ». Vrai client `http`, backend simulé
 * (`api-exports.ts`).
 */
const text = fr.exports;

let server: ReturnType<typeof installApiServer>;
let downloads: string[];
const pollMs = config.exportPollMs;

beforeEach(() => {
  (config as { exportPollMs: number }).exportPollMs = 20;
  downloads = [];
  // Le lien signé répond en pièce jointe : on relève l'adresse au lieu de naviguer (jsdom).
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloads.push(this.href);
  });
});

afterEach(() => {
  (config as { exportPollMs: number }).exportPollMs = pollMs;
  vi.restoreAllMocks();
  server.restore();
});

const WHO = {
  president: ['0700000001', demoIds.president],
  manager: ['0700000002', demoIds.manager],
  accountant: ['0700000004', demoIds.accountant],
} as const;

async function open(
  entry: string,
  who: keyof typeof WHO,
  exports = createExportsBackend(),
  prepare?: () => void,
) {
  const [phone, membershipId] = WHO[who];

  server = installApiServer({ exports });
  server.signIn(phone, membershipId);
  prepare?.();

  const session = await httpAuthApi.currentSession();
  const user = userEvent.setup({ delay: null });
  const view = renderApp({ api: httpAuthApi, session, entry });

  return { user, ...view };
}

/** Corps des demandes d'export envoyées. */
function exportRequests(space: 'network' | 'cga'): unknown[] {
  return server.requests
    .filter((request) => request.method === 'POST' && request.url === apiUrl(`/${space}/exports`))
    .map((request) => request.body);
}

function showRequests(): number {
  return server.requests.filter(
    (request) => request.method === 'GET' && /\/exports\/[^/]+$/.test(request.url),
  ).length;
}

async function openDialog(user: ReturnType<typeof userEvent.setup>, label: string = text.action) {
  await user.click(await screen.findByRole('button', { name: label }));

  return screen.findByRole('dialog');
}

function fileOf(type: string) {
  return `${type}-20260310-1800.xlsx`;
}

function readyText(type: string) {
  return text.ready(fileOf(type), text.rows(EXPORT_ROWS, String(EXPORT_ROWS)));
}

describe('« Exporter » des listes (8.6, F-EXP-01)', { timeout: 30_000 }, () => {
  it('/cga/adherents : portefeuille, onglet et régime envoyés, suivi puis téléchargement (RG-SEC-06, RG-PTF-02)', async () => {
    const { user } = await open(
      '/cga/adherents?tab=radies&regime=TEE&recherche=Kouassi',
      'manager',
      createExportsBackend({ readsBeforeEnd: 2 }),
    );
    const dialog = await openDialog(user);

    expect(dialog).toHaveAccessibleName(text.dialog.title(text.lists.members.label));
    expect(
      within(dialog).getByText(
        [
          fr.members.portfolio.cga,
          fr.members.list.tabs.radies,
          `${fr.members.list.regimeFilter} : ${fr.status.regime.TEE}`,
        ].join(' · '),
      ),
    ).toBeVisible();
    expect(within(dialog).getByLabelText(text.dialog.period)).toHaveValue('whole');
    expect(within(dialog).getByText(text.lists.members.periodOn)).toBeVisible();
    // La recherche ne fait pas partie des filtres de l'export : la modale le dit.
    expect(
      within(dialog).getByText(text.dialog.ignored(text.dialog.ignoredFilters.search)),
    ).toBeVisible();

    await user.click(within(dialog).getByRole('button', { name: text.dialog.submit }));

    // Pendant la préparation : bouton désactivé avec indicateur (03-APPFLOW §7).
    expect(await screen.findByRole('button', { name: text.running })).toBeDisabled();
    expect(await screen.findByText(readyText('members'))).toBeVisible();
    expect(exportRequests('cga')).toEqual([
      {
        type: 'members',
        filters: { portfolio: 'cga', statuses: ['radiated', 'closed'], regimes: ['TEE'] },
      },
    ]);
    expect(downloads).toEqual([server.exports.records()[0].file?.url]);
    expect(await screen.findByRole('button', { name: text.action })).toBeEnabled();

    // « Télécharger » du toast relance le téléchargement si le navigateur l'a bloqué.
    // Clic simple : Sonner capture le pointeur sur le toast, ce que jsdom n'implémente pas.
    fireEvent.click(screen.getByRole('button', { name: text.download }));
    expect(downloads).toHaveLength(2);
  });

  it('sans le droit d’exporter, aucun bouton ni page « Mes exports » (RG-SEC-06)', async () => {
    const { router } = await open('/cga/adherents', 'accountant');

    expect(await screen.findByRole('heading', { name: fr.nav.members })).toBeVisible();
    expect(screen.queryByRole('button', { name: text.action })).toBeNull();

    await router.navigate('/cga/exports');
    expect(
      await screen.findByRole('heading', { name: fr.errorScreens.forbiddenTitle }),
    ).toBeVisible();
  });

  it('/cncga/cotisations : année et statut de la liste proposés, période annuelle envoyée', async () => {
    const { user } = await open('/cncga/cotisations?annee=2025&statut=unpaid', 'president');
    const dialog = await openDialog(user);

    expect(within(dialog).getByText(`${fr.dues.status} : ${fr.status.dues.unpaid}`)).toBeVisible();
    expect(within(dialog).getByLabelText(text.dialog.period)).toHaveValue('year');
    expect(within(dialog).getByRole('option', { name: text.lists.dues.whole })).toBeInTheDocument();
    expect(within(dialog).getByLabelText(new RegExp(text.dialog.year))).toHaveValue('2025');

    await user.click(within(dialog).getByRole('button', { name: text.dialog.submit }));

    expect(await screen.findByText(readyText('dues'))).toBeVisible();
    expect(exportRequests('network')).toEqual([
      { type: 'dues', period: 'year', date: '2025-01-01', filters: { statuses: ['unpaid'] } },
    ]);
  });

  it('/cga/echeances : dates du planning proposées, statut traduit, erreurs du serveur sous les champs', async () => {
    const { user } = await open(
      '/cga/echeances?du=2026-01-01&au=2026-03-31&statut=open&obligation=01obt000000000000000000001',
      'manager',
    );
    const dialog = await openDialog(user);

    expect(within(dialog).getByLabelText(text.dialog.period)).toHaveValue('custom');
    expect(
      within(dialog).getByText(text.dialog.ignored(text.dialog.ignoredFilters.obligation)),
    ).toBeVisible();
    expect(within(dialog).getByLabelText(new RegExp(`^${text.dialog.from}`))).toHaveValue(
      '2026-01-01',
    );
    expect(within(dialog).getByLabelText(new RegExp(`^${text.dialog.to}`))).toHaveValue(
      '2026-03-31',
    );

    // 422 sur un champ de la période : le message sous le champ, la modale reste ouverte.
    server.failNext(
      'POST',
      apiUrl('/cga/exports'),
      invalid({ to: 'La période ne peut pas dépasser 3660 jours.' }),
    );
    await user.click(within(dialog).getByRole('button', { name: text.dialog.submit }));
    expect(
      await within(dialog).findByText('La période ne peut pas dépasser 3660 jours.'),
    ).toBeVisible();

    // 422 hors des champs (filtre) et 409 : en bandeau.
    server.failNext(
      'POST',
      apiUrl('/cga/exports'),
      invalid({ 'filters.statuses.0': 'Le statut choisi est invalide.' }),
    );
    await user.click(within(dialog).getByRole('button', { name: text.dialog.submit }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Le statut choisi est invalide.',
    );
    server.failNext(
      'POST',
      apiUrl('/cga/exports'),
      conflict('busy', 'Un export est déjà en cours.'),
    );
    await user.click(within(dialog).getByRole('button', { name: text.dialog.submit }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Un export est déjà en cours.',
    );

    await user.click(within(dialog).getByRole('button', { name: text.dialog.submit }));
    expect(await screen.findByText(readyText('obligations'))).toBeVisible();
    expect(exportRequests('cga').at(-1)).toEqual({
      type: 'obligations',
      period: 'custom',
      from: '2026-01-01',
      to: '2026-03-31',
      filters: {
        statuses: ['todo', 'to_pay', 'partially_paid', 'not_established', 'in_progress'],
      },
    });
  });

  it('période : mois et année contrôlés avant l’envoi', async () => {
    const { user } = await open('/cga/echeances?onglet=planning', 'manager');
    const dialog = await openDialog(user);
    const period = within(dialog).getByLabelText(text.dialog.period);
    const submit = within(dialog).getByRole('button', { name: text.dialog.submit });

    await user.selectOptions(period, 'month');
    expect(within(dialog).getByLabelText(new RegExp(`^${text.dialog.month}`))).toHaveValue(
      todayIso().slice(0, 7),
    );
    await user.clear(within(dialog).getByLabelText(new RegExp(`^${text.dialog.month}`)));
    await user.click(submit);
    expect(await within(dialog).findByText(text.dialog.monthInvalid)).toBeVisible();

    await user.selectOptions(period, 'year');
    const year = within(dialog).getByLabelText(new RegExp(`^${text.dialog.year}`));

    await user.clear(year);
    await user.type(year, '20');
    await user.click(submit);
    expect(await within(dialog).findByText(text.dialog.yearInvalid)).toBeVisible();
    expect(exportRequests('cga')).toEqual([]);

    await user.type(year, '25');
    await user.click(submit);
    expect(await screen.findByText(readyText('obligations'))).toBeVisible();
    expect(exportRequests('cga')).toEqual([
      { type: 'obligations', period: 'year', date: '2025-01-01' },
    ]);
  });

  it('/cga/echeances : pas de bouton sur l’onglet « Mobilisation des recettes »', async () => {
    await open('/cga/echeances?onglet=revenue', 'manager');

    expect(
      await screen.findByRole('heading', { name: fr.obligations.planning.title }),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: text.action })).toBeNull();
  });

  it('/cga/preoccupations : demandes reçues filtrées, pas d’export des demandes envoyées', async () => {
    const { user, router } = await open(
      '/cga/preoccupations?statut=open&categorie=tax&sans-reponse=1',
      'manager',
    );
    const dialog = await openDialog(user);

    expect(
      within(dialog).getByText(
        `${fr.concerns.filters.status} : ${fr.concerns.statuses.open} · ${fr.concerns.filters.category} : ${fr.concerns.categories.tax}`,
      ),
    ).toBeVisible();
    expect(
      within(dialog).getByText(text.dialog.ignored(text.dialog.ignoredFilters.stale)),
    ).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: text.dialog.submit }));
    expect(await screen.findByText(readyText('concerns'))).toBeVisible();
    expect(exportRequests('cga')).toEqual([
      { type: 'concerns', filters: { statuses: ['open'], categories: ['tax'] } },
    ]);

    await router.navigate('/cga/preoccupations?onglet=envoyees');
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: text.action })).toBeNull();
    });
  });

  it('/cncga/preoccupations : demandes des CGA, pas sur l’onglet « Indicateurs »', async () => {
    const { user, router } = await open('/cncga/preoccupations', 'president');
    const dialog = await openDialog(user);

    expect(within(dialog).queryByText(text.dialog.filters)).toBeNull();
    expect(within(dialog).queryByText(/Non repris dans l’export/)).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: text.dialog.submit }));
    expect(await screen.findByText(readyText('network_concerns'))).toBeVisible();
    expect(exportRequests('network')).toEqual([{ type: 'network_concerns' }]);

    await router.navigate('/cncga/preoccupations?onglet=indicateurs');
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: text.action })).toBeNull();
    });
  });

  it('/cncga/formations : inscrits des formations du réseau', async () => {
    const { user } = await open('/cncga/formations', 'president');

    await user.click(
      within(await openDialog(user)).getByRole('button', { name: text.dialog.submit }),
    );
    expect(await screen.findByText(readyText('training_registrations'))).toBeVisible();
    expect(exportRequests('network')).toEqual([{ type: 'training_registrations' }]);
  });

  it('/cga/formations : bouton sur « Mes formations », pas sur « Formations du réseau »', async () => {
    const { user, router } = await open('/cga/formations', 'manager');

    await user.click(
      within(await openDialog(user)).getByRole('button', { name: text.dialog.submit }),
    );
    expect(await screen.findByText(readyText('training_registrations'))).toBeVisible();
    expect(exportRequests('cga')).toEqual([{ type: 'training_registrations' }]);

    await router.navigate('/cga/formations?onglet=reseau');
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: text.action })).toBeNull();
    });
  });

  it('/cncga/statistiques : « Exporter Excel » sur la période de l’écran (RG-STA-02)', async () => {
    const { user } = await open('/cncga/statistiques', 'president');
    const dialog = await openDialog(user, text.actionExcel);
    const month = todayIso().slice(0, 7);

    expect(within(dialog).getByLabelText(text.dialog.period)).toHaveValue('month');
    expect(within(dialog).getByLabelText(new RegExp(`^${text.dialog.month}`))).toHaveValue(month);

    await user.click(within(dialog).getByRole('button', { name: text.dialog.submit }));
    expect(await screen.findByText(readyText('statistics'))).toBeVisible();
    expect(exportRequests('network')).toEqual([
      { type: 'statistics', period: 'month', date: `${month}-01` },
    ]);
  });

  it('export en échec : toast d’erreur, aucun téléchargement', async () => {
    const { user } = await open(
      '/cga/adherents',
      'manager',
      createExportsBackend({ outcome: 'failed' }),
    );

    await user.click(
      within(await openDialog(user)).getByRole('button', { name: text.dialog.submit }),
    );
    expect(await screen.findByText(text.failed)).toBeVisible();
    expect(downloads).toEqual([]);
  });

  it('page quittée pendant la préparation : plus de relecture ni de toast (la cloche prend le relais)', async () => {
    const { user, router } = await open(
      '/cga/adherents',
      'manager',
      createExportsBackend({ readsBeforeEnd: 1000 }),
    );

    await user.click(
      within(await openDialog(user)).getByRole('button', { name: text.dialog.submit }),
    );
    expect(await screen.findByRole('button', { name: text.running })).toBeDisabled();
    await waitFor(() => {
      expect(showRequests()).toBeGreaterThan(0);
    });

    await router.navigate('/cga/tableau-de-bord');
    await new Promise((resolve) => {
      setTimeout(resolve, 80);
    });
    const afterLeaving = showRequests();

    await new Promise((resolve) => {
      setTimeout(resolve, 120);
    });
    expect(showRequests()).toBe(afterLeaving);
    expect(downloads).toEqual([]);
  });
});

function record(overrides: Partial<ExportRecord>): ExportRecord {
  return {
    id: '01exp000000000000000000901',
    type: 'members',
    type_label: 'Adhérents',
    status: 'done',
    status_label: 'Prêt',
    period: { type: 'year', from: '2025-01-01', to: '2025-12-31' },
    filters: {},
    rows_count: 3,
    requested_at: '2026-03-09T09:00:00+00:00',
    finished_at: '2026-03-09T09:00:20+00:00',
    file: {
      name: 'adherents-20260309-0900.xlsx',
      size_bytes: 9_000,
      url: 'https://api.test/api/v1/files/901/download?signature=test',
    },
    ...overrides,
  };
}

describe(
  '« Mes exports » (8.6, lien de la notification « Export prêt »)',
  { timeout: 30_000 },
  () => {
    it('/cga/exports/:id : avancement relu jusqu’au fichier, puis derniers exports', async () => {
      const exports = createExportsBackend({ readsBeforeEnd: 1 });

      exports.seed(
        'cga',
        demoIds.manager,
        record({ id: '01exp000000000000000000902', status: 'queued', file: null, rows_count: 0 }),
      );
      exports.seed('cga', demoIds.manager, record({}));
      await open('/cga/exports/01exp000000000000000000902', 'manager', exports);

      expect(await screen.findByRole('heading', { name: text.page.title })).toBeVisible();
      expect(await screen.findByText(text.page.pending)).toBeVisible();
      const [link] = await screen.findAllByRole('link', {
        name: text.page.downloadFile('members-20260310-1800.xlsx'),
      });

      expect(link).toHaveAttribute(
        'href',
        'https://api.test/api/v1/files/01exp000000000000000000902/download?signature=test',
      );
      expect(screen.getByText(text.rows(EXPORT_ROWS, String(EXPORT_ROWS)))).toBeVisible();
      expect(screen.getByText(text.page.detail('Adhérents'))).toBeVisible();

      const history = screen.getByRole('list', { name: text.page.history });

      expect(within(history).getAllByRole('listitem')).toHaveLength(2);
      expect(
        within(history).getByRole('link', {
          name: text.page.downloadFile('adherents-20260309-0900.xlsx'),
        }),
      ).toBeVisible();
      expect(within(history).getAllByText(/du 01\/01\/2025 au 31\/12\/2025/)).toHaveLength(2);
      // L'historique est relu : l'export ouvert y apparaît prêt, avec son fichier.
      await waitFor(() => {
        expect(
          within(history).getByRole('link', {
            name: text.page.downloadFile('members-20260310-1800.xlsx'),
          }),
        ).toBeVisible();
      });
    });

    it('export en échec, sans période (réseau)', async () => {
      const exports = createExportsBackend();

      exports.seed(
        'network',
        demoIds.president,
        record({ status: 'failed', file: null, period: null }),
      );
      await open('/cncga/exports/01exp000000000000000000901', 'president', exports);

      expect(await screen.findByText(text.page.failed)).toBeVisible();
      expect(screen.getByText(text.page.noPeriod)).toBeVisible();
    });

    it('aucun export : liste vide', async () => {
      await open('/cga/exports', 'manager');

      expect(await screen.findByText(text.page.empty)).toBeVisible();
    });

    it('export d’une autre personne refusé (403), export inconnu introuvable (404)', async () => {
      const exports = createExportsBackend();

      exports.seed('cga', demoIds.multiDck, record({}));
      const { router } = await open('/cga/exports/01exp000000000000000000901', 'manager', exports);

      expect(
        await screen.findByRole('heading', { name: fr.errorScreens.forbiddenTitle }),
      ).toBeVisible();

      await router.navigate('/cga/exports/01exp000000000000000000999');
      expect(
        await screen.findByRole('heading', { name: fr.errorScreens.notFoundTitle }),
      ).toBeVisible();
    });
  },
);
