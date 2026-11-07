import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { httpAuthApi } from '@/features/auth/api/auth-api';
import { fr } from '@/lib/i18n/fr';
import { conflict } from '@/test/api-replies';
import { apiUrl, demoIds, installApiServer } from '@/test/api-server';
import { renderApp } from '@/test/render-app';

/*
 * Onglet « Envois » de `/plateforme`, étape 6.2 (06-IMPLEMENTATION-PLAN, F-ADM-06, RG-NOT-05) :
 * comptes par canal, identifiants masqués et conservés, un compte actif par canal, message de test
 * avec la réponse brute du fournisseur. Vrai client `http`, backend simulé (`api-messaging.ts`).
 */
const labels = fr.messaging;
const PAGE = '/plateforme?onglet=envois';

let server: ReturnType<typeof installApiServer>;

afterEach(() => {
  server.restore();
});

async function open(phone = '0700000009', membership = demoIds.platformAdmin) {
  server = installApiServer();
  server.signIn(phone, membership);

  const session = await httpAuthApi.currentSession();
  const user = userEvent.setup({ delay: null });
  const view = renderApp({ api: httpAuthApi, session, entry: PAGE });

  return { user, ...view };
}

function channel(name: string): HTMLElement {
  return screen.getByRole('region', { name });
}

