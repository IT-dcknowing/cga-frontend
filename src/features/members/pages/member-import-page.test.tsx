import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { httpAuthApi } from '@/features/auth/api/auth-api';
import { memberRoutes } from '@/features/members/lib/member';
import { config } from '@/lib/config';
import { fr } from '@/lib/i18n/fr';
import { apiUrl, demoIds, installApiServer } from '@/test/api-server';
import { fieldByLabel } from '@/test/fields';
import { renderApp } from '@/test/render-app';

/*
 * `/cga/imports/adherents` (F-IMP-02, 06-IMPLEMENTATION-PLAN étape 2.10) : modèle, analyse (aperçu
 * ancien n° → n° CGA Connect, RG-IMP-01, 02), import en file, progression et rapport ; vrai client
 * `http`, backend simulé (`api-imports.ts`).
 */
const labels = fr.members.import;

let server: ReturnType<typeof installApiServer>;
const pollMs = config.importPollMs;

beforeEach(() => {
  // L'avancement se relit vite pendant les tests.
  (config as { importPollMs: number }).importPollMs = 20;
});

afterEach(() => {
  server.restore();
  (config as { importPollMs: number }).importPollMs = pollMs;
  vi.restoreAllMocks();
});

const accesses = {
  gerant: ['0700000002', demoIds.manager],
  comptable: ['0700000004', demoIds.accountant],
} as const;

async function openImport(
  who: keyof typeof accesses = 'gerant',
  entry: string = memberRoutes.import,
) {
  server = installApiServer();

  const [phone, membershipId] = accesses[who];

  server.signIn(phone, membershipId);

  const session = await httpAuthApi.currentSession();
  const user = userEvent.setup({ delay: null });
  const view = renderApp({ api: httpAuthApi, session, entry });

  return { user, ...view };
}

function main() {
  return screen.getByRole('main');
}

