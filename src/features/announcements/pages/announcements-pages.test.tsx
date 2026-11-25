import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { httpAuthApi } from '@/features/auth/api/auth-api';
import { fr } from '@/lib/i18n/fr';
import { demoAnnouncementIds } from '@/test/api-announcements';
import { invalid } from '@/test/api-replies';
import { apiUrl, demoIds, installApiServer } from '@/test/api-server';
import { renderApp } from '@/test/render-app';

/*
 * Annonces (06-IMPLEMENTATION-PLAN étape 7.6, F-COM-01 et 02) : `/cncga/communications` (liste,
 * aperçu, « + Nouvelle annonce » avec cible), onglet « Annonces » de `/cga/communications` (annonces
 * du centre filtrées par régime, annonces reçues du CNCGA et leur lecture), « Message de mon CGA » sur
 * l'accueil de l'adhérent. Vrai client `http`, backend simulé (`api-announcements.ts`).
 */
const labels = fr.announcements;

let server: ReturnType<typeof installApiServer>;

afterEach(() => {
  server.restore();
});

const WHO = {
  president: ['0700000001', demoIds.president],
  manager: ['0700000002', demoIds.manager],
  accountant: ['0700000004', demoIds.accountant],
  member: ['0700000012', demoIds.memberOwner],
} as const;

async function open(entry: string, who: keyof typeof WHO) {
  const [phone, membershipId] = WHO[who];

  server = installApiServer();
  server.signIn(phone, membershipId);

  const session = await httpAuthApi.currentSession();
  const user = userEvent.setup({ delay: null });
  const view = renderApp({ api: httpAuthApi, session, entry });

  return { user, ...view };
}

/** Lignes du tableau des annonces publiées, une fois chargé. */
async function rows(): Promise<HTMLElement[]> {
  const table = await screen.findByRole('table', { name: labels.list.caption });

  await waitFor(() => {
    expect(table).not.toHaveAttribute('aria-busy');
  });

  return within(table).getAllByRole('row').slice(1);
}

