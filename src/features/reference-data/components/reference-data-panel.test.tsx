import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { httpAuthApi } from '@/features/auth/api/auth-api';
import { fr } from '@/lib/i18n/fr';
import { apiUrl, demoIds, installApiServer } from '@/test/api-server';
import { fieldByLabel } from '@/test/fields';
import { renderApp } from '@/test/render-app';

/*
 * `/plateforme`, onglet « Données de référence » (étape 1.10, RG-DATA-01, 02, 03-APPFLOW §6) : état
 * de chaque jeu, modèle Excel, import « mettre à jour » ou « remplacer » avec aperçu avant
 * confirmation, « Marquer comme validé ». Vrai client `http`, backend simulé (`api-reference-data.ts`).
 */
const labels = fr.referenceData;
const text = labels.importDialog;
const ENTRY = '/plateforme?onglet=donnees';

let server: ReturnType<typeof installApiServer>;

afterEach(() => {
  server.restore();
  vi.restoreAllMocks();
});

async function open() {
  server = installApiServer();
  server.signIn('0700000009', demoIds.platformAdmin);

  const session = await httpAuthApi.currentSession();
  const user = userEvent.setup({ delay: null });
  const view = renderApp({ api: httpAuthApi, session, entry: ENTRY });

  return { user, ...view };
}

type User = ReturnType<typeof userEvent.setup>;

async function action(user: User, dataset: string, item: string) {
  await user.click(screen.getByRole('button', { name: fr.referentials.rowActions(dataset) }));
  await user.click(screen.getByRole('menuitem', { name: item }));
}

function writes(suffix: string) {
  return server.requests.filter(
    (request) => request.method !== 'GET' && new URL(request.url).pathname.endsWith(suffix),
  );
}

const JOURNEY = { timeout: 15_000 };

