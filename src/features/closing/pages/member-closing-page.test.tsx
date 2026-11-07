import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { httpAuthApi } from '@/features/auth/api/auth-api';
import { memberSpaceRoutes } from '@/features/member-space/lib/routes';
import { fr } from '@/lib/i18n/fr';
import { conflict, invalid, ok } from '@/test/api-replies';
import { apiUrl, demoIds, installApiServer } from '@/test/api-server';
import { renderApp } from '@/test/render-app';

/*
 * `/adherent/cloture` (06-IMPLEMENTATION-PLAN étape 4.11, 03-APPFLOW §5.2) : étapes de l'exercice en
 * cours et leurs dates ; « Déposer des pièces » crée une préoccupation « Pièces de clôture » avec les
 * fichiers joints. Vrai client `http`, backend simulé (`api-closing.ts`).
 */
const labels = fr.closing.memberSpace;

let server: ReturnType<typeof installApiServer>;

afterEach(() => {
  server.restore();
});

async function open() {
  server = installApiServer();
  server.signIn('0700000012', demoIds.memberOwner);

  const session = await httpAuthApi.currentSession();
  const user = userEvent.setup({ delay: null });
  const view = renderApp({ api: httpAuthApi, session, entry: memberSpaceRoutes.closing });

  return { user, ...view };
}

describe('/adherent/cloture (4.11)', { timeout: 30_000 }, () => {
  it('F-OBL-08 · étapes de l’exercice ouvert seulement (un exercice clos n’est pas proposé)', async () => {
    await open();

    expect(await screen.findByText(fr.closing.memberTab.year('2026'))).toBeVisible();
    expect(screen.queryByText(fr.closing.memberTab.year('2025'))).toBeNull();
    expect(screen.getByText(labels.deliverable('SMT'))).toBeVisible();
    expect(screen.getByLabelText(/Pièces : faite le/)).toBeVisible();
    expect(screen.getByLabelText(/Dépôt : à faire au 30\/05\/2027/)).toBeVisible();
  });

  it('« Déposer des pièces » : une pièce au moins, puis préoccupation « Pièces de clôture »', async () => {
    const { user } = await open();

    await user.click(await screen.findByRole('button', { name: labels.deposit }));
    const dialog = await screen.findByRole('dialog', { name: labels.depositTitle });

    expect(within(dialog).getByLabelText(new RegExp(labels.subject))).toHaveValue(
      labels.defaultSubject('2026'),
    );
    await user.click(within(dialog).getByRole('button', { name: labels.submit }));
    expect(within(dialog).getByText(labels.filesRequired)).toBeVisible();

    await user.type(
      within(dialog).getByLabelText(new RegExp(labels.message)),
      'Grand livre et relevés.',
    );
    await user.upload(within(dialog).getByLabelText(new RegExp(labels.files)), [
      new File(['%PDF'], 'grand-livre.pdf', { type: 'application/pdf' }),
      new File(['%PDF'], 'releves.pdf', { type: 'application/pdf' }),
    ]);
    await user.click(within(dialog).getByRole('button', { name: labels.submit }));

    expect(await screen.findByText(labels.sent)).toBeVisible();
    await waitFor(() => {
      expect(server.closing.deposits()).toHaveLength(1);
    });
    expect(server.closing.deposits()[0]).toMatchObject({
      category: 'closing_pieces',
      subject: labels.defaultSubject('2026'),
      message: 'Grand livre et relevés.',
    });
  });

  it('dépôt refusé par le serveur : fichier refusé (422) puis conflit (409) affichés dans la modale', async () => {
    const { user } = await open();

    await user.click(await screen.findByRole('button', { name: labels.deposit }));
    const dialog = await screen.findByRole('dialog', { name: labels.depositTitle });

    await user.type(within(dialog).getByLabelText(new RegExp(labels.message)), 'Relevés.');
    await user.upload(
      within(dialog).getByLabelText(new RegExp(labels.files)),
      new File(['MZ'], 'releves.pdf', { type: 'application/pdf' }),
    );

    server.failNext(
      'POST',
      apiUrl('/member/concerns'),
      invalid({ 'attachments.0': 'Le fichier doit être un PDF, un JPG ou un PNG.' }),
    );
    await user.click(within(dialog).getByRole('button', { name: labels.submit }));
    expect(
      await within(dialog).findByText('Le fichier doit être un PDF, un JPG ou un PNG.'),
    ).toBeVisible();

    server.failNext(
      'POST',
      apiUrl('/member/concerns'),
      conflict('member_read_only', 'Votre dossier est en consultation seule.'),
    );
    await user.click(within(dialog).getByRole('button', { name: labels.submit }));
    expect(
      await within(dialog).findByText('Votre dossier est en consultation seule.'),
    ).toBeVisible();
    expect(server.closing.deposits()).toHaveLength(0);
  });

  it('clôture indisponible : bandeau d’erreur', async () => {
    server = installApiServer();
    for (let attempt = 0; attempt < 2; attempt++) {
      server.failNext('GET', apiUrl('/member/closing'), {
        status: 500,
        data: { message: 'panne' },
      });
    }
    server.signIn('0700000012', demoIds.memberOwner);
    const session = await httpAuthApi.currentSession();

    renderApp({ api: httpAuthApi, session, entry: memberSpaceRoutes.closing });
    expect(await screen.findByText(labels.loadError, {}, { timeout: 5_000 })).toBeVisible();
  });

  it('sans campagne ouverte : message d’attente', async () => {
    server = installApiServer();
    server.failNext('GET', apiUrl('/member/closing'), ok([]));
    server.signIn('0700000012', demoIds.memberOwner);
    const session = await httpAuthApi.currentSession();

    renderApp({ api: httpAuthApi, session, entry: memberSpaceRoutes.closing });
    expect(await screen.findByText(labels.empty)).toBeVisible();
    expect(screen.queryByRole('button', { name: labels.deposit })).toBeNull();
  });
});
