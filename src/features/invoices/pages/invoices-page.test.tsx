import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { httpAuthApi } from '@/features/auth/api/auth-api';
import { cgaSettingsRoutes } from '@/features/cga-settings/lib/routes';
import { memberRoutes } from '@/features/members/lib/member';
import { fr } from '@/lib/i18n/fr';
import { apiUrl, demoIds, installApiServer } from '@/test/api-server';
import { demoMemberIds } from '@/test/demo-members';
import { fieldByLabel } from '@/test/fields';
import { renderApp } from '@/test/render-app';

/*
 * Factures FNE, étape 3.14 (06-IMPLEMENTATION-PLAN, F-PAY-05, 06, F-ADM-07, RG-FNE-01 à 05) :
 * `/cga/factures` (statut FNE, émission, saisie de la certification, resoumission, annulation, avoir,
 * remise), onglet « Facturation FNE » de `/cga/parametres`, factures dans le dossier. Vrai client
 * `http`, backend simulé (`api-invoices.ts`).
 */
const labels = fr.invoices;
const PAGE = '/cga/factures';

let server: ReturnType<typeof installApiServer>;

afterEach(() => {
  server.restore();
});

async function open(entry: string) {
  server = installApiServer();
  server.signIn('0700000002', demoIds.manager);

  const session = await httpAuthApi.currentSession();
  const user = userEvent.setup({ delay: null });
  const view = renderApp({ api: httpAuthApi, session, entry });

  return { user, ...view };
}

type User = ReturnType<typeof userEvent.setup>;

async function action(user: User, number: string, item: string) {
  await user.click(screen.getByRole('button', { name: labels.rowActions(number) }));
  await user.click(screen.getByRole('menuitem', { name: item }));
}

function row(number: string): HTMLElement {
  return screen.getByText(new RegExp(`^${number} ·`)).closest('li') as HTMLElement;
}

function writes(suffix: string) {
  return server.requests.filter(
    (request) => request.method !== 'GET' && new URL(request.url).pathname.endsWith(suffix),
  );
}

const JOURNEY = { timeout: 15_000 };

