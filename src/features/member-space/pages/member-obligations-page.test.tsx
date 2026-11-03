import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { httpAuthApi } from '@/features/auth/api/auth-api';
import { formatAmount } from '@/lib/format';
import { fr } from '@/lib/i18n/fr';
import { demoInstanceIds } from '@/test/api-obligations';
import { apiUrl, demoIds, installApiServer } from '@/test/api-server';
import { demoMemberIds } from '@/test/demo-members';
import { renderApp } from '@/test/render-app';

/*
 * Espace adhérent, étape 4.8 (06-IMPLEMENTATION-PLAN, F-OBL-05, F-DSH-03, RG-OBL-09) :
 * `/adherent/obligations` (blocs repliables, « Total dû », « Signaler comme fait / payé ») et
 * l'accueil complet (prochaine échéance, impôts dus, CNPS et CMU, échéances du mois, honoraires,
 * documents récents). Jour de référence : 03/11/2026.
 */
const labels = fr.obligations.member;
const home = fr.memberSpace.home;

let server: ReturnType<typeof installApiServer>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-03T10:00:00Z'));
});

afterEach(() => {
  server.restore();
  vi.useRealTimers();
});

async function open(entry: string) {
  server = installApiServer();
  server.signIn('0700000012', demoIds.memberOwner);

  const session = await httpAuthApi.currentSession();
  const user = userEvent.setup({ delay: null });
  const view = renderApp({ api: httpAuthApi, session, entry });

  return { user, ...view };
}

/** Texte tel que le lit Testing Library : espaces insécables des montants normalisés. */
function plain(value: string): string {
  return value.replace(/\s/g, ' ');
}

function line(label: string): HTMLElement {
  return screen.getByText(label).closest('li') as HTMLElement;
}

function state(id: string) {
  return server.obligations.instances(demoMemberIds.adjoua).find((item) => item.id === id);
}

const JOURNEY = { timeout: 20_000 };