describe('/plateforme · Données de référence (1.10, RG-DATA-01, 02)', JOURNEY, () => {
  it('RG-DATA-01 · jeux : nombre d’éléments, provisoires, badge ; modèle Excel téléchargé', async () => {
    const { user } = await open();

    const list = within(await screen.findByRole('list', { name: labels.caption }));
    const directorates = list.getByText('Directions régionales').closest('li') as HTMLElement;

    expect(
      within(directorates).getByText(`${labels.count('2')} · ${labels.provisional('2')}`),
    ).toBeVisible();
    expect(within(directorates).getByText(fr.status.dataStatus.provisional)).toBeVisible();
    expect(
      within(list.getByText('Centres des impôts').closest('li') as HTMLElement).queryByText(
        fr.status.dataStatus.provisional,
      ),
    ).toBeNull();

    const created = vi.fn(() => 'blob:modele');

    Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() });

    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    await action(user, 'Directions régionales', labels.template);
    await waitFor(() => {
      expect(click).toHaveBeenCalledOnce();
    });
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe(
      'modele-regional-directorates.xlsx',
    );
  });

  it('RG-DATA-02 · import « remplacer » : fichier exigé, aperçu (ajouts, modifications, retraits, rejets), puis appliqué', async () => {
    const { user } = await open();

    await screen.findByRole('list', { name: labels.caption });
    await action(user, 'Directions régionales', labels.import);

    const dialog = screen.getByRole('dialog', { name: text.title('Directions régionales') });

    await user.click(within(dialog).getByRole('button', { name: text.analyse }));
    expect(await within(dialog).findByText(fr.members.create.errors.required)).toBeVisible();

    await user.click(within(dialog).getByRole('radio', { name: text.modes.replace }));
    await user.upload(
      fieldByLabel(dialog, text.file),
      new File(['PK'], 'drs.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    );
    await user.click(within(dialog).getByRole('button', { name: text.analyse }));

    const preview = within(await within(dialog).findByRole('region', { name: text.previewTitle }));

    expect(preview.getByText(text.summary.creates)).toBeVisible();
    expect(preview.getByText(text.summary.deactivates)).toBeVisible();
    expect(preview.getByText(/DR Abidjan \(démonstration\) → DR Abidjan Nord/)).toBeVisible();
    expect(
      preview.getByText(/DR Bouaké \(démonstration\) — Désactivée \(utilisée\)/),
    ).toBeVisible();
    expect(preview.getByText(/Le code est obligatoire\./)).toBeVisible();
    expect(preview.getByText(/Nom proche d’une DR existante\./)).toBeVisible();
    expect(writes('/apply')).toHaveLength(0);
    expect(within(dialog).getByRole('radio', { name: text.modes.replace })).toBeDisabled();

    await user.click(within(dialog).getByRole('button', { name: text.apply }));

    expect(await screen.findByText(text.applied)).toBeInTheDocument();
    expect(writes('/regional-directorates/apply').at(-1)?.body).toEqual({
      file_id: '01fil900000000000000000001',
      mode: 'replace',
    });
    expect(
      await screen.findByText(`${labels.count('3')} · ${labels.provisional('2')}`),
    ).toBeVisible();
  });

  it('fichier refusé (422) sous le champ ; refus à l’application (409) dans la modale', async () => {
    const { user } = await open();

    await screen.findByRole('list', { name: labels.caption });
    await action(user, 'Centres des impôts', labels.import);

    const dialog = screen.getByRole('dialog', { name: text.title('Centres des impôts') });

    // Le sélecteur ne propose que des classeurs ; le serveur vérifie de toute façon le contenu.
    const loose = userEvent.setup({ delay: null, applyAccept: false });

    await loose.upload(
      fieldByLabel(dialog, text.file),
      new File(['x'], 'cdi.csv', { type: 'text/csv' }),
    );
    await user.click(within(dialog).getByRole('button', { name: text.analyse }));
    expect(
      await within(dialog).findByText('Le fichier doit être un classeur Excel (.xlsx).'),
    ).toBeVisible();

    await user.upload(
      fieldByLabel(dialog, text.file),
      new File(['PK'], 'cdi.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    );
    await user.click(within(dialog).getByRole('button', { name: text.analyse }));
    await within(dialog).findByRole('region', { name: text.previewTitle });

    server.failNext('POST', apiUrl('/reference-data/tax-offices/apply'), {
      status: 409,
      data: { message: 'Le fichier a changé depuis l’aperçu.', code: 'import_stale', details: {} },
    });
    await user.click(within(dialog).getByRole('button', { name: text.apply }));
    expect(await within(dialog).findByText('Le fichier a changé depuis l’aperçu.')).toBeVisible();
  });

  it('« Marquer comme validé » : confirmation, nombre de valeurs validées, badge retiré', async () => {
    const { user } = await open();

    await screen.findByRole('list', { name: labels.caption });
    await action(user, 'Registre des CGA', labels.validate);

    const dialog = screen.getByRole('dialog', { name: labels.validateDialog.title });

    expect(within(dialog).getByText(labels.validateDialog.effects[0])).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: labels.validateDialog.submit }));

    expect(await screen.findByText(labels.validated('4'))).toBeInTheDocument();
    expect(writes('/cgas/validate')).toHaveLength(1);
    await waitFor(() => {
      expect(
        within(screen.getByText('Registre des CGA').closest('li') as HTMLElement).queryByText(
          fr.status.dataStatus.provisional,
        ),
      ).toBeNull();
    });

    // Plus rien de provisoire : l'action disparaît du menu.
    await user.click(
      screen.getByRole('button', { name: fr.referentials.rowActions('Registre des CGA') }),
    );
    expect(screen.queryByRole('menuitem', { name: labels.validate })).toBeNull();
  });

  it('panne : bandeau et « Réessayer » ; refus de la validation (409) dans la modale', async () => {
    server = installApiServer();
    server.signIn('0700000009', demoIds.platformAdmin);
    for (let attempt = 0; attempt < 2; attempt++) {
      server.failNext('GET', apiUrl('/reference-data'), {
        status: 500,
        data: { message: 'Erreur.' },
      });
    }

    const session = await httpAuthApi.currentSession();
    const user = userEvent.setup({ delay: null });

    renderApp({ api: httpAuthApi, session, entry: ENTRY });
    expect(await screen.findByText(labels.loadError, {}, { timeout: 4000 })).toBeVisible();
    await user.click(screen.getByRole('button', { name: fr.common.retry }));
    await screen.findByRole('list', { name: labels.caption });

    server.failNext('POST', apiUrl('/reference-data/regional-directorates/validate'), {
      status: 409,
      data: { message: 'Rien à valider.', code: 'nothing_provisional', details: {} },
    });
    await action(user, 'Directions régionales', labels.validate);

    const dialog = screen.getByRole('dialog', { name: labels.validateDialog.title });

    await user.click(within(dialog).getByRole('button', { name: labels.validateDialog.submit }));
    expect(await within(dialog).findByText('Rien à valider.')).toBeVisible();
  });
});