describe('/cga/factures (3.14, RG-FNE-01 à 04)', JOURNEY, () => {
  it('RG-FNE-01 · liste : statut FNE ; seule la facture certifiée se télécharge ; motif d’un rejet ; filtre', async () => {
    const { user, router } = await open(PAGE);

    await screen.findByRole('list', { name: labels.caption });

    const certified = row('FAC-DCK-2026-00001');

    expect(within(certified).getByText(fr.status.invoice.certified)).toBeVisible();
    expect(within(certified).getByText(/n° FNE FNE-2026-000123/)).toBeVisible();
    expect(within(certified).getByRole('link', { name: labels.download })).toHaveAttribute(
      'href',
      'https://files.test/facture.pdf',
    );
    expect(
      within(row('FAC-DCK-2026-00002')).queryByRole('link', { name: labels.download }),
    ).toBeNull();
    expect(
      within(row('FAC-DCK-2026-00003')).getByText(
        labels.rejected('NCC du client inconnu de la DGI.'),
      ),
    ).toBeVisible();

    await user.selectOptions(screen.getByLabelText(labels.status), 'rejected');
    expect(router.state.location.search).toBe('?statut=rejected');
    await waitFor(() => {
      expect(
        within(screen.getByRole('list', { name: labels.caption })).getAllByRole('listitem'),
      ).toHaveLength(1);
    });
  });

  it('F-PAY-05 · « Émettre une facture » : adhérent et somme due exigés, puis soumise à la certification', async () => {
    const { user } = await open(PAGE);

    await screen.findByRole('list', { name: labels.caption });
    await user.click(screen.getByRole('button', { name: labels.issue.action }));

    const dialog = screen.getByRole('dialog', { name: labels.issue.title });

    await user.click(within(dialog).getByRole('button', { name: labels.issue.submit }));
    expect(await within(dialog).findByText(fr.members.create.errors.required)).toBeVisible();

    await user.type(fieldByLabel(dialog, labels.issue.search), 'Adjoua');
    await waitFor(() => {
      expect(
        within(fieldByLabel(dialog, labels.issue.member)).getByRole('option', {
          name: 'BOULANGERIE ADJOUA',
        }),
      ).toBeInTheDocument();
    });
    await user.selectOptions(fieldByLabel(dialog, labels.issue.member), demoMemberIds.adjoua);

    const fees = await within(dialog).findByRole('checkbox', { name: /Honoraires · 01\/10\/2026/ });

    await user.click(within(dialog).getByRole('button', { name: labels.issue.submit }));
    expect(await within(dialog).findByText(labels.issue.chargesRequired)).toBeVisible();

    await user.click(fees);
    await user.click(within(dialog).getByRole('button', { name: labels.issue.submit }));

    expect(await screen.findByText(labels.issue.done('FAC-DCK-2026-00004'))).toBeInTheDocument();
    expect(writes('/cga/invoices').at(-1)?.body).toEqual({
      member_id: demoMemberIds.adjoua,
      charge_ids: ['01chg000000000000000000002'],
    });
    expect(await screen.findByText(/^FAC-DCK-2026-00004 ·/)).toBeVisible();
  });

  it('RG-FNE-02 · mode manuel : « Saisir la certification » (numéro et PDF exigés), puis certifiée et téléchargeable', async () => {
    const { user } = await open(PAGE);

    await screen.findByRole('list', { name: labels.caption });
    await action(user, 'FAC-DCK-2026-00002', labels.certify.action);

    const dialog = screen.getByRole('dialog', { name: labels.certify.title });

    await user.click(within(dialog).getByRole('button', { name: labels.certify.submit }));
    expect(await within(dialog).findAllByText(fr.members.create.errors.required)).toHaveLength(2);

    await user.type(fieldByLabel(dialog, labels.certify.number), 'FNE-2026-000999');
    await user.upload(
      fieldByLabel(dialog, labels.certify.file),
      new File(['%PDF-1.4'], 'certifiee.pdf', { type: 'application/pdf' }),
    );
    await user.click(within(dialog).getByRole('button', { name: labels.certify.submit }));

    expect(await screen.findByText(labels.certify.done('FAC-DCK-2026-00002'))).toBeInTheDocument();
    await waitFor(() => {
      expect(
        within(row('FAC-DCK-2026-00002')).getByText(fr.status.invoice.certified),
      ).toBeVisible();
    });
    expect(
      within(row('FAC-DCK-2026-00002')).getByRole('link', { name: labels.download }),
    ).toHaveAttribute('href', 'https://files.test/certifiee.pdf');
  });

  it('rejet : « Corriger et resoumettre » ; annulation d’une facture non certifiée avec motif', async () => {
    const { user } = await open(PAGE);

    await screen.findByRole('list', { name: labels.caption });
    await action(user, 'FAC-DCK-2026-00003', labels.resubmit);
    expect(await screen.findByText(labels.resubmitted('FAC-DCK-2026-00003'))).toBeInTheDocument();
    await waitFor(() => {
      expect(
        within(row('FAC-DCK-2026-00003')).getByText(fr.status.invoice.pending_certification),
      ).toBeVisible();
    });

    await action(user, 'FAC-DCK-2026-00002', labels.cancel.action);

    const dialog = screen.getByRole('dialog', { name: labels.cancel.title });

    expect(within(dialog).getByText(labels.cancel.effects[1])).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: labels.cancel.submit }));
    expect(await within(dialog).findByText(fr.members.create.errors.required)).toBeVisible();
    await user.type(fieldByLabel(dialog, labels.cancel.reason), 'Erreur de période');
    await user.click(within(dialog).getByRole('button', { name: labels.cancel.submit }));

    expect(await screen.findByText(labels.cancel.done('FAC-DCK-2026-00002'))).toBeInTheDocument();
    expect(writes('/cancel').at(-1)?.body).toEqual({ reason: 'Erreur de période' });
  });

  it('RG-FNE-03 · facture certifiée : envoyée à l’adhérent, corrigée par un avoir ; refus (409) en toast', async () => {
    const { user } = await open(PAGE);

    await screen.findByRole('list', { name: labels.caption });
    expect(screen.queryByRole('menuitem', { name: labels.cancel.action })).toBeNull();
    await action(user, 'FAC-DCK-2026-00001', labels.deliver);
    expect(await screen.findByText(labels.delivered('FAC-DCK-2026-00001'))).toBeInTheDocument();

    await action(user, 'FAC-DCK-2026-00001', labels.creditNote);
    expect(await screen.findByText(labels.creditNoted('AV-DCK-2026-00004'))).toBeInTheDocument();
    expect(await screen.findByText(/^AV-DCK-2026-00004 ·/)).toBeVisible();

    server.failNext('POST', apiUrl('/cga/invoices/01inv000000000000000000001/deliver'), {
      status: 409,
      data: { message: 'Adhérent sans accès en ligne.', code: 'no_online_access', details: {} },
    });
    await action(user, 'FAC-DCK-2026-00001', labels.deliver);
    expect(await screen.findByText('Adhérent sans accès en ligne.')).toBeInTheDocument();
  });

  it('panne : bandeau et « Réessayer » ; refus d’émission (409) dans la modale', async () => {
    server = installApiServer();
    server.signIn('0700000002', demoIds.manager);
    for (let attempt = 0; attempt < 2; attempt++) {
      server.failNext('GET', apiUrl('/cga/invoices'), {
        status: 500,
        data: { message: 'Erreur.' },
      });
    }

    const session = await httpAuthApi.currentSession();
    const user = userEvent.setup({ delay: null });

    renderApp({ api: httpAuthApi, session, entry: PAGE });
    expect(await screen.findByText(labels.loadError, {}, { timeout: 4000 })).toBeVisible();
    await user.click(screen.getByRole('button', { name: fr.common.retry }));
    await screen.findByRole('list', { name: labels.caption });

    await user.click(screen.getByRole('button', { name: labels.issue.action }));

    const dialog = screen.getByRole('dialog', { name: labels.issue.title });

    await waitFor(() => {
      expect(
        within(fieldByLabel(dialog, labels.issue.member)).getAllByRole('option').length,
      ).toBeGreaterThan(1);
    });
    await user.selectOptions(fieldByLabel(dialog, labels.issue.member), demoMemberIds.adjoua);
    await user.click(await within(dialog).findByRole('checkbox', { name: /Honoraires/ }));
    server.failNext('POST', apiUrl('/cga/invoices'), {
      status: 409,
      data: { message: 'Facturation FNE non paramétrée.', code: 'fne_not_configured', details: {} },
    });
    await user.click(within(dialog).getByRole('button', { name: labels.issue.submit }));
    expect(await within(dialog).findByText('Facturation FNE non paramétrée.')).toBeVisible();
  });
});

