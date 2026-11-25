import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { httpAuthApi } from '@/features/auth/api/auth-api';
import { fr } from '@/lib/i18n/fr';
import { apiUrl, demoIds, installApiServer } from '@/test/api-server';
import { renderApp } from '@/test/render-app';

/*
 * Paramètres du réseau et de la plateforme (06-IMPLEMENTATION-PLAN étapes 5.6b et 5.13, RG-RPT-08) :
 * `/cncga/parametres` « Paramètres réseau » et « Règles du rapport », `/plateforme` « Paramètres
 * réseau ». Un champ par type de valeur, enregistrement, retour à la valeur par défaut, refus du
 * registre affichés sous le champ. Vrai client `http`, backend simulé (`api-settings.ts`).
 */
const labels = fr.settings;

let server: ReturnType<typeof installApiServer>;

afterEach(() => {
  server.restore();
});

async function open(entry: string, phone = '0700000001', membership: string = demoIds.president) {
  server = installApiServer();
  server.signIn(phone, membership);

  const session = await httpAuthApi.currentSession();
  const user = userEvent.setup({ delay: null });
  const view = renderApp({ api: httpAuthApi, session, entry });

  return { user, ...view };
}

function setting(label: string): HTMLElement {
  return screen.getByRole('form', { name: label });
}

function bodyOf(key: string): unknown {
  return server.requests
    .filter((request) => request.method === 'PUT' && request.url.endsWith(`/settings/${key}`))
    .at(-1)?.body;
}

