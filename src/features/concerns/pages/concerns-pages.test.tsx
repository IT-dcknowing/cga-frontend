import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { httpAuthApi } from '@/features/auth/api/auth-api';
import { concernRoutes } from '@/features/concerns/lib/routes';
import { fr } from '@/lib/i18n/fr';
import { demoConcernIds } from '@/test/api-concerns';
import { conflict } from '@/test/api-replies';
import { apiUrl, demoIds, installApiServer } from '@/test/api-server';
import { renderApp } from '@/test/render-app';

/*
 * Préoccupations (06-IMPLEMENTATION-PLAN étape 7.4, F-PRE-01 à 04, RG-PRE-01 à 03, parcours P8) :
 * `/cga/preoccupations` (reçues, envoyées au CNCGA, fil, note interne, statut, transmission),
 * `/cncga/preoccupations` (demandes des CGA, indicateurs agrégés), `/adherent/messages` (demandes,
 * réouverture, demande de document). Vrai client `http`, backend simulé (`api-concerns.ts`).
 */
const labels = fr.concerns;

let server: ReturnType<typeof installApiServer>;

afterEach(() => {
  server.restore();
});

const WHO = {
  manager: ['0700000002', demoIds.manager],
  president: ['0700000001', demoIds.president],
  member: ['0700000012', demoIds.memberOwner],
} as const;

async function open(entry: string, who: keyof typeof WHO = 'manager') {
  server = installApiServer();
  server.signIn(WHO[who][0], WHO[who][1]);

  const session = await httpAuthApi.currentSession();
  const user = userEvent.setup({ delay: null });
  const view = renderApp({ api: httpAuthApi, session, entry });

  return { user, ...view };
}

async function rows(): Promise<HTMLElement[]> {
  const list = await screen.findByRole('list', { name: labels.list.caption });

  return within(list).getAllByRole('link');
}

