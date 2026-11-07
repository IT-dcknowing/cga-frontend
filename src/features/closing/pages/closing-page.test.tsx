import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { httpAuthApi } from '@/features/auth/api/auth-api';
import { communicationsRoutes } from '@/features/communications/lib/routes';
import { memberRoutes } from '@/features/members/lib/member';
import { fr } from '@/lib/i18n/fr';
import { demoClosingAgents, demoClosingIds } from '@/test/api-closing';
import { ok, conflict } from '@/test/api-replies';
import {
  apiUrl,
  demoAccounts,
  demoIds,
  installApiServer,
  type ApiAccount,
} from '@/test/api-server';
import { demoMemberIds } from '@/test/demo-members';
import { renderApp } from '@/test/render-app';

/*
 * `/cga/cloture` et onglet « Clôture » du dossier (06-IMPLEMENTATION-PLAN étape 4.11, F-OBL-08,
 * RG-OBL-10 à 12, décision 0006) : frise des 4 étapes, filtres dans l'adresse, dossiers, étape faite
 * dans l'ordre (dépôt : référence et accusé), livrable et agent, actions groupées, bloc « Pour le
 * rapport », lecture seule sans `closing.manage`. Vrai client `http`, backend simulé (`api-closing.ts`).
 */
const labels = fr.closing;

let server: ReturnType<typeof installApiServer>;

afterEach(() => {
  server.restore();
});

/**
 * Secrétaire : voit la campagne (`closing.view`) sans pouvoir la modifier ; chargé des honoraires :
 * ouvre les dossiers sans `closing.view`.
 */
const SECRETARY: Record<string, ApiAccount> = {
  '+2250700000021': {
    user: {
      first_name: 'Ama',
      last_name: 'Honoraires',
      phone: '+2250700000021',
      email: null,
      notification_preferences: { sms: false, whatsapp: false },
    },
    memberships: [
      {
        id: '01ms0000000000000000000b21',
        role: 'cga_billing_officer',
        organization: {
          id: demoIds.dck,
          type: 'cga',
          name: 'DC-KNOWING CGA',
          banking_enabled: false,
        },
        member: null,
        unread_notifications: 0,
      },
    ],
  },
  '+2250700000022': {
    user: {
      first_name: 'Mariam',
      last_name: 'Secrétaire',
      phone: '+2250700000022',
      email: null,
      notification_preferences: { sms: false, whatsapp: false },
    },
    memberships: [
      {
        id: '01ms0000000000000000000s22',
        role: 'cga_secretary',
        organization: {
          id: demoIds.dck,
          type: 'cga',
          name: 'DC-KNOWING CGA',
          banking_enabled: false,
        },
        member: null,
        unread_notifications: 0,
      },
    ],
  },
};

async function open(
  entry = '/cga/cloture',
  phone = '0700000002',
  membership: string = demoIds.manager,
) {
  server = installApiServer({ accounts: { ...demoAccounts, ...SECRETARY } });
  server.signIn(phone, membership);

  const session = await httpAuthApi.currentSession();
  const user = userEvent.setup({ delay: null });
  const view = renderApp({ api: httpAuthApi, session, entry });

  return { user, ...view };
}

async function rows(): Promise<HTMLElement[]> {
  const list = await screen.findByRole('list', { name: labels.list.caption });

  return within(list)
    .getAllByRole('listitem')
    .filter((item) => item.parentElement === list);
}

function row(company: string): HTMLElement {
  const list = screen.getByRole('list', { name: labels.list.caption });
  const link = within(list).getByRole('link', { name: labels.list.open(company) });

  return link.closest('li') as HTMLElement;
}