describe('/cncga/parametres · Paramètres réseau (5.13)', { timeout: 20_000 }, () => {
  it('un bloc par groupe, sans la règle du rapport ; entier enregistré puis retour au défaut', async () => {
    const { user } = await open('/cncga/parametres?onglet=reseau');

    expect(await screen.findByRole('heading', { name: 'Cotisation CNCGA' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Rapport trimestriel' })).toBeVisible();
    expect(screen.queryByRole('form', { name: 'Règle « cotisation augmentée »' })).toBeNull();

    const amount = setting('Montant de la cotisation (FCFA)');

    expect(within(amount).getByText(labels.isDefault)).toBeVisible();
    await user.clear(within(amount).getByRole('spinbutton'));
    await user.type(within(amount).getByRole('spinbutton'), '900000');
    await user.click(within(amount).getByRole('button', { name: labels.save }));

    expect(await screen.findByText(labels.saved('Montant de la cotisation (FCFA)'))).toBeVisible();
    expect(bodyOf('dues.amount')).toEqual({ value: 900000 });
    await waitFor(() => {
      expect(
        within(setting('Montant de la cotisation (FCFA)')).getByText(labels.customized),
      ).toBeVisible();
    });
    expect(
      within(setting('Montant de la cotisation (FCFA)')).getByText(labels.defaultValue('750000')),
    ).toBeVisible();

    await user.click(
      within(setting('Montant de la cotisation (FCFA)')).getByRole('button', {
        name: labels.reset,
      }),
    );
    expect(
      await screen.findByText(labels.resetDone('Montant de la cotisation (FCFA)')),
    ).toBeVisible();
    expect(server.settings.value('dues.amount')).toBeUndefined();
  });

  it('liste de valeurs, oui / non et liste de choix ; nombre mal saisi et refus du registre', async () => {
    const { user } = await open('/cncga/parametres?onglet=reseau');

    const offsets = await screen.findByRole('form', {
      name: 'Relances du rapport (jours avant ou après la date limite)',
    });
    const field = within(offsets).getByRole('textbox');

    expect(field).toHaveValue('-15, -5, 5');
    expect(within(offsets).getByText(labels.listHint)).toBeVisible();
    await user.clear(field);
    await user.type(field, '-10, deux');
    await user.click(within(offsets).getByRole('button', { name: labels.save }));
    expect(within(offsets).getByText(labels.invalidNumber)).toBeVisible();

    await user.clear(field);
    await user.type(field, '-90, 5');
    await user.click(within(offsets).getByRole('button', { name: labels.save }));
    expect(
      await within(offsets).findByText('Chaque décalage est compris entre -60 et 60 jours.'),
    ).toBeVisible();

    await user.clear(field);
    await user.type(field, '-10, -3, 5');
    await user.click(within(offsets).getByRole('button', { name: labels.save }));
    await waitFor(() => {
      expect(bodyOf('report.reminder_offsets')).toEqual({ value: [-10, -3, 5] });
    });

    const workbook = setting('Export du classeur de compatibilité (14 feuilles)');

    await user.click(within(workbook).getByRole('checkbox'));
    await user.click(within(workbook).getByRole('button', { name: labels.save }));
    await waitFor(() => {
      expect(bodyOf('report.legacy_workbook_enabled')).toEqual({ value: false });
    });

    const mode = setting('Modalité de paiement');

    await user.selectOptions(within(mode).getByRole('combobox'), 'quarterly');
    await user.click(within(mode).getByRole('button', { name: labels.save }));
    await waitFor(() => {
      expect(bodyOf('dues.mode')).toEqual({ value: 'quarterly' });
    });

    const filing = setting('Date du dépôt légal (MM-JJ)');

    expect(within(filing).getByText(new RegExp(labels.readOnly))).toBeVisible();
    expect(within(filing).getByRole('textbox')).toBeDisabled();
    expect(within(filing).queryByRole('button', { name: labels.save })).toBeNull();
  });

  it('valeur structurée champ par champ (calendrier de clôture)', async () => {
    const { user } = await open('/cncga/parametres?onglet=reseau');

    const calendar = await screen.findByRole('form', {
      name: 'Calendrier de la campagne de clôture',
    });
    const pieces = within(calendar).getByLabelText(labels.fields['closing.calendar'].pieces);

    await user.clear(pieces);
    await user.type(pieces, '02-15');
    await user.click(within(calendar).getByRole('button', { name: labels.save }));

    await waitFor(() => {
      expect(bodyOf('closing.calendar')).toEqual({
        value: { pieces: '02-15', regularisation: '02-28', finalisation: '03-31' },
      });
    });
  });

  it('paramètres indisponibles : bandeau puis « Réessayer »', async () => {
    server = installApiServer();
    for (let attempt = 0; attempt < 2; attempt++) {
      server.failNext('GET', apiUrl('/network/settings'), {
        status: 500,
        data: { message: 'panne' },
      });
    }
    server.signIn('0700000001', demoIds.president);
    const session = await httpAuthApi.currentSession();
    const user = userEvent.setup({ delay: null });

    renderApp({ api: httpAuthApi, session, entry: '/cncga/parametres?onglet=reseau' });
    expect(await screen.findByText(labels.loadError, {}, { timeout: 5_000 })).toBeVisible();
    await user.click(screen.getByRole('button', { name: fr.common.retry }));
    expect(await screen.findByRole('heading', { name: 'Cotisation CNCGA' })).toBeVisible();
  });
});

describe('/cncga/parametres · Règles du rapport (5.6b, RG-RPT-08)', { timeout: 20_000 }, () => {
  it('RG-RPT-08 · base de comparaison, seuil et montant ; seuil refusé par le registre', async () => {
    const { user } = await open('/cncga/parametres?onglet=regles');

    expect(await screen.findByText(labels.reportRules.intro)).toBeVisible();
    const rule = setting('Règle « cotisation augmentée »');
    const fields = labels.fields['report.increase_rule'];

    expect(screen.queryByRole('form', { name: 'Montant de la cotisation (FCFA)' })).toBeNull();
    await user.selectOptions(within(rule).getByLabelText(fields.basis), 'revenue');
    await user.selectOptions(within(rule).getByLabelText(fields.amount), 'gross');
    await user.clear(within(rule).getByLabelText(fields.min_increase_pct));
    await user.type(within(rule).getByLabelText(fields.min_increase_pct), '150');
    await user.click(within(rule).getByRole('button', { name: labels.save }));

    expect(await within(rule).findByText('Le seuil est compris entre 0 et 100 %.')).toBeVisible();

    await user.clear(within(rule).getByLabelText(fields.min_increase_pct));
    await user.type(within(rule).getByLabelText(fields.min_increase_pct), '10');
    await user.click(within(rule).getByRole('button', { name: labels.save }));

    await waitFor(() => {
      expect(bodyOf('report.increase_rule')).toEqual({
        value: { basis: 'revenue', min_increase_pct: 10, amount: 'gross' },
      });
    });
  });
});

describe('/plateforme · Paramètres réseau (5.13)', { timeout: 20_000 }, () => {
  it('relances, échéance, export de compatibilité et calendrier de clôture seulement', async () => {
    const { user } = await open('/plateforme?onglet=reseau', '0700000009', demoIds.platformAdmin);

    expect(await screen.findByText(labels.platformNetwork.intro)).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Rapport trimestriel' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Clôture annuelle' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Cotisation CNCGA' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Files d’attente' })).toBeNull();

    const workbook = setting('Export du classeur de compatibilité (14 feuilles)');

    await user.click(within(workbook).getByRole('checkbox'));
    await user.click(within(workbook).getByRole('button', { name: labels.save }));
    await waitFor(() => {
      expect(server.settings.value('report.legacy_workbook_enabled')).toBe(false);
    });
  });
});
