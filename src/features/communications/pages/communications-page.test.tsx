import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { httpAuthApi } from '@/features/auth/api/auth-api';
import { fr } from '@/lib/i18n/fr';
import { createCampaignsBackend } from '@/test/api-campaigns';
import { conflict, invalid } from '@/test/api-replies';
import { apiUrl, demoIds, installApiServer } from '@/test/api-server';
import { renderApp } from '@/test/render-app';

/*
 * `/cga/communications`, étape 6.8 (06-IMPLEMENTATION-PLAN, F-COM-03, RG-COM-01, RG-COM-02) :
 * historique et validation par le gérant, assistant « Nouvel envoi » en 4 étapes (compteur en direct,
 * quota SMS, modèle, envoi direct ou pour validation). Backend simulé (`api-campaigns.ts`).
 */
const labels = fr.communications;
const text = labels.wizard;

let server: ReturnType<typeof installApiServer>;

afterEach(() => {
  server.restore();
});

async function open(
  entry: string,
  who: 'gerant' | 'comptable' = 'gerant',
  options: Parameters<typeof createCampaignsBackend>[0] = {},
) {
  const campaigns = createCampaignsBackend(options);

  server = installApiServer({ campaigns });
  server.signIn(
    who === 'gerant' ? '0700000002' : '0700000004',
    who === 'gerant' ? demoIds.manager : demoIds.accountant,
  );

  const session = await httpAuthApi.currentSession();
  const user = userEvent.setup({ delay: null });
  const view = renderApp({ api: httpAuthApi, session, entry });

  return { user, campaigns, ...view };
}

type User = ReturnType<typeof userEvent.setup>;

async function nextStep(user: User) {
  await user.click(screen.getByRole('button', { name: text.next }));
}

const JOURNEY = { timeout: 20_000 };