describe('/cga/cloture · campagne de clôture (4.11, F-OBL-08)', { timeout: 30_000 }, () => {
  it('RG-OBL-11 · frise des 4 étapes avec faits et retards, dossiers et bloc « Pour le rapport » (RG-OBL-12)', async () => {
    await open();

    const timeline = await screen.findByRole('list', { name: labels.timeline.caption });
    const steps = within(timeline).getAllByRole('listitem');

    expect(steps).toHaveLength(4);
    expect(steps[0]).toHaveTextContent(labels.steps.pieces);
    expect(steps[0]).toHaveTextContent(labels.timeline.done('2', '4'));
    expect(steps[0]).toHaveTextContent(labels.timeline.late('2'));
    expect(steps[1]).toHaveTextContent(labels.timeline.late('1'));
    expect(steps[2]).toHaveTextContent(labels.timeline.done('1', '4'));
    expect(steps[3]).not.toHaveTextContent(/en retard/);
    expect(screen.getByRole('combobox', { name: labels.year })).toHaveDisplayValue(
      labels.yearOption('2026', 'Ouverte'),
    );

    expect(await rows()).toHaveLength(4);
    expect(within(row('ETS KOUADIO & FILS')).getByLabelText(/Pièces : en retard/)).toBeVisible();
    expect(
      within(row('ETS KOUADIO & FILS')).getByRole('link', {
        name: labels.list.open('ETS KOUADIO & FILS'),
      }),
    ).toHaveAttribute('href', memberRoutes.detailTab(demoMemberIds.kouadio, 'closing'));

    const report = screen
      .getByText(labels.report.title)
      .closest('[data-slot="card"]') as HTMLElement;

    expect(within(report).getByText(labels.report.smtEstablished).nextSibling).toHaveTextContent(
      '1',
    );
    expect(within(report).getByText(labels.report.smtTransmitted).nextSibling).toHaveTextContent(
      '0',
    );
  });

  it('filtres dans l’adresse : portefeuille, étape à faire, en retard seulement', async () => {
    const { user, router } = await open('/cga/cloture?portefeuille=cabinet');

    await waitFor(async () => {
      expect(await rows()).toHaveLength(1);
    });
    expect(row('CABINET CLIENT')).toBeVisible();

    await user.selectOptions(screen.getByRole('combobox', { name: labels.filters.portfolio }), '');
    await user.selectOptions(
      screen.getByRole('combobox', { name: labels.filters.step }),
      'regularisation',
    );

    await waitFor(async () => {
      expect(await rows()).toHaveLength(1);
    });
    expect(row('QUINCAILLERIE BAMBA')).toBeVisible();
    expect(router.state.location.search).toBe('?etape=regularisation');

    await user.selectOptions(screen.getByRole('combobox', { name: labels.filters.step }), '');
    await user.click(screen.getByRole('checkbox', { name: labels.filters.late }));

    await waitFor(async () => {
      expect(await rows()).toHaveLength(3);
    });
    expect(router.state.location.search).toBe('?retard=1');

    await user.selectOptions(
      screen.getByRole('combobox', { name: labels.filters.agent }),
      demoClosingAgents[0].id,
    );
    await waitFor(() => {
      expect(screen.getByText(labels.list.empty)).toBeVisible();
    });
  });

  it('RG-OBL-11 · « Marquer l’étape faite » : la suivante du dossier, puis conflit renvoyé par le serveur', async () => {
    const { user } = await open();

    await rows();
    await user.click(
      screen.getByRole('button', { name: labels.list.rowActions('ETS KOUADIO & FILS') }),
    );
    await user.click(
      screen.getByRole('menuitem', { name: labels.list.markNext(labels.steps.pieces) }),
    );

    const dialog = await screen.findByRole('dialog', {
      name: labels.mark.title(labels.steps.pieces),
    });

    await user.click(within(dialog).getByRole('button', { name: labels.mark.submit }));

    expect(await screen.findByText(labels.mark.done(labels.steps.pieces))).toBeVisible();
    await waitFor(() => {
      expect(within(row('ETS KOUADIO & FILS')).getByLabelText(/Pièces : faite le/)).toBeVisible();
    });

    server.failNext(
      'POST',
      apiUrl(
        `/cga/closing-campaigns/${demoClosingIds.campaign2026}/items/${demoClosingIds.bamba}/steps/regularisation`,
      ),
      conflict('closing_step_out_of_order', 'L’étape précédente doit d’abord être faite.'),
    );
    await user.click(
      screen.getByRole('button', { name: labels.list.rowActions('QUINCAILLERIE BAMBA') }),
    );
    await user.click(
      screen.getByRole('menuitem', { name: labels.list.markNext(labels.steps.regularisation) }),
    );
    const second = await screen.findByRole('dialog');

    await user.click(within(second).getByRole('button', { name: labels.mark.submit }));
    expect(
      await within(second).findByText('L’étape précédente doit d’abord être faite.'),
    ).toBeVisible();
  });

  it('dépôt légal : référence et accusé exigés, puis référence et lien de l’accusé affichés (décision 0006)', async () => {
    const { user } = await open();

    await rows();
    await user.click(
      screen.getByRole('button', { name: labels.list.rowActions('BOULANGERIE ADJOUA') }),
    );
    await user.click(
      screen.getByRole('menuitem', { name: labels.list.markNext(labels.steps.filing) }),
    );

    const dialog = await screen.findByRole('dialog', {
      name: labels.mark.title(labels.steps.filing),
    });

    await user.click(within(dialog).getByRole('button', { name: labels.mark.submit }));
    expect(within(dialog).getAllByText(fr.members.create.errors.required)).toHaveLength(2);

    await user.type(
      within(dialog).getByLabelText(new RegExp(labels.mark.reference)),
      'DGI-2027-001',
    );
    await user.upload(
      within(dialog).getByLabelText(new RegExp(labels.mark.receipt)),
      new File(['%PDF'], 'accuse.pdf', { type: 'application/pdf' }),
    );
    await user.click(within(dialog).getByRole('button', { name: labels.mark.submit }));

    expect(await screen.findByText(labels.mark.done(labels.steps.filing))).toBeVisible();
    await waitFor(() => {
      expect(
        within(row('BOULANGERIE ADJOUA')).getByText(labels.list.reference('DGI-2027-001')),
      ).toBeVisible();
    });
    expect(
      within(row('BOULANGERIE ADJOUA')).getByRole('link', { name: labels.list.receipt }),
    ).toHaveAttribute('href', 'https://files.test/accuse.pdf');
  });

  it('actions groupées : étape faite (dossiers refusés détaillés), affectation, rappel de pièces', async () => {
    const { user, router } = await open();

    await rows();
    await user.click(
      screen.getByRole('checkbox', { name: labels.list.select('QUINCAILLERIE BAMBA') }),
    );
    await user.click(
      screen.getByRole('checkbox', { name: labels.list.select('ETS KOUADIO & FILS') }),
    );

    const toolbar = screen.getByRole('toolbar', { name: labels.list.selected('2') });

    await user.click(within(toolbar).getByRole('button', { name: labels.bulk.markStep }));
    const stepDialog = await screen.findByRole('dialog', { name: labels.bulk.stepTitle });

    await user.selectOptions(
      within(stepDialog).getByRole('combobox', { name: new RegExp(labels.bulk.step) }),
      'regularisation',
    );
    expect(within(stepDialog).queryByRole('option', { name: labels.steps.filing })).toBeNull();
    await user.click(within(stepDialog).getByRole('button', { name: labels.mark.submit }));

    expect(await screen.findByText(labels.bulk.done('1'))).toBeVisible();
    expect(screen.getByText(labels.bulk.skipped('1'))).toBeVisible();
    expect(
      screen.getByText('ETS KOUADIO & FILS : L’étape précédente doit d’abord être faite.'),
    ).toBeVisible();

    await user.click(
      screen.getByRole('checkbox', { name: labels.list.select('ETS KOUADIO & FILS') }),
    );
    await user.click(screen.getByRole('button', { name: labels.bulk.assign }));
    const assign = await screen.findByRole('dialog', { name: labels.bulk.assignTitle });

    await waitFor(() => {
      expect(
        within(assign).getByRole('option', { name: demoClosingAgents[1].name }),
      ).toBeInTheDocument();
    });
    await user.selectOptions(within(assign).getByRole('combobox'), demoClosingAgents[1].id);
    await user.click(within(assign).getByRole('button', { name: labels.edit.submit }));

    expect(await screen.findByText(labels.bulk.assigned('1'))).toBeVisible();
    await waitFor(() => {
      expect(row('ETS KOUADIO & FILS')).toHaveTextContent(
        labels.list.assignedTo(demoClosingAgents[1].name),
      );
    });

    await user.click(screen.getByRole('checkbox', { name: labels.list.selectPage }));
    await user.click(screen.getByRole('button', { name: labels.bulk.remind }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(communicationsRoutes.create);
    });
    expect(router.state.location.search).toContain('modele=closing');
    expect(router.state.location.search).toContain(demoMemberIds.kouadio);
  });

  it('« Livrable et agent » d’un dossier', async () => {
    const { user } = await open();

    await rows();
    await user.click(
      screen.getByRole('button', { name: labels.list.rowActions('ETS KOUADIO & FILS') }),
    );
    await user.click(screen.getByRole('menuitem', { name: labels.list.edit }));

    const dialog = await screen.findByRole('dialog', { name: labels.edit.title });

    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: new RegExp(labels.edit.deliverable) }),
      'smt',
    );
    await waitFor(() => {
      expect(
        within(dialog).getByRole('option', { name: demoClosingAgents[0].name }),
      ).toBeInTheDocument();
    });
    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: labels.edit.agent }),
      demoClosingAgents[0].id,
    );
    await user.click(within(dialog).getByRole('button', { name: labels.edit.submit }));

    expect(await screen.findByText(labels.edit.done)).toBeVisible();
    await waitFor(() => {
      expect(row('ETS KOUADIO & FILS')).toHaveTextContent('SMT');
    });
    expect(
      server.closing.items().find((item) => item.id === demoClosingIds.kouadio)?.assignedTo,
    ).toBe(demoClosingAgents[0].id);
  });

  it('exercice clos : lecture seule ; secrétaire sans `closing.manage` : ni sélection ni actions', async () => {
    const { user, unmount } = await open();

    await rows();
    await user.selectOptions(screen.getByRole('combobox', { name: labels.year }), '2025');

    await waitFor(async () => {
      expect(await rows()).toHaveLength(1);
    });
    expect(screen.getByText(labels.list.reference('DGI-2026-778'))).toBeVisible();
    expect(screen.queryByRole('checkbox', { name: /Sélectionner/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Actions/ })).toBeNull();

    unmount();
    server.restore();
    await open('/cga/cloture', '0700000022', '01ms0000000000000000000s22');
    expect(await rows()).toHaveLength(4);
    expect(screen.queryByRole('checkbox', { name: /Sélectionner/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Actions/ })).toBeNull();
  });

  it('aucune campagne ouverte', async () => {
    server = installApiServer();
    server.failNext('GET', apiUrl('/cga/closing-campaigns'), ok([]));
    server.signIn('0700000002', demoIds.manager);
    const session = await httpAuthApi.currentSession();

    renderApp({ api: httpAuthApi, session, entry: '/cga/cloture' });
    expect(await screen.findByText(labels.none)).toBeVisible();
    expect(screen.queryByRole('combobox', { name: labels.year })).toBeNull();
  });

  it('campagnes indisponibles : bandeau, puis « Réessayer »', async () => {
    server = installApiServer({ accounts: { ...demoAccounts, ...SECRETARY } });
    // Une requête en échec est relancée une fois (React Query) : deux réponses en erreur.
    for (let attempt = 0; attempt < 2; attempt++) {
      server.failNext('GET', apiUrl('/cga/closing-campaigns'), {
        status: 500,
        data: { message: 'Erreur interne', code: 'server_error' },
      });
    }
    server.signIn('0700000002', demoIds.manager);
    const session = await httpAuthApi.currentSession();
    const user = userEvent.setup({ delay: null });

    renderApp({ api: httpAuthApi, session, entry: '/cga/cloture' });
    expect(await screen.findByText(labels.loadError, {}, { timeout: 5_000 })).toBeVisible();

    await user.click(screen.getByRole('button', { name: fr.common.retry }));
    expect(await rows()).toHaveLength(4);
  });
});

