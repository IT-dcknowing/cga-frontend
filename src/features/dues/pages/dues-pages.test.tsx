import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { httpAuthApi } from '@/features/auth/api/auth-api';
import { fr } from '@/lib/i18n/fr';
import { createDuesBackend, demoDuesIds } from '@/test/api-dues';
import { demoIds, installApiServer } from '@/test/api-server';
import { renderApp } from '@/test/render-app';

/*
 * Cotisation CNCGA, étapes 6.7 et 6.9 (06-IMPLEMENTATION-PLAN, F-COT-02 à 06, RG-COT-04 à 06,
 * RG-FNE-01) : `/cncga/cotisations` (examen, paiement reçu, relance, facture), onglet Cotisations de
 * la fiche CGA, `/cga/cotisation` (déclaration avec preuve, reçus, facture certifiée). Vrai client
 * `http`, backend simulé (`api-dues.ts`).
 */
const labels = fr.dues;
const YEAR = String(new Date().getFullYear());

let server: ReturnType<typeof installApiServer>;

afterEach(() => {
  server.restore();
});

async function open(
  phone: string,
  membership: string,
  entry: string,
  prepare: (dues: ReturnType<typeof createDuesBackend>) => void = () => undefined,
) {
  const dues = createDuesBackend();

  prepare(dues);

  server = installApiServer({ dues });
  server.signIn(phone, membership);

  const session = await httpAuthApi.currentSession();
  const user = userEvent.setup({ delay: null });
  const view = renderApp({ api: httpAuthApi, session, entry });

  return { user, dues, ...view };
}

type User = ReturnType<typeof userEvent.setup>;

function row(name: string): HTMLElement {
  return screen.getByText(name).closest('li') as HTMLElement;
}

async function action(user: User, cga: string, item: string) {
  await user.click(within(row(cga)).getByRole('button', { name: labels.rowActions(cga) }));
  await user.click(screen.getByRole('menuitem', { name: item }));
}

const JOURNEY = { timeout: 20_000 };

describe('/cncga/cotisations (6.7)', JOURNEY, () => {
  it('RG-COT-04 · suivi de l’année : totaux, statut, paiement à confirmer ; examen → confirmé avec reçu', async () => {
    const { user, dues } = await open('0700000001', demoIds.president, '/cncga/cotisations');

    await screen.findByRole('list', { name: labels.caption(YEAR) });
    expect(screen.getByText(/Total dû/)).toHaveTextContent(/reste 1\s125\s000\sF/);
    expect(
      within(row('DC-KNOWING CGA')).getByText(fr.status.payment.pending_confirmation),
    ).toBeVisible();
    expect(within(row('CGA Démo Bouaké')).getByText(labels.prorata('0.5'))).toBeVisible();

    await action(user, 'DC-KNOWING CGA', labels.actions.review);
    const dialog = await screen.findByRole('dialog', {
      name: labels.review.title('DC-KNOWING CGA'),
    });

    expect(within(dialog).getByRole('link', { name: labels.actions.proof })).toHaveAttribute(
      'href',
      'https://files.test/virement.pdf',
    );
    await user.click(within(dialog).getByRole('button', { name: labels.review.confirm }));

    expect(await screen.findByText(labels.review.confirmed(`CNC-${YEAR}-00001`))).toBeVisible();
    const confirmed = dues.dues().find((item) => item.id === demoDuesIds.dck);

    expect(confirmed?.status).toBe('partial');
    await waitFor(() => {
      expect(within(row('DC-KNOWING CGA')).getByText(fr.status.dues.partial)).toBeVisible();
    });
  });

  it('rejet : motif obligatoire ; le paiement est rejeté', async () => {
    const { user, dues } = await open('0700000001', demoIds.president, '/cncga/cotisations');

    await screen.findByRole('list', { name: labels.caption(YEAR) });
    await action(user, 'DC-KNOWING CGA', labels.actions.review);
    const dialog = await screen.findByRole('dialog', {
      name: labels.review.title('DC-KNOWING CGA'),
    });

    await user.click(within(dialog).getByRole('button', { name: labels.review.reject }));
    await user.click(within(dialog).getByRole('button', { name: labels.review.reject }));
    expect(await within(dialog).findByText(labels.payment.required)).toBeVisible();

    await user.type(
      within(dialog).getByLabelText(new RegExp(labels.review.reason)),
      'Preuve illisible',
    );
    await user.click(within(dialog).getByRole('button', { name: labels.review.reject }));

    expect(await screen.findByText(labels.review.rejectedToast)).toBeVisible();
    expect(dues.dues()[0].payments?.[0].status).toBe('rejected');
  });

  it('paiement reçu, relance sans sanction, facture FNE unique (6.9)', async () => {
    const { user, dues } = await open('0700000001', demoIds.president, '/cncga/cotisations');

    await screen.findByRole('list', { name: labels.caption(YEAR) });
    await action(user, 'CGA Démo Bouaké', labels.actions.record);
    let dialog = await screen.findByRole('dialog', {
      name: labels.record.title('CGA Démo Bouaké'),
    });

    await user.click(within(dialog).getByRole('button', { name: labels.record.submit }));
    expect(await within(dialog).findByText(labels.payment.amountInvalid)).toBeVisible();
    await user.type(
      within(dialog).getByLabelText(new RegExp(labels.payment.amount.replace(/[()]/g, '.'))),
      '900000',
    );
    await user.click(within(dialog).getByRole('button', { name: labels.record.submit }));
    expect(await within(dialog).findByText('Le montant dépasse le reste dû.')).toBeVisible();
    await user.clear(
      within(dialog).getByLabelText(new RegExp(labels.payment.amount.replace(/[()]/g, '.'))),
    );
    await user.type(
      within(dialog).getByLabelText(new RegExp(labels.payment.amount.replace(/[()]/g, '.'))),
      '100000',
    );
    await user.click(within(dialog).getByRole('button', { name: labels.record.submit }));
    expect(await screen.findByText(labels.record.done(`CNC-${YEAR}-00001`))).toBeVisible();

    await action(user, 'CGA Démo Bouaké', labels.actions.remind);
    dialog = await screen.findByRole('dialog', { name: labels.remind.title('CGA Démo Bouaké') });
    expect(within(dialog).getByText(labels.remind.noSanction)).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: labels.remind.send }));
    expect(await screen.findByText(labels.remind.sent)).toBeVisible();

    await action(user, 'CGA Démo Bouaké', labels.actions.invoice);
    dialog = await screen.findByRole('dialog', { name: labels.invoice.title('CGA Démo Bouaké') });
    await user.click(within(dialog).getByRole('button', { name: labels.invoice.submit }));
    expect(await screen.findByText(labels.invoice.done(`FAC-CNCGA-${YEAR}-00001`))).toBeVisible();

    const bouake = dues.dues().find((item) => item.id === demoDuesIds.bouake);

    expect(bouake?.reminder_count).toBe(1);
    expect(bouake?.invoice?.status).toBe('pending_certification');
    await user.click(
      within(row('CGA Démo Bouaké')).getByRole('button', {
        name: labels.rowActions('CGA Démo Bouaké'),
      }),
    );
    expect(screen.queryByRole('menuitem', { name: labels.actions.invoice })).toBeNull();
  });

  it('filtre par statut dans l’adresse ; onglet Cotisations de la fiche CGA', async () => {
    const { user, router } = await open('0700000001', demoIds.president, '/cncga/cotisations');

    await screen.findByRole('list', { name: labels.caption(YEAR) });
    await user.selectOptions(screen.getByLabelText(labels.status), 'paid');
    expect(router.state.location.search).toBe('?statut=paid');
    expect(await screen.findByText(labels.empty)).toBeVisible();

    await router.navigate(`/cncga/membres/${demoIds.dck}`);
    await user.click(await screen.findByRole('tab', { name: fr.organization.tabs.dues }));
    expect(await screen.findByRole('list', { name: labels.caption(YEAR) })).toBeVisible();
    expect(screen.getByText(YEAR)).toBeVisible();
  });
});