describe('/cncga/communications (7.6)', { timeout: 30_000 }, () => {
  it('F-COM-01 · annonces publiées (cible, destinataires, e-mail) et aperçu avec pièce jointe', async () => {
    const { user } = await open('/cncga/communications', 'president');

    const list = await rows();

    expect(list).toHaveLength(3);
    expect(list[0]).toHaveTextContent('Facturation électronique : ce qui change');
    expect(list[0]).toHaveTextContent(labels.create.audiences.all_network_members);
    expect(list[0]).toHaveTextContent(`120 · ${labels.list.email}`);

    await user.click(list[2]);
    const preview = await screen.findByRole('dialog', { name: 'Calendrier fiscal 2027' });

    expect(within(preview).getByText('Le calendrier fiscal 2027 est disponible.')).toBeVisible();
    expect(
      within(preview).getByRole('link', {
        name: labels.detail.attachment('calendrier-2027.pdf'),
      }),
    ).toHaveAttribute('href', '/fichiers/annonces/calendrier-2027.pdf');
    // La croix d'en-tête et le bouton du pied portent le même nom : le pied ferme l'aperçu.
    await user.click(
      within(preview).getAllByRole('button', { name: labels.detail.close }).at(-1) as HTMLElement,
    );

    await user.click(list[1]);
    const targeted = await screen.findByRole('dialog', { name: 'Audit de DC-KNOWING' });

    expect(within(targeted).getByText(labels.detail.targets('DC-KNOWING CGA'))).toBeVisible();
  });

  it('F-COM-01 · « + Nouvelle annonce » : champs exigés, certains CGA choisis, e-mail', async () => {
    const { user } = await open('/cncga/communications', 'president');

    await rows();
    await user.click(screen.getByRole('button', { name: labels.create.action }));
    const dialog = await screen.findByRole('dialog', { name: labels.create.title });

    await user.click(
      within(dialog).getByRole('radio', { name: labels.create.audiences.selected_cgas }),
    );
    await user.click(within(dialog).getByRole('button', { name: labels.create.submit }));
    expect(within(dialog).getAllByText(fr.members.create.errors.required)).toHaveLength(2);
    expect(within(dialog).getByText(labels.create.noCga)).toBeVisible();

    await user.type(
      within(dialog).getByLabelText(new RegExp(`^${labels.create.fields.title}`)),
      'Réunion des gérants',
    );
    await user.type(
      within(dialog).getByLabelText(new RegExp(`^${labels.create.fields.body}`)),
      'Le 20 novembre à Abidjan.',
    );
    await user.type(within(dialog).getByLabelText(labels.create.fields.search), 'Bouaké');
    await user.click(await within(dialog).findByRole('checkbox', { name: 'CGA Démo Bouaké' }));
    expect(within(dialog).getByText(new RegExp(labels.create.chosen('1')))).toBeVisible();
    await user.click(within(dialog).getByRole('checkbox', { name: labels.create.fields.email }));
    await user.upload(
      within(dialog).getByLabelText(labels.create.fields.attachment),
      new File(['%PDF'], 'ordre-du-jour.pdf', { type: 'application/pdf' }),
    );
    await user.click(within(dialog).getByRole('button', { name: labels.create.submit }));

    expect(await screen.findByText(labels.create.published('3'))).toBeInTheDocument();
    const created = server.announcements.announcements()[0];

    expect(created).toMatchObject({
      title: 'Réunion des gérants',
      audience: 'selected_cgas',
      targets: ['01cga000000000000000000002'],
      send_email: true,
      attachment: 'ordre-du-jour.pdf',
    });
    await waitFor(async () => {
      expect(await rows()).toHaveLength(4);
    });
  });

  it('refus du serveur (422) sous le champ ; liste indisponible puis « Réessayer »', async () => {
    server = installApiServer();
    server.signIn(...WHO.president);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      server.failNext('GET', apiUrl('/network/announcements'), {
        status: 500,
        data: { message: 'panne' },
      });
    }
    const session = await httpAuthApi.currentSession();
    const user = userEvent.setup({ delay: null });

    renderApp({ api: httpAuthApi, session, entry: '/cncga/communications' });
    expect(await screen.findByText(labels.list.loadError, {}, { timeout: 5_000 })).toBeVisible();
    await user.click(screen.getByRole('button', { name: fr.common.retry }));
    expect(await rows()).toHaveLength(3);

    await user.click(screen.getByRole('button', { name: labels.create.action }));
    const dialog = await screen.findByRole('dialog', { name: labels.create.title });

    await user.type(
      within(dialog).getByLabelText(new RegExp(`^${labels.create.fields.title}`)),
      'Titre',
    );
    await user.type(
      within(dialog).getByLabelText(new RegExp(`^${labels.create.fields.body}`)),
      'Texte',
    );
    server.failNext(
      'POST',
      apiUrl('/network/announcements'),
      invalid({ attachment: 'Le fichier doit être un PDF ou une image.' }),
    );
    await user.click(within(dialog).getByRole('button', { name: labels.create.submit }));
    expect(
      await within(dialog).findByText('Le fichier doit être un PDF ou une image.'),
    ).toBeVisible();

    await user.click(within(dialog).getByRole('button', { name: labels.create.submit }));
    expect(await screen.findByText(labels.create.published('14'))).toBeInTheDocument();
  });
});