describe('Onglet « Clôture » du dossier (4.11)', { timeout: 30_000 }, () => {
  it('un suivi par exercice ; l’étape suivante se marque depuis le dossier', async () => {
    const { user } = await open(memberRoutes.detailTab(demoMemberIds.bamba, 'closing'));

    expect(await screen.findByText(labels.memberTab.year('2026'))).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: labels.list.markNext(labels.steps.regularisation) }),
    );

    const dialog = await screen.findByRole('dialog', {
      name: labels.mark.title(labels.steps.regularisation),
    });

    await user.click(within(dialog).getByRole('button', { name: labels.mark.submit }));
    expect(await screen.findByText(labels.mark.done(labels.steps.regularisation))).toBeVisible();
    await waitFor(() => {
      expect(screen.getByLabelText(/Régularisation : faite le/)).toBeVisible();
    });

    await user.click(screen.getByRole('button', { name: labels.list.edit }));
    expect(await screen.findByRole('dialog', { name: labels.edit.title })).toBeVisible();
  });

  it('dossier sans suivi, et onglet absent sans `closing.view`', async () => {
    const { unmount } = await open(memberRoutes.detailTab(demoMemberIds.yao, 'closing'));

    expect(await screen.findByText(labels.memberTab.empty)).toBeVisible();
    expect(screen.getByRole('tab', { name: fr.members.detail.tabs.closing })).toBeVisible();

    unmount();
    server.restore();
    await open(memberRoutes.detail(demoMemberIds.yao), '0700000021', '01ms0000000000000000000b21');
    expect(await screen.findByRole('tab', { name: fr.members.detail.tabs.identity })).toBeVisible();
    expect(screen.queryByRole('tab', { name: fr.members.detail.tabs.closing })).toBeNull();
  });
});