describe('/cga/preoccupations (7.4)', { timeout: 30_000 }, () => {
  it('RG-PRE-02 · reçues des adhérents (sans réponse depuis 15 j, délai dépassé), envoyées au CNCGA', async () => {
    const { user, router } = await open(concernRoutes.list('cga'));

    const received = await rows();

    expect(received).toHaveLength(2);
    expect(received[0]).toHaveTextContent('Calcul de la TEE du trimestre');
    expect(received[0]).toHaveTextContent(labels.list.stale);
    expect(received[0]).toHaveTextContent(labels.list.late);
    expect(received[0]).toHaveTextContent('BOULANGERIE ADJOUA');

    await user.click(screen.getByRole('checkbox', { name: labels.filters.staleOnly }));
    await waitFor(async () => {
      expect(await rows()).toHaveLength(1);
    });
    expect(router.state.location.search).toBe('?sans-reponse=1');

    await user.click(screen.getByRole('tab', { name: labels.tabs.sent }));
    const sent = within(screen.getByRole('tabpanel', { name: labels.tabs.sent }));

    expect(
      await sent.findByRole('link', { name: labels.list.open('Accès à e-impots') }),
    ).toBeVisible();
  });

  it('F-PRE-02 · fil avec note interne, réponse avec pièce jointe, note interne, rejet avec motif', async () => {
    const { user } = await open(concernRoutes.detail('cga', demoConcernIds.tee));

    const thread = await screen.findByRole('list', { name: labels.thread.caption });

    expect(within(thread).getByText(labels.thread.internal)).toBeVisible();
    expect(
      within(thread).getByText('Vérifier le CA de référence avant de répondre.'),
    ).toBeVisible();

    const form = screen.getByRole('form', { name: labels.reply.label });

    await user.click(within(form).getByRole('button', { name: labels.reply.submit }));
    expect(within(form).getByText(fr.members.create.errors.required)).toBeVisible();

    await user.type(
      within(form).getByLabelText(labels.reply.label),
      'La TEE est calculée sur le CA de référence.',
    );
    await user.upload(
      within(form).getByLabelText(labels.reply.files),
      new File(['%PDF'], 'bareme.pdf', { type: 'application/pdf' }),
    );
    await user.click(within(form).getByRole('button', { name: labels.reply.submit }));
    expect(await screen.findByText(labels.reply.sent)).toBeInTheDocument();
    expect(
      await screen.findByRole('link', { name: labels.thread.attachment('bareme.pdf') }),
    ).toBeVisible();

    const again = screen.getByRole('form', { name: labels.reply.label });

    await user.type(
      within(again).getByLabelText(labels.reply.label),
      'Relancer en fin de semaine.',
    );
    await user.click(within(again).getByRole('checkbox', { name: labels.reply.internal }));
    await user.click(within(again).getByRole('button', { name: labels.reply.submit }));
    expect(await screen.findByText(labels.reply.noteSaved)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: labels.status.action }));
    const dialog = await screen.findByRole('dialog', { name: labels.status.title });

    await user.selectOptions(within(dialog).getByRole('combobox'), 'rejected');
    await user.click(within(dialog).getByRole('button', { name: labels.status.submit }));
    expect(within(dialog).getByText(fr.members.create.errors.required)).toBeVisible();
    await user.type(
      within(dialog).getByLabelText(new RegExp(labels.status.reason)),
      'Hors du champ du CGA',
    );
    await user.click(within(dialog).getByRole('button', { name: labels.status.submit }));

    expect(await screen.findByText(labels.status.done('Rejetée'))).toBeInTheDocument();
    expect(await screen.findByText(labels.detail.rejection('Hors du champ du CGA'))).toBeVisible();
    expect(screen.queryByRole('form', { name: labels.reply.label })).toBeNull();
  });

  it('F-PRE-03 · « Transmettre au CNCGA » avec message d’accompagnement', async () => {
    const { user } = await open(concernRoutes.detail('cga', demoConcernIds.tee));

    await user.click(await screen.findByRole('button', { name: labels.transfer.action }));
    const dialog = await screen.findByRole('dialog', { name: labels.transfer.title });

    await user.click(within(dialog).getByRole('button', { name: labels.transfer.submit }));
    expect(within(dialog).getByText(fr.members.create.errors.required)).toBeVisible();
    await user.type(
      within(dialog).getByLabelText(new RegExp(labels.transfer.message)),
      'Question réglementaire.',
    );
    await user.click(within(dialog).getByRole('button', { name: labels.transfer.submit }));

    expect(await screen.findByText(labels.transfer.done)).toBeInTheDocument();
    expect(await screen.findByText(labels.detail.transfer('Ouverte'))).toBeVisible();
    expect(screen.queryByRole('button', { name: labels.transfer.action })).toBeNull();
  });

  it('« Écrire au CNCGA » : champs exigés, puis le fil de la nouvelle demande', async () => {
    const { user, router } = await open(concernRoutes.list('cga'));

    await user.click(await screen.findByRole('button', { name: labels.create.cgaAction }));
    const dialog = await screen.findByRole('dialog', { name: labels.create.cgaTitle });

    await user.click(within(dialog).getByRole('button', { name: labels.create.submit }));
    expect(within(dialog).getAllByText(fr.members.create.errors.required)).toHaveLength(3);

    await user.selectOptions(within(dialog).getByRole('combobox'), 'tax');
    await user.type(
      within(dialog).getByLabelText(new RegExp(labels.create.subject)),
      'Barème 2027',
    );
    await user.type(
      within(dialog).getByLabelText(new RegExp(`^${labels.create.message}`)),
      'Quand sera-t-il publié ?',
    );
    await user.click(within(dialog).getByRole('button', { name: labels.create.submit }));

    expect(await screen.findByText(labels.create.sentToCncga)).toBeInTheDocument();
    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/^\/cga\/preoccupations\/01cnc/);
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Barème 2027' })).toBeVisible();
  });

  it('demandes indisponibles, puis réponse refusée par le serveur (409)', async () => {
    server = installApiServer();
    for (let attempt = 0; attempt < 2; attempt++) {
      server.failNext('GET', apiUrl('/cga/concerns'), { status: 500, data: { message: 'panne' } });
    }
    server.signIn(...WHO.manager);
    const session = await httpAuthApi.currentSession();
    const user = userEvent.setup({ delay: null });
    const view = renderApp({ api: httpAuthApi, session, entry: concernRoutes.list('cga') });

    expect(await screen.findByText(labels.list.loadError, {}, { timeout: 5_000 })).toBeVisible();
    await user.click(screen.getByRole('button', { name: fr.common.retry }));
    expect(await screen.findByRole('list', { name: labels.list.caption })).toBeVisible();

    await view.router.navigate(concernRoutes.detail('cga', demoConcernIds.tee));
    const form = await screen.findByRole('form', { name: labels.reply.label });

    server.failNext(
      'POST',
      apiUrl(`/cga/concerns/${demoConcernIds.tee}/messages`),
      conflict('concern_closed', 'Cette demande est close : rouvrez-la pour répondre.'),
    );
    await user.type(within(form).getByLabelText(labels.reply.label), 'Bonjour');
    await user.click(within(form).getByRole('button', { name: labels.reply.submit }));
    expect(
      await screen.findByText('Cette demande est close : rouvrez-la pour répondre.'),
    ).toBeInTheDocument();
  });
});

