import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { httpAuthApi } from '@/features/auth/api/auth-api';
import { memberRoutes } from '@/features/members/lib/member';
import { formatAmount } from '@/lib/format';
import { fr } from '@/lib/i18n/fr';
import { demoObligationTypeIds } from '@/test/api-obligations';
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
 * `/cga/echeances` (06-IMPLEMENTATION-PLAN étape 4.7, F-OBL-06, RG-OBL-08) : planning groupé,
 * filtres dans l'adresse, indicateur « échéances sous n jours », panneau des adhérents (lien vers
 * l'onglet Obligations, « Envoyer un rappel » vers l'envoi groupé prérempli), onglet « Mobilisation
 * des recettes ». Vrai client `http`, backend simulé (`api-planning.ts`).
 */
const labels = fr.obligations.planning;
const revenue = fr.obligations.revenue;

let server: ReturnType<typeof installApiServer>;

afterEach(() => {
  server.restore();
});

/** Chargé des honoraires : il voit le planning (relances d'honoraires) sans envoi groupé. */
const BILLING: Record<string, ApiAccount> = {
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
};

async function open(
  entry = '/cga/echeances',
  phone = '0700000002',
  membership: string = demoIds.manager,
) {
  server = installApiServer({ accounts: { ...demoAccounts, ...BILLING } });
  server.signIn(phone, membership);

  const session = await httpAuthApi.currentSession();
  const user = userEvent.setup({ delay: null });
  const view = renderApp({ api: httpAuthApi, session, entry });

  return { user, ...view };
}

/** Texte tel que le lit Testing Library : espaces insécables des montants normalisés. */
function plain(value: string): string {
  return value.replace(/\s/g, ' ');
}

function line(text: string): HTMLElement {
  return screen.getByText(text).closest('li') as HTMLElement;
}

const JOURNEY = { timeout: 20_000 };

describe('/cga/echeances · planning (4.7, F-OBL-06)', JOURNEY, () => {
  it('lignes groupées par date et obligation : adhérents, faits / à faire ; échéances sous 15 jours', async () => {
    await open();

    const list = await screen.findByRole('list', { name: labels.caption });

    expect(within(list).getAllByRole('listitem')).toHaveLength(4);
    expect(
      within(line('15/11/2026 — CNPS — octobre 2026')).getByText(labels.counts('1', '2')),
    ).toBeVisible();
    expect(screen.getByText(labels.upcoming('2', '2', '15'))).toBeVisible();
    expect(screen.getByText(labels.period('03/11/2026', '03/05/2027'))).toBeVisible();
  });

  it('filtres dans l’adresse : statut, obligation, période', async () => {
    const { user, router } = await open();

    await screen.findByRole('list', { name: labels.caption });
    await user.selectOptions(screen.getByLabelText(labels.progress), 'open');
    expect(router.state.location.search).toBe('?statut=open');
    await waitFor(() => {
      expect(screen.queryByText('15/11/2026 — CMU — octobre 2026')).toBeNull();
    });

    await waitFor(() => {
      expect(
        within(screen.getByLabelText(labels.obligation)).getAllByRole('option').length,
      ).toBeGreaterThan(1);
    });
    await user.selectOptions(screen.getByLabelText(labels.obligation), demoObligationTypeIds.tee);
    await waitFor(() => {
      expect(
        within(screen.getByRole('list', { name: labels.caption })).getAllByRole('listitem'),
      ).toHaveLength(1);
    });
    await user.selectOptions(screen.getByLabelText(labels.obligation), '');

    await user.type(screen.getByLabelText(labels.from), '2027-01-01');
    expect(await screen.findByText(labels.empty)).toBeVisible();
    expect(router.state.location.search).toContain('du=2027-01-01');
  });

  it('panneau des adhérents : lien vers l’onglet Obligations ; « Envoyer un rappel » prépare l’envoi groupé', async () => {
    const { user, router } = await open();

    await screen.findByRole('list', { name: labels.caption });
    await user.click(
      screen.getByRole('button', { name: labels.showMembers('CNPS — octobre 2026', '15/11/2026') }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: labels.panel.title('CNPS — octobre 2026', '15/11/2026'),
    });

    expect(
      await within(dialog).findByRole('link', { name: labels.panel.open('BOULANGERIE ADJOUA') }),
    ).toHaveAttribute('href', memberRoutes.detailTab(demoMemberIds.adjoua, 'obligations'));
    expect(within(dialog).getByText(labels.panel.declared)).toBeVisible();
    expect(within(dialog).getByText(labels.panel.remindHint('2'))).toBeVisible();

    await user.click(within(dialog).getByRole('button', { name: labels.panel.remind }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/cga/communications/nouveau');
    });
    expect(router.state.location.search).toBe(
      `?membres=${demoMemberIds.adjoua},${demoMemberIds.bamba}&modele=deadline`,
    );
    expect(await screen.findByText(fr.communications.wizard.selected('2'))).toBeVisible();
  });

  it('ligne entièrement faite : pas de rappel ; ligne sans adhérent listé', async () => {
    const { user } = await open();

    await screen.findByRole('list', { name: labels.caption });
    await user.click(
      screen.getByRole('button', { name: labels.showMembers('CMU — octobre 2026', '15/11/2026') }),
    );
    let dialog = await screen.findByRole('dialog', {
      name: labels.panel.title('CMU — octobre 2026', '15/11/2026'),
    });

    expect(await within(dialog).findAllByRole('listitem')).toHaveLength(2);
    expect(within(dialog).queryByRole('button', { name: labels.panel.remind })).toBeNull();
    const closers = within(dialog).getAllByRole('button', { name: fr.common.close });

    await user.click(closers[closers.length - 1]);

    await user.click(
      screen.getByRole('button', {
        name: labels.showMembers('Visite annuelle du centre', '31/12/2026'),
      }),
    );
    dialog = await screen.findByRole('dialog', {
      name: labels.panel.title('Visite annuelle du centre', '31/12/2026'),
    });
    expect(await within(dialog).findByText(labels.panel.empty)).toBeVisible();
  });

  it('chargé des honoraires : planning sans « Envoyer un rappel »', async () => {
    const { user } = await open('/cga/echeances', '0700000021', '01ms0000000000000000000b21');

    await screen.findByRole('list', { name: labels.caption });
    await user.click(
      screen.getByRole('button', { name: labels.showMembers('CNPS — octobre 2026', '15/11/2026') }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: labels.panel.title('CNPS — octobre 2026', '15/11/2026'),
    });

    await within(dialog).findAllByRole('listitem');
    expect(within(dialog).queryByRole('button', { name: labels.panel.remind })).toBeNull();
  });

  it('échecs du chargement : planning, puis adhérents d’une ligne', async () => {
    server = installApiServer();
    server.signIn('0700000002', demoIds.manager);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      server.failNext('GET', apiUrl('/cga/obligation-planning'), { status: 500 });
      server.failNext('GET', apiUrl('/cga/obligation-planning/members'), { status: 500 });
    }
    const session = await httpAuthApi.currentSession();
    const user = userEvent.setup({ delay: null });
    const { router } = renderApp({ api: httpAuthApi, session, entry: '/cga/echeances' });

    expect(await screen.findByText(labels.loadError, {}, { timeout: 5_000 })).toBeVisible();

    await router.navigate('/cga/echeances?statut=done');
    await screen.findByRole('list', { name: labels.caption });
    await user.click(
      screen.getByRole('button', { name: labels.showMembers('CNPS — octobre 2026', '15/11/2026') }),
    );
    expect(await screen.findByText(labels.panel.loadError, {}, { timeout: 5_000 })).toBeVisible();
  });
});