describe('/plateforme · Envois (6.2, RG-NOT-05)', { timeout: 20_000 }, () => {
  it('un bloc par canal ; identifiants masqués ; ajout d’un compte SMTP, puis activation', async () => {
    const { user } = await open();

    const sms = await screen.findByRole('region', { name: labels.channels.sms });

    expect(within(sms).getByText('Orange CI')).toBeVisible();
    expect(within(sms).getByText(labels.active)).toBeVisible();
    expect(within(sms).getByText(/Secret client ••••4F2A/)).toBeVisible();
    expect(within(channel(labels.channels.email)).getByText(labels.empty)).toBeVisible();

    await user.click(
      within(channel(labels.channels.email)).getByRole('button', { name: labels.add }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: labels.form.addTitle(labels.channels.email),
    });

    await user.selectOptions(within(dialog).getByLabelText(new RegExp(labels.form.driver)), 'smtp');
    await user.click(within(dialog).getByRole('button', { name: labels.form.save }));
    expect(await within(dialog).findByText('Le nom du compte est obligatoire.')).toBeVisible();

    await user.type(
      within(dialog).getByLabelText(new RegExp(labels.form.label)),
      'SMTP de recette',
    );
    await user.type(within(dialog).getByLabelText(labels.fields.host), 'smtp.test');
    await user.type(within(dialog).getByLabelText(labels.fields.password), 'motdepasse-9X7Z');
    await user.click(within(dialog).getByRole('button', { name: labels.form.save }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    const email = channel(labels.channels.email);

    expect(await within(email).findByText('SMTP de recette')).toBeVisible();
    expect(within(email).getByText(/Mot de passe ••••9X7Z/)).toBeVisible();
    expect(within(email).getByText(labels.inactive)).toBeVisible();

    await user.click(
      within(email).getByRole('button', { name: labels.actions('SMTP de recette') }),
    );
    await user.click(screen.getByRole('menuitem', { name: labels.activate }));
    expect(await screen.findByText(labels.activated('SMTP de recette'))).toBeVisible();
    await waitFor(() => {
      expect(within(channel(labels.channels.email)).getByText(labels.active)).toBeVisible();
    });
  });

  it('modifier sans ressaisir les identifiants les conserve ; désactiver', async () => {
    const { user } = await open();
    const sms = await screen.findByRole('region', { name: labels.channels.sms });

    await user.click(within(sms).getByRole('button', { name: labels.actions('Orange CI') }));
    await user.click(screen.getByRole('menuitem', { name: labels.edit }));
    const dialog = await screen.findByRole('dialog', { name: labels.form.editTitle('Orange CI') });

    expect(within(dialog).getByText(labels.form.secretKept('••••4F2A'))).toBeVisible();
    await user.clear(within(dialog).getByLabelText(new RegExp(labels.form.label)));
    await user.type(
      within(dialog).getByLabelText(new RegExp(labels.form.label)),
      'Orange CI (production)',
    );
    await user.click(within(dialog).getByRole('button', { name: labels.form.save }));

    expect(await screen.findByText(labels.form.saved)).toBeVisible();
    const put = server.requests.find((request) => request.method === 'PUT');

    expect((put?.body as { secrets: object }).secrets).toEqual({});
    expect(
      await within(channel(labels.channels.sms)).findByText(/Secret client ••••4F2A/),
    ).toBeVisible();

    await user.click(
      within(channel(labels.channels.sms)).getByRole('button', {
        name: labels.actions('Orange CI (production)'),
      }),
    );
    await user.click(screen.getByRole('menuitem', { name: labels.deactivate }));
    expect(await screen.findByText(labels.deactivated('Orange CI (production)'))).toBeVisible();
  });

  it('« Envoyer un test » : destinataire exigé, réponse brute du fournisseur affichée', async () => {
    const { user } = await open();
    const sms = await screen.findByRole('region', { name: labels.channels.sms });

    await user.click(within(sms).getByRole('button', { name: labels.test }));
    const dialog = await screen.findByRole('dialog', {
      name: labels.testDialog.title('Orange CI'),
    });

    await user.click(within(dialog).getByRole('button', { name: labels.testDialog.send }));
    expect(await within(dialog).findByText('Le destinataire est obligatoire.')).toBeVisible();

    await user.type(
      within(dialog).getByLabelText(new RegExp(labels.testDialog.phone)),
      '0700000001',
    );
    await user.click(within(dialog).getByRole('button', { name: labels.testDialog.send }));

    expect(await within(dialog).findByText(/401 Unauthorized: invalid client/)).toBeVisible();
  });

  it('WhatsApp Cloud : modèles « type=nom » ; conflit (409) en bandeau ; annulations ; pannes', async () => {
    const { user } = await open();
    const whatsapp = await screen.findByRole('region', { name: labels.channels.whatsapp });

    await user.click(within(whatsapp).getByRole('button', { name: labels.add }));
    let dialog = await screen.findByRole('dialog', {
      name: labels.form.addTitle(labels.channels.whatsapp),
    });

    await user.click(within(dialog).getByRole('button', { name: fr.common.cancel }));
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(within(whatsapp).getByRole('button', { name: labels.add }));
    dialog = await screen.findByRole('dialog', {
      name: labels.form.addTitle(labels.channels.whatsapp),
    });
    await user.selectOptions(
      within(dialog).getByLabelText(new RegExp(labels.form.driver)),
      'whatsapp_cloud',
    );
    await user.type(
      within(dialog).getByLabelText(new RegExp(labels.form.label)),
      'WhatsApp Business',
    );
    await user.type(
      within(dialog).getByLabelText(labels.fields.base_url),
      'https://graph.whatsapp.test',
    );
    await user.type(
      within(dialog).getByLabelText(labels.fields.templates),
      'echeance_rappel=rappel_echeance{enter}ligne sans egal',
    );
    await user.type(within(dialog).getByLabelText(labels.fields.access_token), 'jeton-7777');
    server.failNext(
      'POST',
      apiUrl('/platform/messaging'),
      conflict('provider_locked', 'Compte verrouillé par un autre administrateur.'),
    );
    await user.click(within(dialog).getByRole('button', { name: labels.form.save }));
    expect(
      await within(dialog).findByText('Compte verrouillé par un autre administrateur.'),
    ).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: labels.form.save }));
    expect(await screen.findByText(labels.form.saved)).toBeVisible();

    const post = server.requests
      .filter((request) => request.method === 'POST' && request.url.endsWith('/platform/messaging'))
      .at(-1);

    expect((post?.body as { settings: Record<string, unknown> }).settings.templates).toEqual({
      echeance_rappel: 'rappel_echeance',
    });
    await user.click(
      within(whatsapp).getByRole('button', { name: labels.actions('WhatsApp Business') }),
    );
    await user.click(screen.getByRole('menuitem', { name: labels.edit }));
    dialog = await screen.findByRole('dialog', {
      name: labels.form.editTitle('WhatsApp Business'),
    });
    expect(within(dialog).getByLabelText(labels.fields.templates)).toHaveValue(
      'echeance_rappel=rappel_echeance',
    );
    await user.keyboard('{Escape}');

    server.failNext('POST', apiUrl('/platform/messaging/01msg000000000000000000001/deactivate'), {
      status: 500,
    });
    await user.click(
      within(screen.getByRole('region', { name: labels.channels.sms })).getByRole('button', {
        name: labels.actions('Orange CI'),
      }),
    );
    await user.click(screen.getByRole('menuitem', { name: labels.deactivate }));
    expect(await screen.findByText(fr.errors.http.server)).toBeInTheDocument();

    await user.click(
      within(screen.getByRole('region', { name: labels.channels.sms })).getByRole('button', {
        name: labels.test,
      }),
    );
    dialog = await screen.findByRole('dialog', { name: labels.testDialog.title('Orange CI') });
    server.failNext('POST', apiUrl('/platform/messaging/01msg000000000000000000001/test'), {
      status: 500,
    });
    await user.type(
      within(dialog).getByLabelText(new RegExp(labels.testDialog.phone)),
      '0700000001',
    );
    await user.click(within(dialog).getByRole('button', { name: labels.testDialog.send }));
    await waitFor(() => {
      expect(screen.getAllByText(fr.errors.http.server).length).toBeGreaterThan(0);
    });
    await user.click(within(dialog).getByRole('button', { name: fr.common.cancel }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('panne de lecture des comptes : message d’erreur', async () => {
    server = installApiServer();
    server.signIn('0700000009', demoIds.platformAdmin);
    // La lecture est réessayée une fois : deux pannes.
    server.failNext('GET', apiUrl('/platform/messaging'), { status: 500 });
    server.failNext('GET', apiUrl('/platform/messaging'), { status: 500 });

    const session = await httpAuthApi.currentSession();

    renderApp({ api: httpAuthApi, session, entry: PAGE });
    expect(await screen.findByText(labels.loadError, {}, { timeout: 5000 })).toBeVisible();
  });
});