describe('/cncga/preoccupations (7.4, RG-PRE-03)', { timeout: 30_000 }, () => {
  it('demandes des CGA (transmises signalées) ; réponse et passage « Traitée »', async () => {
    const { user } = await open('/cncga/preoccupations', 'president');

    const list = await rows();

    expect(list).toHaveLength(2);
    expect(list[1]).toHaveTextContent(labels.list.fromTransfer);
    expect(list[0]).toHaveTextContent('DC-KNOWING CGA');

    await user.click(list[0]);
    expect(await screen.findByText(labels.detail.organization('DC-KNOWING CGA'))).toBeVisible();
    await user.click(screen.getByRole('button', { name: labels.status.action }));
    const dialog = await screen.findByRole('dialog', { name: labels.status.title });

    await user.selectOptions(within(dialog).getByRole('combobox'), 'resolved');
    await user.click(within(dialog).getByRole('button', { name: labels.status.submit }));
    expect(await screen.findByText(labels.status.done('Traitée'))).toBeInTheDocument();
  });

  it('RG-PRE-03 · indicateurs agrégés du réseau et par CGA, sans demande nominative', async () => {
    const { user } = await open('/cncga/preoccupations', 'president');

    await user.click(await screen.findByRole('tab', { name: labels.tabs.indicators }));
    const panel = within(screen.getByRole('tabpanel', { name: labels.tabs.indicators }));

    expect(await panel.findByText(labels.indicators.title)).toBeVisible();
    const rate = panel.getByText(labels.indicators.treatmentRate, { selector: 'dt' });

    expect(rate.nextSibling).toHaveTextContent('58 %');
    const table = panel.getByRole('table', { name: labels.indicators.caption });
    const bouake = within(table)
      .getByRole('rowheader', { name: 'CGA Démo Bouaké' })
      .closest('tr') as HTMLElement;

    expect(bouake).toHaveTextContent('—');
    expect(table).not.toHaveTextContent('BOULANGERIE');
  });
});