describe('/cga/factures · refus du serveur dans les modales (3.14)', JOURNEY, () => {
  it('émission : somme décochée, 422 sous la liste ; certification : 409, 422 numéro et PDF ; annulation : 409', async () => {
    const { user } = await open(PAGE);

    await screen.findByRole('list', { name: labels.caption });
    await user.click(screen.getByRole('button', { name: labels.issue.action }));

    const issue = screen.getByRole('dialog', { name: labels.issue.title });

    await waitFor(() => {
      expect(
        within(fieldByLabel(issue, labels.issue.member)).getAllByRole('option').length,
      ).toBeGreaterThan(1);
    });
    await user.selectOptions(fieldByLabel(issue, labels.issue.member), demoMemberIds.adjoua);

    const fees = await within(issue).findByRole('checkbox', { name: /Honoraires/ });

    await user.click(fees);
    await user.click(fees);
    expect(fees).not.toBeChecked();
    await user.click(fees);
    server.failNext('POST', apiUrl('/cga/invoices'), {
      status: 422,
      data: { message: 'Invalide.', errors: { charge_ids: ['Cette somme est déjà facturée.'] } },
    });
    await user.click(within(issue).getByRole('button', { name: labels.issue.submit }));
    expect(await within(issue).findByText('Cette somme est déjà facturée.')).toBeVisible();
    await user.click(within(issue).getByRole('button', { name: fr.common.cancel }));

    await action(user, 'FAC-DCK-2026-00002', labels.certify.action);

    const certify = screen.getByRole('dialog', { name: labels.certify.title });
    const url = apiUrl('/cga/invoices/01inv000000000000000000002/manual-certification');

    await user.type(fieldByLabel(certify, labels.certify.number), 'FNE-1');
    await user.upload(
      fieldByLabel(certify, labels.certify.file),
      new File(['%PDF-1.4'], 'certifiee.pdf', { type: 'application/pdf' }),
    );
    server.failNext('POST', url, {
      status: 409,
      data: { message: 'Facture déjà certifiée.', code: 'invoice_certified', details: {} },
    });
    await user.click(within(certify).getByRole('button', { name: labels.certify.submit }));
    expect(await within(certify).findByText('Facture déjà certifiée.')).toBeVisible();

    server.failNext('POST', url, {
      status: 422,
      data: { message: 'Invalide.', errors: { file: ['Le PDF est illisible.'] } },
    });
    await user.click(within(certify).getByRole('button', { name: labels.certify.submit }));
    expect(await within(certify).findByText('Le PDF est illisible.')).toBeVisible();

    server.failNext('POST', url, {
      status: 422,
      data: { message: 'Invalide.', errors: { fne_number: ['Le numéro ne suit pas le format.'] } },
    });
    await user.click(within(certify).getByRole('button', { name: labels.certify.submit }));
    expect(await within(certify).findByText('Le numéro ne suit pas le format.')).toBeVisible();
    await user.click(within(certify).getByRole('button', { name: fr.common.cancel }));

    await action(user, 'FAC-DCK-2026-00002', labels.cancel.action);

    const cancel = screen.getByRole('dialog', { name: labels.cancel.title });

    await user.type(fieldByLabel(cancel, labels.cancel.reason), 'Erreur');
    server.failNext('POST', apiUrl('/cga/invoices/01inv000000000000000000002/cancel'), {
      status: 409,
      data: { message: 'Certification en cours.', code: 'invoice_not_cancellable', details: {} },
    });
    await user.click(within(cancel).getByRole('button', { name: labels.cancel.submit }));
    expect(await within(cancel).findByText('Certification en cours.')).toBeVisible();
    await user.click(within(cancel).getByRole('button', { name: fr.common.cancel }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});

describe('Dossier · factures de l’adhérent (3.14)', JOURNEY, () => {
  it('onglet « Honoraires et paiements » : ses factures seulement ; « Émettre une facture » pour lui', async () => {
    const { user } = await open(memberRoutes.detail(demoMemberIds.adjoua));

    await screen.findByRole('heading', { level: 1, name: 'BOULANGERIE ADJOUA' });
    await user.click(screen.getByRole('tab', { name: fr.members.detail.tabs.finance }));

    const invoices = within(await screen.findByRole('list', { name: labels.caption }));

    expect(invoices.getByText(/^FAC-DCK-2026-00001 ·/)).toBeVisible();
    expect(invoices.queryByText(/^FAC-DCK-2026-00003 ·/)).toBeNull();

    await user.click(screen.getByRole('button', { name: labels.issue.action }));

    const dialog = screen.getByRole('dialog', { name: labels.issue.title });

    expect(within(dialog).getByText('BOULANGERIE ADJOUA')).toBeVisible();
    expect(within(dialog).queryByLabelText(labels.issue.search)).toBeNull();
    await user.click(await within(dialog).findByRole('checkbox', { name: /Honoraires/ }));
    await user.click(within(dialog).getByRole('button', { name: labels.issue.submit }));
    expect(await screen.findByText(labels.issue.done('FAC-DCK-2026-00004'))).toBeInTheDocument();
  });
});

describe('/cga/parametres · Facturation FNE (3.14, F-ADM-07)', JOURNEY, () => {
  it('mode manuel par défaut ; API DGI : adresse exigée, identifiants masqués après l’enregistrement, test réussi', async () => {
    const { user } = await open(`${cgaSettingsRoutes.root}?onglet=facturation`);
    const text = labels.provider;

    expect(await screen.findByText(text.manualHint)).toBeVisible();
    expect(screen.getByRole('option', { name: text.unavailable('Sell Flow') })).toBeDisabled();
    expect(screen.getByText(text.credentialsNone)).toBeVisible();

    await user.selectOptions(screen.getByLabelText(new RegExp(text.mode)), 'dgi_api');
    await user.click(screen.getByRole('button', { name: text.save }));
    expect(await screen.findByText(fr.members.create.errors.required)).toBeVisible();

    await user.type(screen.getByLabelText(new RegExp(text.baseUrl)), 'https://fne.dgi.test');
    await user.type(screen.getByLabelText(new RegExp(`^${text.credentials}`)), 'cle-secrete-4F2A');
    await user.click(screen.getByRole('button', { name: text.save }));

    expect(await screen.findByText(text.saved)).toBeInTheDocument();
    expect(writes('/cga/invoicing-provider').at(-1)?.body).toEqual({
      mode: 'dgi_api',
      base_url: 'https://fne.dgi.test',
      credentials: 'cle-secrete-4F2A',
      fne_number_pattern: null,
      active: true,
    });
    expect(await screen.findByText(text.credentialsHint('••••4F2A'))).toBeVisible();
    expect(screen.getByLabelText(new RegExp(`^${text.credentials}`))).toHaveValue('');

    await user.click(screen.getByRole('button', { name: text.test }));
    expect(await screen.findByText(text.testOk)).toBeInTheDocument();
    expect(screen.getByText(/Dernier test réussi le/)).toBeVisible();

    // Identifiants laissés vides : conservés, rien n'est envoyé pour eux.
    await user.click(screen.getByLabelText(text.active));
    await user.click(screen.getByRole('button', { name: text.save }));
    await screen.findAllByText(text.saved);
    expect(writes('/cga/invoicing-provider').at(-1)?.body).not.toHaveProperty('credentials');
  });

  it('refus du serveur (422) sous le champ ; test en échec ; panne : bandeau et « Réessayer »', async () => {
    const { user, unmount } = await open(`${cgaSettingsRoutes.root}?onglet=facturation`);
    const text = labels.provider;

    await screen.findByText(text.manualHint);
    server.failNext('PUT', apiUrl('/cga/invoicing-provider'), {
      status: 422,
      data: { message: 'Invalide.', errors: { fne_number_pattern: ['Expression invalide.'] } },
    });
    await user.type(screen.getByLabelText(new RegExp(text.pattern.replace(/[()]/g, '.'))), '[[');
    await user.click(screen.getByRole('button', { name: text.save }));
    expect(await screen.findByText('Expression invalide.')).toBeVisible();

    server.failNext('POST', apiUrl('/cga/invoicing-provider/test'), {
      status: 200,
      data: {
        data: {
          mode: 'manual',
          mode_label: 'Manuel',
          modes: [{ value: 'manual', label: 'Manuel', available: true }],
          base_url: null,
          credentials_hint: null,
          fne_number_pattern: null,
          active: true,
          last_test_at: '2026-10-26T09:00:00Z',
          last_test_ok: false,
          can: { update: true, test: true },
        },
      },
    });
    await user.clear(screen.getByLabelText(new RegExp(text.pattern.replace(/[()]/g, '.'))));
    await user.click(screen.getByRole('button', { name: text.test }));
    expect(await screen.findByText(text.testFailed)).toBeInTheDocument();
    unmount();
    server.restore();

    server = installApiServer();
    server.signIn('0700000002', demoIds.manager);
    for (let attempt = 0; attempt < 2; attempt++) {
      server.failNext('GET', apiUrl('/cga/invoicing-provider'), {
        status: 500,
        data: { message: 'Erreur.' },
      });
    }

    const session = await httpAuthApi.currentSession();
    const retry = userEvent.setup({ delay: null });

    renderApp({
      api: httpAuthApi,
      session,
      entry: `${cgaSettingsRoutes.root}?onglet=facturation`,
    });
    expect(await screen.findByText(text.loadError, {}, { timeout: 4000 })).toBeVisible();
    await retry.click(screen.getByRole('button', { name: fr.common.retry }));
    expect(await screen.findByText(text.manualHint)).toBeVisible();
  });
});
