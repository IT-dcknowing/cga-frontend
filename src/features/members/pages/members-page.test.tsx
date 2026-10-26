import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { httpAuthApi } from '@/features/auth/api/auth-api';
import { memberRoutes } from '@/features/members/lib/member';
import { fr } from '@/lib/i18n/fr';
import { createMembersBackend } from '@/test/api-members';
import { apiUrl, demoIds, installApiServer } from '@/test/api-server';
import { demoMember, demoMemberIds } from '@/test/demo-members';
import { renderApp } from '@/test/render-app';

/*
 * `/cga/adherents` (F-ADH-01, 06-IMPLEMENTATION-PLAN étape 2.7) dans l'application : coque, droits
 * de `/me`, vrai client `http` et backend simulé (`installApiServer`, `api-members.ts`).
 */
const labels = fr.members.list;

let server: ReturnType<typeof installApiServer>;

afterEach(() => {
  server.restore();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

/** Accès DC-KNOWING (gérant, comptable) et Bouaké (formateur). */
const accesses = {
  gerant: ['0700000002', demoIds.manager],
  comptable: ['0700000004', demoIds.accountant],
  formateur: ['0700000007', demoIds.trainer],
} as const;

async function openList(
  who: keyof typeof accesses = 'gerant',
  entry: string = memberRoutes.list,
  options: Parameters<typeof installApiServer>[0] = {},
) {
  server = installApiServer(options);

  const [phone, membershipId] = accesses[who];

  server.signIn(phone, membershipId);

  const session = await httpAuthApi.currentSession();

  return { user: userEvent.setup(), ...renderApp({ api: httpAuthApi, session, entry }) };
}

function membersTable() {
  return screen.getByRole('table', { name: labels.caption });
}

/** Raison sociale de chaque ligne (troisième colonne). */
function rowNames(): string[] {
  return within(membersTable())
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell'))
    .filter((cells) => cells.length > 1)
    .map((cells) => cells[2].textContent);
}

async function expectRows(names: string[]) {
  await screen.findByRole('table', { name: labels.caption });
  await waitFor(() => {
    expect(rowNames()).toEqual(names);
  });
}

function listRequests(): URLSearchParams[] {
  return server.requests
    .filter((request) => request.method === 'GET' && request.url.includes('/cga/members?'))
    .map((request) => new URL(request.url).searchParams);
}

function lastListRequest(): URLSearchParams {
  return listRequests().at(-1) as URLSearchParams;
}

function selector() {
  return screen.getByRole('radiogroup', { name: fr.members.portfolio.selector });
}

describe('/cga/adherents · liste des adhérents (F-ADH-01)', () => {
  it('le gérant ouvre la liste par le menu : dossiers actifs du portefeuille CGA, n°, ancien n°, badges', async () => {
    const { user, router } = await openList('gerant', '/cga/tableau-de-bord');

    await user.click(await screen.findByRole('link', { name: fr.nav.members }));

    expect(router.state.location.pathname).toBe(memberRoutes.list);
    expect(await screen.findByRole('heading', { level: 1, name: fr.nav.members })).toBeVisible();
    await expectRows(['BOULANGERIE ADJOUABA', 'QUINCAILLERIE BAMBA']);
    expect(lastListRequest().get('filter[portfolio]')).toBe('cga');
    expect(lastListRequest().get('filter[status]')).toBe('active');

    const first = within(within(membersTable()).getAllByRole('row')[1]);

    expect(first.getByText('2026-DCK-0001')).toBeVisible();
    expect(first.getByText('DCK-OLD-7')).toBeVisible();
    // 04-UX-UI §2.2 : badge de portefeuille et étiquette d'apporteur à côté du numéro.
    expect(first.getByText(fr.members.portfolio.badge.cga)).toHaveAttribute(
      'data-portfolio',
      'cga',
    );
    expect(first.getByText('Accessoire 1')).toBeVisible();
    expect(first.getByText(fr.status.pieces.complete)).toBeVisible();
    // Le second n'a ni ancien n° ni apporteur.
    expect(within(within(membersTable()).getAllByRole('row')[2]).getByText('—')).toBeVisible();
  });

  it('onglets : dossiers à compléter, radiations en cours, radiés / clos (statuts multiples)', async () => {
    const { user, router } = await openList();
    await expectRows(['BOULANGERIE ADJOUABA', 'QUINCAILLERIE BAMBA']);

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(
      Object.values(labels.tabs),
    );

    await user.click(screen.getByRole('tab', { name: labels.tabs.brouillons }));
    await expectRows(['ETS KOUADIO & FILS']);
    expect(router.state.location.search).toBe('?tab=brouillons');
    expect(lastListRequest().get('filter[status]')).toBe('draft');

    await user.click(screen.getByRole('tab', { name: labels.tabs['radiations-en-cours'] }));
    await expectRows(['PHARMACIE YAO']);

    await user.click(screen.getByRole('tab', { name: labels.tabs.radies }));
    await expectRows(['GARAGE TOURÉ']);
    expect(lastListRequest().get('filter[status]')).toBe('radiated,closed');

    // « Tous » : le dossier Cabinet clos rejoint l'onglet.
    await user.click(within(selector()).getByRole('radio', { name: fr.members.portfolio.all }));
    await expectRows(['ANCIEN CLIENT SA', 'GARAGE TOURÉ']);
    expect(lastListRequest().get('filter[portfolio]')).toBe('all');

    await user.click(screen.getByRole('tab', { name: labels.tabs.actifs }));
    await expectRows(['BOULANGERIE ADJOUABA', 'CABINET CLIENT SARL', 'QUINCAILLERIE BAMBA']);
    expect(router.state.location.search).toBe('?portefeuille=all');
  });

  it('03-APPFLOW §4.3 · un lien du tableau de bord ouvre l’onglet demandé', async () => {
    await openList('gerant', `${memberRoutes.list}?tab=radiations-en-cours`);

    await expectRows(['PHARMACIE YAO']);
    expect(screen.getByRole('tab', { name: labels.tabs['radiations-en-cours'] })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('sélecteur de portefeuille : Cabinet, badge « Cabinet », choix mémorisé pour la prochaine visite', async () => {
    const first = await openList();
    await expectRows(['BOULANGERIE ADJOUABA', 'QUINCAILLERIE BAMBA']);

    await first.user.click(
      within(selector()).getByRole('radio', { name: fr.members.portfolio.cabinet }),
    );
    await expectRows(['CABINET CLIENT SARL']);
    expect(within(membersTable()).getByText('CAB-DCK-00001')).toBeVisible();
    expect(within(membersTable()).getByText(fr.members.portfolio.badge.cabinet)).toHaveAttribute(
      'data-portfolio',
      'cabinet',
    );
    expect(
      within(selector()).getByRole('radio', { name: fr.members.portfolio.cabinet }),
    ).toHaveAttribute('aria-checked', 'true');

    first.unmount();
    server.restore();
    await openList();

    await expectRows(['CABINET CLIENT SARL']);
    expect(lastListRequest().get('filter[portfolio]')).toBe('cabinet');
  });

  it('stockage local indisponible : la liste s’ouvre sur le portefeuille CGA, sans erreur', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqué');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqué');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { user } = await openList();
    await expectRows(['BOULANGERIE ADJOUABA', 'QUINCAILLERIE BAMBA']);

    await user.click(within(selector()).getByRole('radio', { name: fr.members.portfolio.cabinet }));

    await expectRows(['CABINET CLIENT SARL']);
    expect(console.warn).toHaveBeenCalled();
  });

  it('recherche par ancien n° après une pause de frappe ; elle vit dans l’adresse', async () => {
    const { user, router } = await openList();
    await expectRows(['BOULANGERIE ADJOUABA', 'QUINCAILLERIE BAMBA']);

    await user.type(screen.getByRole('searchbox', { name: labels.search }), 'old-7');

    await waitFor(() => {
      expect(router.state.location.search).toBe('?recherche=old-7');
    });
    await expectRows(['BOULANGERIE ADJOUABA']);
    expect(listRequests().map((query) => query.get('filter[search]'))).toEqual([null, 'old-7']);
  });

  it('filtres régime, CDI et apporteur ; l’apporteur disparaît hors du portefeuille CGA (RG-PTF-06)', async () => {
    const { user, router } = await openList();
    await expectRows(['BOULANGERIE ADJOUABA', 'QUINCAILLERIE BAMBA']);

    await user.selectOptions(screen.getByLabelText(labels.regimeFilter), 'RME');
    await expectRows(['QUINCAILLERIE BAMBA']);
    expect(lastListRequest().get('filter[regime]')).toBe('RME');

    await user.selectOptions(screen.getByLabelText(labels.regimeFilter), '');
    await user.selectOptions(
      await screen.findByLabelText(labels.taxOfficeFilter),
      'CDI Plateau (démonstration)',
    );
    await expectRows(['BOULANGERIE ADJOUABA']);

    await user.selectOptions(screen.getByLabelText(labels.taxOfficeFilter), '');
    const referrer = screen.getByLabelText(labels.referrerFilter);

    await waitFor(() => {
      expect(referrer).toBeEnabled();
    });
    await user.selectOptions(referrer, 'Accessoire 1 · Kossonou Apporteur');
    await expectRows(['BOULANGERIE ADJOUABA']);
    expect(lastListRequest().get('filter[referrer_id]')).toBe('01ref000000000000000000001');
    expect(router.state.location.search).toBe('?apporteur=01ref000000000000000000001');

    await user.click(within(selector()).getByRole('radio', { name: fr.members.portfolio.cabinet }));

    await expectRows(['CABINET CLIENT SARL']);
    expect(screen.queryByLabelText(labels.referrerFilter)).not.toBeInTheDocument();
    expect(router.state.location.search).toBe('?portefeuille=cabinet');
    expect(lastListRequest().has('filter[referrer_id]')).toBe(false);
  });

  it('RG-PTF-06 · sans le droit « Voir les apporteurs » : ni filtre, ni étiquette, ni lecture des apporteurs', async () => {
    await openList('comptable');

    await expectRows(['BOULANGERIE ADJOUABA', 'QUINCAILLERIE BAMBA']);
    expect(screen.queryByLabelText(labels.referrerFilter)).not.toBeInTheDocument();
    expect(screen.queryByText('Accessoire 1')).not.toBeInTheDocument();
    expect(server.requests.some((request) => request.url.includes('/cga/referrers'))).toBe(false);
    // Le comptable voit le portefeuille Cabinet.
    expect(selector()).toBeVisible();
  });

  it('RG-PTF-02 · sans le droit du Cabinet : pas de sélecteur, portefeuille CGA seul, même par l’adresse', async () => {
    await openList('formateur', `${memberRoutes.list}?portefeuille=cabinet`);

    await expectRows(['BOULANGERIE ADJOUABA', 'QUINCAILLERIE BAMBA']);
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(lastListRequest().get('filter[portfolio]')).toBe('cga');
    // Le formateur consulte : ni inscription, ni import (03-APPFLOW §4.1).
    expect(screen.queryByRole('link', { name: labels.create })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: labels.import })).not.toBeInTheDocument();
  });

  it('« Inscrire un adhérent » et « Importer un portefeuille » pour le gérant ; le comptable inscrit sans importer', async () => {
    const { user, router } = await openList();
    await expectRows(['BOULANGERIE ADJOUABA', 'QUINCAILLERIE BAMBA']);

    expect(screen.getByRole('link', { name: labels.import })).toHaveAttribute(
      'href',
      memberRoutes.import,
    );

    await user.click(screen.getByRole('link', { name: labels.create }));
    expect(router.state.location.pathname).toBe(memberRoutes.create);

    server.restore();
    await openList('comptable');
    expect(await screen.findAllByRole('link', { name: labels.create })).not.toHaveLength(0);
    expect(screen.queryByRole('link', { name: labels.import })).not.toBeInTheDocument();
  });

  it('clic sur une ligne → dossier de l’adhérent', async () => {
    const { user, router } = await openList();
    await expectRows(['BOULANGERIE ADJOUABA', 'QUINCAILLERIE BAMBA']);

    await user.click(within(membersTable()).getByText('QUINCAILLERIE BAMBA'));

    expect(router.state.location.pathname).toBe(memberRoutes.detail(demoMemberIds.bamba));
  });

  it('tri par le serveur sur la raison sociale ; seules la raison sociale et le n° sont triables', async () => {
    const { user } = await openList();
    await expectRows(['BOULANGERIE ADJOUABA', 'QUINCAILLERIE BAMBA']);

    const table = membersTable();

    await user.click(within(table).getByRole('button', { name: labels.columns.companyName }));
    await waitFor(() => {
      expect(lastListRequest().get('sort')).toBe('company_name');
    });
    await user.click(within(table).getByRole('button', { name: labels.columns.companyName }));
    await expectRows(['QUINCAILLERIE BAMBA', 'BOULANGERIE ADJOUABA']);
    expect(lastListRequest().get('sort')).toBe('-company_name');
    expect(within(table).getByRole('button', { name: labels.columns.number })).toBeVisible();
    expect(
      within(table).queryByRole('button', { name: labels.columns.ncc }),
    ).not.toBeInTheDocument();
  });

  it('pagination par le serveur : la page 2 part en ?page=2', async () => {
    const many = Array.from({ length: 30 }, (_, index) =>
      demoMember({
        id: `01mbr9${String(index).padStart(20, '0')}`,
        company_name: `ADHÉRENT ${String(index).padStart(2, '0')}`,
        ncc: `20000${String(index).padStart(2, '0')}A`,
      }),
    );
    const { user, router } = await openList('gerant', memberRoutes.list, {
      members: createMembersBackend(many),
    });
    await expectRows(many.slice(0, 25).map((member) => member.company_name));

    await user.click(screen.getByRole('button', { name: fr.table.next }));

    await expectRows(many.slice(25).map((member) => member.company_name));
    expect(router.state.location.search).toBe('?page=2');
    expect(lastListRequest().get('page')).toBe('2');
  });

  it('03-APPFLOW §7 · onglet vide : sa phrase ; aucun résultat d’une recherche : « aucun dossier ne correspond »', async () => {
    const { user } = await openList('gerant', memberRoutes.list, {
      members: createMembersBackend([]),
    });

    await screen.findByRole('table', { name: labels.caption });
    expect(await within(membersTable()).findByText(labels.empty.actifs)).toBeVisible();
    // L'onglet des actifs propose d'inscrire le premier adhérent.
    expect(within(membersTable()).getByRole('link', { name: labels.create })).toBeVisible();

    await user.click(screen.getByRole('tab', { name: labels.tabs.radies }));
    expect(await within(membersTable()).findByText(labels.empty.radies)).toBeVisible();

    await user.type(screen.getByRole('searchbox', { name: labels.search }), 'zzz');
    expect(await within(membersTable()).findByText(labels.noMatch)).toBeVisible();
  });

  it('erreur du serveur : bandeau et « Réessayer », qui recharge la liste', async () => {
    server = installApiServer();
    server.signIn(...accesses.gerant);
    server.failNext('GET', apiUrl('/cga/members'), { status: 500 });
    server.failNext('GET', apiUrl('/cga/members'), { status: 500 });

    const session = await httpAuthApi.currentSession();
    const user = userEvent.setup();
    renderApp({ api: httpAuthApi, session, entry: memberRoutes.list });

    expect(await screen.findByText(labels.loadError, {}, { timeout: 4000 })).toBeVisible();

    await user.click(screen.getByRole('button', { name: fr.common.retry }));

    await expectRows(['BOULANGERIE ADJOUABA', 'QUINCAILLERIE BAMBA']);
  });

  it('03-APPFLOW §7 · un refus 403 de l’API affiche l’écran commun', async () => {
    server = installApiServer();
    server.signIn(...accesses.gerant);
    server.failNext('GET', apiUrl('/cga/members'), {
      status: 403,
      data: { message: 'Vous n’avez pas le droit de faire cette action.', code: 'forbidden' },
    });

    const session = await httpAuthApi.currentSession();
    renderApp({ api: httpAuthApi, session, entry: memberRoutes.list });

    expect(
      await screen.findByRole('heading', { level: 1, name: fr.errorScreens.forbiddenTitle }),
    ).toBeVisible();
  });
});