const workbook = () =>
  new File(['xlsx'], 'portefeuille.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

async function analyze(user: ReturnType<typeof userEvent.setup>, start?: string) {
  await user.upload(fieldByLabel(main(), labels.file), workbook());

  if (start !== undefined) {
    await user.type(fieldByLabel(main(), labels.startNumber), start);
  }

  await user.click(screen.getByRole('button', { name: labels.analyze }));
}

describe('/cga/imports/adherents · import d’un portefeuille (F-IMP-02)', () => {
  it('le gérant y arrive depuis la liste ; le modèle se télécharge sous le nom donné par le serveur', async () => {
    const { user, router } = await openImport('gerant', memberRoutes.list);

    await user.click(await screen.findByRole('link', { name: fr.members.list.import }));

    expect(router.state.location.pathname).toBe(memberRoutes.import);
    expect(await screen.findByRole('heading', { level: 1, name: labels.title })).toBeVisible();

    const created = vi.fn(() => 'blob:modele');

    Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() });

    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    await user.click(screen.getByRole('button', { name: labels.downloadTemplate }));

    await waitFor(() => {
      expect(click).toHaveBeenCalledOnce();
    });
    expect(created).toHaveBeenCalledOnce();
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe(
      'modele-adherents-dck.xlsx',
    );
  });

  it('« Analyser » sans fichier : message sous le champ, rien n’est envoyé', async () => {
    const { user } = await openImport();

    await user.click(await screen.findByRole('button', { name: labels.analyze }));

    expect(await screen.findByText(labels.fileRequired)).toBeVisible();
    expect(server.requests.some((request) => request.url.includes('/preview'))).toBe(false);
  });

  it('RG-IMP-01, 02 · aperçu : compteurs, ancien n° → n° CGA Connect, brouillon et rejet avec motifs', async () => {
    const { user } = await openImport();

    await screen.findByRole('heading', { level: 1, name: labels.title });
    await analyze(user);

    const table = await screen.findByRole('table', { name: labels.caption });
    const [, imported, draft, rejected] = within(table).getAllByRole('row');

    expect(within(imported).getByText('DCK-OLD-41')).toBeVisible();
    expect(within(imported).getByText('2026-DCK-0003')).toBeVisible();
    expect(within(imported).getByText(fr.status.importRow.imported)).toHaveAttribute(
      'data-tone',
      'success',
    );
    expect(
      within(draft).getByText('Date de signature du contrat CGA non renseignée.'),
    ).toBeVisible();
    expect(within(rejected).getByText('NCC mal formé : 12AB.')).toBeVisible();
    expect(fieldByLabel(main(), labels.startNumber)).toHaveValue('3');
    expect(screen.getByText(labels.startNumberHint('3'))).toBeVisible();
    expect(screen.getByText(labels.paidNote)).toBeVisible();
  });

  it('numéro de départ déjà attribué : message du serveur sous le champ', async () => {
    const { user } = await openImport();

    await screen.findByRole('heading', { level: 1, name: labels.title });
    await analyze(user, '2');

    expect(
      await screen.findByText('Ce numéro est déjà attribué : partez de 3 au moins.'),
    ).toBeVisible();
    expect(fieldByLabel(main(), labels.startNumber)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('table', { name: labels.caption })).not.toBeInTheDocument();
  });

  it('numéro de départ non numérique : refusé avant l’envoi', async () => {
    const { user } = await openImport();

    await screen.findByRole('heading', { level: 1, name: labels.title });
    await analyze(user, 'abc');

    expect(await screen.findByText(fr.members.create.errors.number)).toBeVisible();
  });

  it('abréviation du centre manquante (409) : bandeau du serveur', async () => {
    const { user } = await openImport();

    await screen.findByRole('heading', { level: 1, name: labels.title });
    server.failNext('POST', apiUrl('/cga/imports/members/preview'), {
      status: 409,
      data: {
        message: 'Renseignez d’abord l’abréviation de numérotation du centre (fiche du CGA).',
        code: 'abbreviation_missing',
        details: {},
      },
    });
    await analyze(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Renseignez d’abord l’abréviation');
  });

  it('« Importer » : progression jusqu’au rapport, lien vers les adhérents, historique à jour', async () => {
    const { user, router } = await openImport();

    await screen.findByRole('heading', { level: 1, name: labels.title });
    await analyze(user, '10');
    await screen.findByRole('table', { name: labels.caption });

    expect(screen.getByText('2026-DCK-0010')).toBeVisible();

    await user.click(screen.getByRole('button', { name: labels.start }));

    expect(await screen.findByText(labels.started)).toBeInTheDocument();
    expect(
      await screen.findByText(labels.done('1', '1', '1'), {}, { timeout: 3000 }),
    ).toBeVisible();
    expect(screen.getByRole('progressbar', { name: labels.steps.progress })).toHaveAttribute(
      'aria-valuenow',
      '100',
    );
    expect(screen.getAllByRole('link', { name: labels.report })[0]).toHaveAttribute(
      'href',
      'https://files.test/rapport-2.xlsx',
    );

    const sent = server.requests.find((request) => request.url.endsWith('/cga/imports/members'));

    expect(sent?.body instanceof FormData && sent.body.get('start_number')).toBe('10');

    const history = screen.getByRole('list', { name: labels.history });

    await waitFor(() => {
      expect(within(history).getAllByRole('listitem')).toHaveLength(2);
    });

    await user.click(screen.getByRole('link', { name: labels.seeMembers }));
    expect(router.state.location.pathname).toBe(memberRoutes.list);
  });

  it('« Importer un autre fichier » repart d’un formulaire vide', async () => {
    const { user } = await openImport();

    await screen.findByRole('heading', { level: 1, name: labels.title });
    await analyze(user);
    await screen.findByRole('table', { name: labels.caption });
    await user.click(screen.getByRole('button', { name: labels.start }));
    await screen.findByText(labels.done('1', '1', '1'), {}, { timeout: 3000 });

    await user.click(screen.getByRole('button', { name: labels.again }));

    expect(fieldByLabel(main(), labels.startNumber)).toHaveValue('');
    expect(screen.queryByRole('table', { name: labels.caption })).not.toBeInTheDocument();
  });

  it('import refusé au dépôt (422 fichier) : message sous le champ', async () => {
    const { user } = await openImport();

    await screen.findByRole('heading', { level: 1, name: labels.title });
    await analyze(user);
    await screen.findByRole('table', { name: labels.caption });
    server.failNext('POST', apiUrl('/cga/imports/members'), {
      status: 422,
      data: { message: 'Fichier illisible.', errors: { file: ['Le classeur est illisible.'] } },
    });
    await user.click(screen.getByRole('button', { name: labels.start }));

    expect(await screen.findByText('Le classeur est illisible.')).toBeVisible();
  });

  it('historique en panne : bandeau et « Réessayer »', async () => {
    server = installApiServer();
    server.signIn(...accesses.gerant);
    server.failNext('GET', apiUrl('/cga/imports'), { status: 500 });
    server.failNext('GET', apiUrl('/cga/imports'), { status: 500 });

    const session = await httpAuthApi.currentSession();
    const user = userEvent.setup({ delay: null });

    renderApp({ api: httpAuthApi, session, entry: memberRoutes.import });

    expect(await screen.findByText(labels.loadError, {}, { timeout: 4000 })).toBeVisible();
    await user.click(screen.getByRole('button', { name: fr.common.retry }));
    expect(await screen.findByText('Koffi Gérant', { exact: false })).toBeVisible();
  });

  it('sans le droit « Importer » : écran « Vous n’avez pas accès »', async () => {
    await openImport('comptable');

    expect(
      await screen.findByRole('heading', { level: 1, name: fr.errorScreens.forbiddenTitle }),
    ).toBeVisible();
  });
});