describe('/cga/cotisation (6.7, F-COT-06)', JOURNEY, () => {
  it('le gérant déclare un paiement, preuve obligatoire ; facture visible une fois certifiée', async () => {
    const { user, dues } = await open('0700000002', demoIds.manager, '/cga/cotisation');

    const card = await screen.findByRole('region', { name: labels.caption(YEAR) });

    expect(within(card).getAllByText(fr.status.payment.pending_confirmation)).toHaveLength(2);
    expect(
      within(card).queryByRole('link', { name: new RegExp(labels.actions.downloadInvoice) }),
    ).toBeNull();

    await user.click(within(card).getByRole('button', { name: labels.actions.declare }));
    const dialog = await screen.findByRole('dialog', { name: labels.declare.title(YEAR) });

    await user.type(
      within(dialog).getByLabelText(new RegExp(labels.payment.amount.replace(/[()]/g, '.'))),
      '50000',
    );
    await user.click(within(dialog).getByRole('button', { name: labels.declare.submit }));
    expect(await within(dialog).findByText(labels.payment.required)).toBeVisible();

    await user.upload(
      within(dialog).getByLabelText(new RegExp(labels.payment.proof)),
      new File(['%PDF-1.4'], 'virement.pdf', { type: 'application/pdf' }),
    );
    await user.click(within(dialog).getByRole('button', { name: labels.declare.submit }));
    expect(await screen.findByText(labels.declare.done)).toBeVisible();
    expect(dues.dues()[0].payments).toHaveLength(2);
  });

  it('RG-FNE-01 · la facture de cotisation n’apparaît au centre qu’une fois certifiée', async () => {
    await open('0700000002', demoIds.manager, '/cga/cotisation', (dues) => {
      dues.dues()[0].invoice = {
        id: '01inv0000000000000000000d1',
        number: `FAC-CNCGA-${YEAR}-00001`,
        status: 'pending_certification',
        status_label: 'En attente de certification',
        pdf_url: null,
      };
      dues.certify(demoDuesIds.dck);
    });

    const card = await screen.findByRole('region', { name: labels.caption(YEAR) });

    expect(
      within(card).getByRole('link', { name: new RegExp(labels.actions.downloadInvoice) }),
    ).toHaveAttribute('href', 'https://files.test/facture-cotisation.pdf');
  });

  it('l’expert-comptable consulte sans pouvoir déclarer', async () => {
    await open('0700000003', demoIds.multiDck, '/cga/cotisation');

    const card = await screen.findByRole('region', { name: labels.caption(YEAR) });

    expect(within(card).queryByRole('button', { name: labels.actions.declare })).toBeNull();
    expect(within(card).getByText(labels.own.deadline(`30/06/${YEAR}`))).toBeVisible();
  });
});