describe('/cga/communications (6.8)', JOURNEY, () => {
  it('RG-COM-01 · historique : délivrance ; le gérant valide ou refuse un envoi en attente', async () => {
    const { user, campaigns } = await open('/cga/communications?onglet=historique');

    const history = await screen.findByRole('list', { name: labels.caption });

    expect(within(history).getByText(labels.delivery('11', '1'))).toBeVisible();
    await user.click(within(history).getAllByRole('button', { name: labels.reject })[0]);
    const dialog = await screen.findByRole('dialog', {
      name: labels.rejectDialog.title('Déclaration de TVA'),
    });

    await user.click(within(dialog).getByRole('button', { name: labels.rejectDialog.submit }));
    expect(await within(dialog).findByText(text.required)).toBeVisible();
    await user.type(
      within(dialog).getByLabelText(new RegExp(labels.rejectDialog.reason)),
      'Message à revoir',
    );
    await user.click(within(dialog).getByRole('button', { name: labels.rejectDialog.submit }));
    expect(await screen.findByText(labels.rejectDialog.done)).toBeVisible();
    expect(campaigns.campaigns()[0].status).toBe('rejected');
  });

  it('le gérant valide l’envoi en attente depuis « Envois groupés » ; quota SMS restant affiché', async () => {
    const { user, campaigns } = await open('/cga/communications');

    expect(await screen.findByText(labels.smsRemaining('200'))).toBeVisible();
    await user.click(screen.getByRole('button', { name: labels.approve }));
    expect(await screen.findByText(labels.approved('60'))).toBeVisible();
    expect(campaigns.campaigns()[0].status).toBe('sent');
  });

  it('assistant : filtres et compteur en direct, canal requis, modèle et aperçu, envoi direct', async () => {
    const { user, router, campaigns } = await open('/cga/communications/nouveau');

    expect(await screen.findByText(text.counter('12'))).toBeVisible();
    await user.click(screen.getByRole('checkbox', { name: text.unpaidFees }));
    expect(await screen.findByText(text.counter('4'))).toBeVisible();
    await user.click(await screen.findByRole('checkbox', { name: 'Commerce' }));
    expect(await screen.findByText(text.counter('3'))).toBeVisible();
    await nextStep(user);

    await user.click(screen.getByRole('checkbox', { name: labels.channels.platform }));
    await nextStep(user);
    expect(await screen.findByText(text.chooseChannel)).toBeVisible();
    await user.click(screen.getByRole('checkbox', { name: labels.channels.sms }));
    expect(await screen.findByText(text.smsNeeded('3', '200'))).toBeVisible();
    await nextStep(user);

    await nextStep(user);
    expect(await screen.findAllByText(text.required)).toHaveLength(2);
    await user.selectOptions(screen.getByLabelText(text.template), 'fees');
    expect(
      within(screen.getByRole('region', { name: text.preview })).getByText(
        labels.templates.fees.title,
      ),
    ).toBeVisible();
    await nextStep(user);

    expect(screen.getByText(text.summary('3', labels.channels.sms))).toBeVisible();
    await user.click(screen.getByRole('button', { name: text.send }));
    expect(await screen.findByText(text.sent('3'))).toBeVisible();
    await waitFor(() => {
      expect(router.state.location.search).toBe('?onglet=historique');
    });
    expect(campaigns.campaigns()[0]).toMatchObject({
      status: 'sent',
      title: labels.templates.fees.title,
    });
  });

  it('RG-COM-01 · au-delà du seuil, le comptable envoie pour validation', async () => {
    const { user, campaigns } = await open(
      '/cga/communications/nouveau?modele=deadline',
      'comptable',
      { threshold: 5 },
    );

    expect(await screen.findByText(text.counter('12'))).toBeVisible();
    await nextStep(user);
    await nextStep(user);
    expect(screen.getByLabelText(new RegExp(text.subject))).toHaveValue(
      labels.templates.deadline.title,
    );
    await nextStep(user);

    expect(await screen.findByText(text.approvalNotice('5'))).toBeVisible();
    await user.click(screen.getByRole('button', { name: text.sendForApproval }));
    expect(await screen.findByText(text.pending)).toBeVisible();
    expect(campaigns.campaigns()[0].status).toBe('pending_approval');
  });

  it('RG-COM-02 · quota SMS insuffisant : le message de l’API, l’envoi reste à refaire', async () => {
    const { user } = await open(
      '/cga/communications/nouveau?membres=01mem1,01mem2&modele=closing',
      'gerant',
      { smsRemaining: 1 },
    );

    expect(await screen.findByText(text.selected('2'))).toBeVisible();
    expect(await screen.findByText(text.counter('2'))).toBeVisible();
    await nextStep(user);
    await user.click(screen.getByRole('checkbox', { name: labels.channels.sms }));
    await nextStep(user);
    await nextStep(user);
    await user.click(screen.getByRole('button', { name: text.send }));

    expect(await screen.findByText(text.smsInsufficient('1'))).toBeVisible();
    expect(screen.getByRole('button', { name: text.send })).toBeEnabled();
  });

  it('historique vide ; onglets dans l’adresse ; refus : motif invalide (422), conflit (409), annulation', async () => {
    const empty = await open('/cga/communications', 'gerant', { empty: true });

    await empty.user.click(await screen.findByRole('tab', { name: labels.tabs.historique }));
    expect(empty.router.state.location.search).toBe('?onglet=historique');
    expect(await screen.findByText(labels.empty)).toBeVisible();
    empty.unmount();
    server.restore();

    const { user } = await open('/cga/communications?onglet=historique');
    const history = await screen.findByRole('list', { name: labels.caption });
    const rejectUrl = apiUrl('/cga/campaigns/01cmp000000000000000000001/reject');

    await user.click(within(history).getAllByRole('button', { name: labels.reject })[0]);
    let dialog = await screen.findByRole('dialog', {
      name: labels.rejectDialog.title('Déclaration de TVA'),
    });

    await user.click(within(dialog).getByRole('button', { name: fr.common.cancel }));
    expect(screen.queryByRole('dialog')).toBeNull();

    server.failNext('POST', rejectUrl, invalid({ reason: 'Motif trop court.' }));
    server.failNext(
      'POST',
      rejectUrl,
      conflict('campaign_not_pending', 'Cette campagne n’attend plus de validation.'),
    );
    await user.click(within(history).getAllByRole('button', { name: labels.reject })[0]);
    dialog = await screen.findByRole('dialog', {
      name: labels.rejectDialog.title('Déclaration de TVA'),
    });
    await user.type(within(dialog).getByLabelText(new RegExp(labels.rejectDialog.reason)), 'Ok');
    await user.click(within(dialog).getByRole('button', { name: labels.rejectDialog.submit }));
    expect(await within(dialog).findByText('Motif trop court.')).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: labels.rejectDialog.submit }));
    expect(
      await within(dialog).findByText('Cette campagne n’attend plus de validation.'),
    ).toBeVisible();
  });

  it('valider un envoi déjà traité : le message de l’API en toast', async () => {
    const { user } = await open('/cga/communications');

    server.failNext(
      'POST',
      apiUrl('/cga/campaigns/01cmp000000000000000000001/approve'),
      conflict('campaign_not_pending', 'Cette campagne n’attend plus de validation.'),
    );
    await user.click(await screen.findByRole('button', { name: labels.approve }));
    expect(await screen.findByText('Cette campagne n’attend plus de validation.')).toBeVisible();
  });
});