describe('/cga/communications · onglet Annonces (7.6)', { timeout: 30_000 }, () => {
  it('F-COM-02 · annonce aux adhérents filtrée par régime ; annonces reçues du CNCGA lues', async () => {
    const { user } = await open('/cga/communications?onglet=annonces', 'manager');

    const published = within(
      await screen.findByRole('region', { name: labels.received.published }),
    );
    const table = await published.findByRole('table', { name: labels.list.caption });

    expect(await within(table).findByText('Fermeture du centre le 15 novembre')).toBeVisible();
    expect(screen.queryByRole('link', { name: fr.communications.newCampaign })).toBeNull();

    const feed = within(await screen.findByRole('list', { name: labels.received.title }));

    expect(await screen.findByText(labels.received.unread('2'))).toBeVisible();
    const audit = within(feed.getByRole('article', { name: 'Audit de DC-KNOWING' }));

    expect(audit.getByText(fr.status.announcement.unread)).toBeVisible();
    await user.click(audit.getByRole('button', { name: labels.received.markRead }));
    expect(await screen.findByText(labels.received.marked)).toBeInTheDocument();
    expect(await screen.findByText(labels.received.unread('1'))).toBeVisible();

    await user.click(screen.getByRole('button', { name: labels.create.action }));
    const dialog = await screen.findByRole('dialog', { name: labels.create.title });

    expect(within(dialog).getByText(labels.create.ownMembers)).toBeVisible();
    expect(within(dialog).queryByRole('radio')).toBeNull();
    await user.type(
      within(dialog).getByLabelText(new RegExp(`^${labels.create.fields.title}`)),
      'Déclaration TEE',
    );
    await user.type(
      within(dialog).getByLabelText(new RegExp(`^${labels.create.fields.body}`)),
      'Pensez à déclarer.',
    );
    await user.click(within(dialog).getByRole('checkbox', { name: 'TEE' }));
    await user.click(within(dialog).getByRole('button', { name: labels.create.submit }));

    expect(await screen.findByText(labels.create.published('2'))).toBeInTheDocument();
    expect(server.announcements.announcements()[0]).toMatchObject({
      audience: 'own_members',
      member_filter: { regimes: ['TEE'], sector_ids: [] },
    });
  });

  it('sans le droit de publier : seules les annonces reçues, sans « Nouvelle annonce »', async () => {
    await open('/cga/communications?onglet=annonces', 'accountant');

    expect(await screen.findByRole('list', { name: labels.received.title })).toBeVisible();
    expect(screen.queryByRole('region', { name: labels.received.published })).toBeNull();
    expect(screen.queryByRole('button', { name: labels.create.action })).toBeNull();
  });

  it('annonces reçues indisponibles : message et « Réessayer »', async () => {
    server = installApiServer();
    server.signIn(...WHO.accountant);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      server.failNext('GET', apiUrl('/me/announcements'), { status: 500, data: { message: 'x' } });
    }
    const session = await httpAuthApi.currentSession();
    const user = userEvent.setup({ delay: null });

    renderApp({ api: httpAuthApi, session, entry: '/cga/communications?onglet=annonces' });
    expect(
      await screen.findByText(labels.received.loadError, {}, { timeout: 5_000 }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: fr.common.retry }));
    expect(await screen.findByRole('list', { name: labels.received.title })).toBeVisible();
  });
});

describe('/adherent/accueil · « Message de mon CGA » (7.6, F-DSH-03)', { timeout: 30_000 }, () => {
  it('le dernier message, nouveau puis lu', async () => {
    const { user } = await open('/adherent/accueil', 'member');

    const message = within(
      await screen.findByRole('article', { name: 'Fermeture du centre le 15 novembre' }),
    );

    expect(message.getByText(/Les rendez-vous sont reportés/)).toBeVisible();
    expect(
      message.getByText(labels.detail.from('DC-KNOWING CGA', '03/11/2026 à 09:00')),
    ).toBeVisible();
    expect(screen.getByText(fr.status.announcement.unread)).toBeVisible();

    await user.click(message.getByRole('button', { name: labels.member.markRead }));
    expect(await screen.findByText(labels.received.marked)).toBeInTheDocument();
    expect(await screen.findByText(fr.status.announcement.read)).toBeVisible();
    expect(server.announcements.announcements().map((item) => item.id)).toContain(
      demoAnnouncementIds.centre,
    );
  });

  it('message indisponible : bandeau dans la carte', async () => {
    server = installApiServer();
    server.signIn(...WHO.member);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      server.failNext('GET', apiUrl('/me/announcements'), { status: 500, data: { message: 'x' } });
    }
    const session = await httpAuthApi.currentSession();

    renderApp({ api: httpAuthApi, session, entry: '/adherent/accueil' });
    expect(await screen.findByText(labels.member.loadError, {}, { timeout: 5_000 })).toBeVisible();
  });
});