describe('/adherent/messages (7.4, parcours P8)', { timeout: 30_000 }, () => {
  it('demandes de l’adhérent sans les notes internes du CGA ; réouverture d’une demande traitée', async () => {
    const { user } = await open(concernRoutes.list('member'), 'member');

    const list = await rows();

    expect(list).toHaveLength(2);
    await user.click(list[0]);
    const thread = await screen.findByRole('list', { name: labels.thread.caption });

    expect(within(thread).queryByText(labels.thread.internal)).toBeNull();
    expect(within(thread).queryByText('Vérifier le CA de référence avant de répondre.')).toBeNull();

    await user.click(screen.getByRole('link', { name: labels.detail.back }));
    const updated = await rows();

    await user.click(updated[1]);
    await user.click(await screen.findByRole('button', { name: labels.reopen.action }));
    expect(await screen.findByText(labels.reopen.done)).toBeInTheDocument();
    expect(await screen.findByRole('form', { name: labels.reply.memberLabel })).toBeVisible();
  });

  it('« Nouvelle demande » envoyée au CGA ; « Demander un document » (motif exigé pour « Autre »)', async () => {
    const { user, router } = await open(concernRoutes.list('member'), 'member');

    await user.click(await screen.findByRole('button', { name: labels.create.memberAction }));
    const dialog = await screen.findByRole('dialog', { name: labels.create.title });

    await user.selectOptions(within(dialog).getByRole('combobox'), 'accounting');
    await user.type(
      within(dialog).getByLabelText(new RegExp(labels.create.subject)),
      'Relevé bancaire',
    );
    await user.type(
      within(dialog).getByLabelText(new RegExp(`^${labels.create.message}`)),
      'Faut-il l’envoyer ?',
    );
    await user.click(within(dialog).getByRole('button', { name: labels.create.submit }));

    expect(await screen.findByText(labels.create.sentToCga('DC-KNOWING CGA'))).toBeInTheDocument();
    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/^\/adherent\/messages\/01cnc/);
    });

    await user.click(await screen.findByRole('link', { name: labels.detail.back }));
    await user.click(await screen.findByRole('button', { name: labels.document.action }));
    const document = await screen.findByRole('dialog', { name: labels.document.title });

    await user.selectOptions(within(document).getByRole('combobox'), 'other');
    await user.click(within(document).getByRole('button', { name: labels.document.submit }));
    expect(within(document).getByText(fr.members.create.errors.required)).toBeVisible();
    await user.type(
      within(document).getByLabelText(new RegExp(labels.document.message)),
      'Mon bilan 2025',
    );
    await user.click(within(document).getByRole('button', { name: labels.document.submit }));

    expect(await screen.findByText(labels.document.done)).toBeInTheDocument();
    expect(server.concerns.documentRequests()).toHaveLength(1);
  });
});

describe('Liste des demandes : filtres et pages (7.4)', { timeout: 30_000 }, () => {
  it('filtres statut et catégorie dans l’adresse, puis pagination', async () => {
    server = installApiServer();
    const stored = server.concerns.concerns();
    const template = stored[1];

    for (let index = 0; index < 30; index++) {
      stored.push({
        ...template,
        id: `01cnc0000000000000000p${String(index).padStart(4, '0')}`,
        subject: `Demande ${index}`,
      });
    }
    server.signIn(...WHO.manager);
    const session = await httpAuthApi.currentSession();
    const user = userEvent.setup({ delay: null });
    const { router } = renderApp({ api: httpAuthApi, session, entry: concernRoutes.list('cga') });

    expect(await rows()).toHaveLength(25);
    await user.click(screen.getByRole('button', { name: fr.referentials.next }));
    await waitFor(async () => {
      expect(await rows()).toHaveLength(7);
    });
    expect(router.state.location.search).toBe('?page=2');
    await user.click(screen.getByRole('button', { name: fr.referentials.previous }));
    await waitFor(async () => {
      expect(await rows()).toHaveLength(25);
    });

    await user.selectOptions(screen.getByRole('combobox', { name: labels.filters.status }), 'open');
    await waitFor(async () => {
      expect(await rows()).toHaveLength(1);
    });
    await user.selectOptions(screen.getByRole('combobox', { name: labels.filters.status }), '');
    await user.selectOptions(
      screen.getByRole('combobox', { name: labels.filters.category }),
      'legal',
    );
    expect(await screen.findByText(labels.list.empty)).toBeVisible();
    expect(router.state.location.search).toBe('?categorie=legal');
  });

  it('message système du fil, centré', async () => {
    await open(concernRoutes.detail('network', demoConcernIds.eImpots), 'president');

    const thread = await screen.findByRole('list', { name: labels.thread.caption });

    expect(within(thread).getByText(/Demande passée « En examen »/)).toBeVisible();
  });
});