describe('/cga/echeances · mobilisation des recettes (4.7, RG-OBL-08)', JOURNEY, () => {
  it('totaux, par nature d’impôt et par contribuable ; montants à saisir signalés ; lien vers le dossier', async () => {
    const { user, router } = await open();

    await user.click(await screen.findByRole('tab', { name: labels.tabs.revenue }));
    expect(router.state.location.search).toBe('?onglet=revenue');
    const totals = await screen.findByRole('region', { name: revenue.totals });

    expect(within(totals).getByText(plain(formatAmount(120_000)))).toBeVisible();
    expect(within(totals).getByText('62,5 %')).toBeVisible();
    expect(within(totals).getByText(revenue.toEnter('1'))).toBeVisible();

    const natures = screen.getByRole('list', { name: revenue.natures });

    expect(
      within(natures)
        .getAllByRole('listitem')
        .map((item) => item.firstChild?.textContent),
    ).toEqual(['TEE', 'CNPS']);
    expect(within(natures).getByText(`${revenue.rate} : 100 %`)).toBeVisible();
    expect(screen.getByText(revenue.membersNote('2', '3'))).toBeVisible();
    expect(screen.getByRole('link', { name: revenue.open('BOULANGERIE ADJOUA') })).toHaveAttribute(
      'href',
      memberRoutes.detailTab(demoMemberIds.adjoua, 'obligations'),
    );

    await user.type(screen.getByLabelText(revenue.from), '2026-10-02');
    expect(await screen.findByText(revenue.empty)).toBeVisible();
    expect(screen.getByText(`${revenue.rate}`)).toBeVisible();
    expect(screen.getAllByText(revenue.noRate).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('tab', { name: labels.tabs.planning }));
    expect(router.state.location.search).toBe('');
  });

  it('échec du chargement : message', async () => {
    server = installApiServer();
    server.signIn('0700000002', demoIds.manager);
    server.failNext('GET', apiUrl('/cga/obligation-planning/revenue'), { status: 500 });
    server.failNext('GET', apiUrl('/cga/obligation-planning/revenue'), { status: 500 });
    const session = await httpAuthApi.currentSession();

    renderApp({ api: httpAuthApi, session, entry: '/cga/echeances?onglet=revenue' });

    expect(await screen.findByText(revenue.loadError, {}, { timeout: 5_000 })).toBeVisible();
  });
});