describe('/adherent/obligations (4.8, F-OBL-05)', JOURNEY, () => {
  it('quatre blocs repliables avec leur « Total dû » ; déclarations en attente de confirmation', async () => {
    const { user } = await open('/adherent/obligations');

    await screen.findByRole('heading', { level: 1, name: labels.title });
    const taxes = await screen.findByRole('list', { name: fr.obligations.categories.tax });

    expect(screen.getByText(plain(fr.obligations.tab.summary(formatAmount(20_000))))).toBeVisible();
    expect(screen.getByText(plain(fr.obligations.tab.summary(formatAmount(45_000))))).toBeVisible();
    expect(within(line('CNPS — octobre 2026')).getByText(labels.pending)).toBeVisible();
    expect(
      within(line('CNPS — octobre 2026')).queryByRole('button', { name: labels.declarePaid }),
    ).toBeNull();
    expect(within(line('TEE — 4e trimestre 2026')).getByText(labels.amountPending)).toBeVisible();
    expect(
      within(line('Visite annuelle du centre')).queryByRole('button', { name: labels.declareDone }),
    ).toBeNull();

    // Bloc replié : ses lignes ne sont plus visibles.
    await user.click(
      within(taxes.closest('details') as HTMLElement).getByText(fr.obligations.categories.tax),
    );
    expect(within(taxes).getByText('TEE — 3e trimestre 2026')).not.toBeVisible();
  });

  it('RG-OBL-09 · signaler un paiement : montant obligatoire, refus au-delà du reste dû, puis en attente', async () => {
    const { user } = await open('/adherent/obligations');

    await screen.findByRole('list', { name: fr.obligations.categories.tax });
    await user.click(
      within(line('TEE — 3e trimestre 2026')).getByRole('button', { name: labels.declarePaid }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: labels.payTitle('TEE — 3e trimestre 2026'),
    });
    const amount = within(dialog).getByLabelText(
      new RegExp(fr.obligations.dialogs.paidAmount.replace(/[()]/g, '.')),
    );

    expect(amount).toHaveValue('20000');
    await user.clear(amount);
    await user.click(within(dialog).getByRole('button', { name: labels.submit }));
    expect(within(dialog).getByText(fr.obligations.dialogs.invalidAmount)).toBeVisible();
    await user.type(amount, '25000');
    await user.click(within(dialog).getByRole('button', { name: labels.submit }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      /Le paiement dépasse le reste dû/,
    );

    await user.clear(amount);
    await user.type(amount, '20000');
    await user.upload(
      within(dialog).getByLabelText(new RegExp(fr.obligations.dialogs.proof.replace(/[()]/g, '.'))),
      new File(['%PDF-1.4'], 'recu.pdf', { type: 'application/pdf' }),
    );
    await user.click(within(dialog).getByRole('button', { name: labels.submit }));

    // Le toast suit le refus précédent : présent ; la ligne en attente fait foi.
    expect(await screen.findByText(labels.declared)).toBeInTheDocument();
    await waitFor(() => {
      expect(within(line('TEE — 3e trimestre 2026')).getByText(labels.pending)).toBeVisible();
    });
    expect(state(demoInstanceIds.teeT3)?.member_declared_status).toBe('paid');
  });

  it('RG-OBL-09 · signaler une déclaration faite, sans montant', async () => {
    const { user } = await open('/adherent/obligations');
    const label = 'Déclaration CNPS — octobre 2026';

    await screen.findByRole('list', { name: fr.obligations.categories.cnps });
    await user.click(within(line(label)).getByRole('button', { name: labels.declareDone }));
    const dialog = await screen.findByRole('dialog', { name: labels.doneTitle(label) });

    expect(within(dialog).getByText(labels.doneConfirm)).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: labels.submit }));

    expect(await screen.findByText(labels.declared)).toBeVisible();
    expect(state(demoInstanceIds.cnpsDeclaration)?.member_declared_status).toBe('done');
  });

  it('déclaration rejetée par le CGA : motif affiché, nouvelle déclaration possible', async () => {
    server = installApiServer();
    server.signIn('0700000012', demoIds.memberOwner);
    // Le CGA rejette la déclaration de la DSF, depuis l'onglet Obligations du dossier.
    server.obligations.route(
      'POST',
      `/cga/members/${demoMemberIds.adjoua}/obligation-instances/${demoInstanceIds.dsf}/member-declaration/reject`,
      new URLSearchParams(),
      { reason: 'Pas de récépissé' },
      { allows: () => true },
    );
    const session = await httpAuthApi.currentSession();
    const user = userEvent.setup({ delay: null });

    renderApp({ api: httpAuthApi, session, entry: '/adherent/obligations' });

    const label = 'Déclaration statistique et fiscale 2025';

    await screen.findByRole('list', { name: fr.obligations.categories.tax });
    expect(within(line(label)).getByText(labels.rejected('Pas de récépissé'))).toBeVisible();
    await user.click(within(line(label)).getByRole('button', { name: labels.declareDone }));
    await user.click(
      within(await screen.findByRole('dialog', { name: labels.doneTitle(label) })).getByRole(
        'button',
        { name: labels.submit },
      ),
    );
    expect(await screen.findByText(labels.declared)).toBeVisible();
  });

  it('échec du chargement : message et « Réessayer »', async () => {
    server = installApiServer();
    server.signIn('0700000012', demoIds.memberOwner);
    server.failNext('GET', apiUrl('/member/obligations'), { status: 500 });
    server.failNext('GET', apiUrl('/member/obligations'), { status: 500 });
    const session = await httpAuthApi.currentSession();
    const user = userEvent.setup({ delay: null });

    renderApp({ api: httpAuthApi, session, entry: '/adherent/obligations' });

    expect(await screen.findByText(labels.loadError, {}, { timeout: 5_000 })).toBeVisible();
    await user.click(screen.getByRole('button', { name: fr.common.retry }));
    expect(await screen.findByRole('list', { name: fr.obligations.categories.tax })).toBeVisible();
  });
});

describe('/adherent/accueil complet (4.8, F-DSH-03)', JOURNEY, () => {
  it('prochaine échéance, impôts dus, CNPS et CMU, échéances du mois, honoraires, documents récents', async () => {
    await open('/adherent/accueil');

    const next = await screen.findByRole('region', { name: home.next });

    expect(
      within(next).getByText(home.nextLine('Déclaration CNPS — octobre 2026', '15/11/2026')),
    ).toBeVisible();
    expect(within(next).getByRole('link', { name: home.seeObligations })).toHaveAttribute(
      'href',
      '/adherent/obligations',
    );
    expect(within(next).getByText(home.overdue('1'))).toBeVisible();

    const dues = screen.getByRole('region', { name: home.dues });

    expect(within(dues).getByText(plain(formatAmount(20_000)))).toBeVisible();
    expect(within(dues).getByText(plain(formatAmount(45_000)))).toBeVisible();

    const month = screen.getByRole('region', { name: home.month });

    // Le paiement CNPS déjà signalé au CGA n'est plus « à traiter » : seule la déclaration reste.
    expect(
      within(month)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Déclaration CNPS — octobre 202615/11/2026']);

    const fees = screen.getByRole('region', { name: home.feesCard });

    expect(
      await within(fees).findByText(plain(home.feesBalance(formatAmount(17_700)))),
    ).toBeVisible();
    expect(await screen.findByRole('region', { name: home.recentDocuments })).toBeVisible();
  });
});
