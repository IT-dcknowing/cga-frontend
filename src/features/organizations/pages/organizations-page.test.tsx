import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { httpAuthApi } from '@/features/auth/api/auth-api';
import { demoOrganization } from '@/features/organizations/api/fake-organizations-api';
import { organizationRoutes } from '@/features/organizations/lib/organization';
import { config } from '@/lib/config';
import { fr } from '@/lib/i18n/fr';
import { apiUrl, demoIds, installApiServer } from '@/test/api-server';
import { fieldByLabel } from '@/test/fields';
import { renderApp } from '@/test/render-app';

/*
 * `/cncga/membres` (F-ORG-01, F-ORG-02) dans l'application : coque, droits de `/me`, vrai client
 * `http` et backend de la plateforme simulé (`installApiServer`).
 */
let server: ReturnType<typeof installApiServer>;

afterEach(() => {
  server.restore();
});

/** Accès CNCGA de démonstration : Présidente, gestionnaire, membre du bureau. */
const accesses = {
  presidente: ['0700000001', demoIds.president],
  gestionnaire: ['0700000003', demoIds.multiCncga],
  bureau: ['0700000013', demoIds.board],
} as const;

async function openRegistry(
  who: keyof typeof accesses = 'presidente',
  entry: string = organizationRoutes.list,
  options: Parameters<typeof installApiServer>[0] = {},
) {
  server = installApiServer(options);

  const [phone, membershipId] = accesses[who];

  server.signIn(phone, membershipId);

  const session = await httpAuthApi.currentSession();

  return renderApp({ api: httpAuthApi, session, entry });
}

function registryTable() {
  return screen.getByRole('table', { name: fr.registry.caption });
}

/** Dénominations des lignes affichées (la ligne « aucun résultat » n'est pas un CGA). */
function rowNames(): string[] {
  return within(registryTable())
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell'))
    .filter((cells) => cells.length > 1)
    .map((cells) => cells[0].textContent);
}

/** Attend les lignes : pendant un rechargement, les lignes précédentes restent affichées. */
async function expectRows(names: string[]) {
  await screen.findByRole('table', { name: fr.registry.caption });
  await waitFor(() => {
    expect(rowNames()).toEqual(names);
  });
}

const DEMO_ROWS = ['CGA Démo BouakéDEMOB', 'CGA Démo SuspenduDEMOS', 'DC-KNOWING CGADCK'];

function registryRequests(): URL[] {
  return server.requests
    .filter(
      (request) => request.method === 'GET' && request.url.includes('/network/organizations?'),
    )
    .map((request) => new URL(request.url));
}

describe('/cncga/membres · registre des CGA (F-ORG-01)', () => {
  it('la Présidente ouvre le registre par le menu : une ligne par CGA, adhérents comptés', async () => {
    const user = userEvent.setup();
    const { router } = await openRegistry('presidente', '/cncga/tableau-de-bord');

    await user.click(
      within(screen.getByRole('navigation', { name: fr.shell.mainMenu })).getByRole('link', {
        name: fr.nav.cncgaMembers,
      }),
    );

    expect(router.state.location.pathname).toBe(organizationRoutes.list);
    await expectRows(DEMO_ROWS);

    const dck = within(registryTable()).getByRole('row', { name: /DC-KNOWING CGA/ });

    expect(dck).toHaveTextContent('Abidjan');
    expect(dck).toHaveTextContent('DR Abidjan (démonstration)');
    expect(dck).toHaveTextContent('AGR-DEMO-001');
    expect(within(dck).getByText(fr.status.organization.active)).toHaveAttribute(
      'data-tone',
      'success',
    );
    expect(within(dck).getByText(fr.status.subscription.active)).toBeInTheDocument();
    // RG-ORG-02 : nombre d'adhérents calculé par le serveur.
    expect(within(dck).getAllByRole('cell').at(-1)).toHaveTextContent('3');
  });

  it('04-UX-UI §2.1 · statuts écrits en toutes lettres ; valeur absente « — »', async () => {
    await openRegistry();
    await expectRows(DEMO_ROWS);

    const bouake = within(registryTable()).getByRole('row', { name: /CGA Démo Bouaké/ });
    const suspended = within(registryTable()).getByRole('row', { name: /CGA Démo Suspendu/ });

    expect(within(bouake).getByText(fr.status.subscription.none)).toHaveAttribute(
      'data-tone',
      'neutral',
    );
    expect(within(bouake).getByText(fr.table.none)).toBeInTheDocument();
    expect(within(suspended).getByText(fr.status.organization.suspended)).toHaveAttribute(
      'data-tone',
      'danger',
    );
  });

  it('03-APPFLOW §7 · squelettes pendant le chargement, jamais d’écran blanc', async () => {
    await openRegistry();

    expect(registryTable()).toHaveAttribute('aria-busy', 'true');
    await expectRows(DEMO_ROWS);
    expect(registryTable()).not.toHaveAttribute('aria-busy');
  });

  it('clic sur une ligne → fiche du CGA', async () => {
    const user = userEvent.setup();
    const { router } = await openRegistry();
    await expectRows(DEMO_ROWS);

    await user.click(within(registryTable()).getByRole('row', { name: /CGA Démo Bouaké/ }));

    expect(router.state.location.pathname).toBe(organizationRoutes.detail(demoIds.bouake));
    expect(await screen.findByRole('heading', { level: 1, name: 'CGA Démo Bouaké' })).toBeVisible();
  });

  it('recherche après une pause de frappe, envoyée en filter[search] ; elle vit dans l’adresse', async () => {
    const user = userEvent.setup();
    const { router } = await openRegistry();
    await expectRows(DEMO_ROWS);

    await user.type(screen.getByRole('searchbox', { name: fr.registry.search }), 'bouaké');

    await waitFor(() => {
      expect(router.state.location.search).toBe('?recherche=bouak%C3%A9');
    });
    await expectRows(['CGA Démo BouakéDEMOB']);
    // Une seule requête pour la saisie : la recherche attend la fin de la frappe.
    expect(registryRequests().map((url) => url.searchParams.get('filter[search]'))).toEqual([
      null,
      'bouaké',
    ]);
  });

  it('filtres Statut, Abonnement et DR (F-ORG-01) ; un nouveau filtre ramène à la page 1', async () => {
    const user = userEvent.setup();
    const { router } = await openRegistry('presidente', `${organizationRoutes.list}?page=2`);

    await user.selectOptions(
      screen.getByRole('combobox', { name: fr.registry.statusFilter }),
      fr.status.organization.suspended,
    );

    expect(router.state.location.search).toBe('?statut=suspended');
    await expectRows(['CGA Démo SuspenduDEMOS']);

    await user.selectOptions(
      screen.getByRole('combobox', { name: fr.registry.statusFilter }),
      fr.common.all,
    );
    await user.selectOptions(
      screen.getByRole('combobox', { name: fr.registry.subscriptionFilter }),
      fr.status.subscription.active,
    );

    await expectRows(['DC-KNOWING CGADCK']);
    expect(registryRequests().at(-1)?.searchParams.get('filter[subscription_status]')).toBe(
      'active',
    );

    await user.selectOptions(
      screen.getByRole('combobox', { name: fr.registry.subscriptionFilter }),
      fr.common.all,
    );
    await user.selectOptions(
      screen.getByRole('combobox', { name: fr.registry.regionFilter }),
      'DR Bouaké (démonstration)',
    );

    await expectRows(['CGA Démo BouakéDEMOB']);
    expect(registryRequests().at(-1)?.searchParams.get('filter[regional_directorate_id]')).toBe(
      '01dr0000000000000000000002',
    );
  });

  it('tri par le serveur : un clic sur « Ville » trie, un second inverse ; seules dénomination et ville sont triables', async () => {
    const user = userEvent.setup();
    const { router } = await openRegistry();
    await expectRows(DEMO_ROWS);

    const table = registryTable();

    await user.click(within(table).getByRole('button', { name: fr.registry.columns.city }));

    expect(router.state.location.search).toBe('?tri=city');
    await expectRows(['DC-KNOWING CGADCK', 'CGA Démo BouakéDEMOB', 'CGA Démo SuspenduDEMOS']);
    expect(registryRequests().at(-1)?.searchParams.get('sort')).toBe('city');

    await user.click(within(table).getByRole('button', { name: fr.registry.columns.city }));

    expect(router.state.location.search).toBe('?tri=-city');
    expect(
      within(table).queryByRole('button', { name: fr.registry.columns.members }),
    ).not.toBeInTheDocument();
  });

  it('les filtres de l’adresse sont repris à l’ouverture', async () => {
    await openRegistry(
      'presidente',
      `${organizationRoutes.list}?recherche=abidjan&abonnement=none`,
    );

    expect(await screen.findAllByText(fr.registry.noMatch)).not.toHaveLength(0);
    expect(rowNames()).toEqual([]);
    expect(screen.getByRole('searchbox', { name: fr.registry.search })).toHaveValue('abidjan');
    expect(screen.getByRole('combobox', { name: fr.registry.subscriptionFilter })).toHaveValue(
      'none',
    );
  });

  it('pagination par le serveur : « 1–25 sur 30 », puis la page 2 (02-TRD §4.3)', async () => {
    const user = userEvent.setup();
    const cgas = Array.from({ length: 30 }, (_, index) =>
      demoOrganization({
        id: `01cga7${String(index + 1).padStart(20, '0')}`,
        name: `CGA ${String(index + 1).padStart(2, '0')}`,
        city: 'Abidjan',
      }),
    );
    const { router } = await openRegistry('presidente', organizationRoutes.list, { cgas });

    await waitFor(() => {
      expect(rowNames()).toHaveLength(config.pageSize);
    });
    expect(screen.getByText('1–25 sur 30')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: fr.table.next }));

    expect(router.state.location.search).toBe('?page=2');
    await waitFor(() => {
      expect(screen.getByText('26–30 sur 30')).toBeInTheDocument();
    });
    expect(registryRequests().at(-1)?.searchParams.get('page')).toBe('2');

    await user.click(screen.getByRole('button', { name: fr.table.previous }));

    expect(router.state.location.search).toBe('');
  });

  it('03-APPFLOW §7 · registre vide : phrase et action principale', async () => {
    await openRegistry('presidente', organizationRoutes.list, { cgas: [] });

    expect(
      await within(await screen.findByRole('table')).findByText(fr.registry.empty),
    ).toBeInTheDocument();
    // En-tête de page, puis l'état vide du tableau et celui de la liste mobile.
    expect(screen.getAllByRole('button', { name: fr.registry.create })).toHaveLength(3);
  });

  it('erreur du serveur : bandeau et « Réessayer », qui recharge le registre', async () => {
    const user = userEvent.setup();

    server = installApiServer();
    server.signIn('0700000001', demoIds.president);
    // Un échec, puis le nouvel essai automatique de React Query, échouent tous deux.
    server.failNext('GET', apiUrl('/network/organizations'), { status: 500 });
    server.failNext('GET', apiUrl('/network/organizations'), { status: 500 });

    const session = await httpAuthApi.currentSession();
    renderApp({ api: httpAuthApi, session, entry: organizationRoutes.list });

    expect(await screen.findByText(fr.registry.loadError, {}, { timeout: 4000 })).toBeVisible();

    await user.click(screen.getByRole('button', { name: fr.common.retry }));

    await expectRows(DEMO_ROWS);
  });

  it('01-PRD §3.3 · le bureau consulte le registre sans pouvoir enregistrer de CGA', async () => {
    await openRegistry('bureau');

    await expectRows(DEMO_ROWS);
    expect(screen.queryByRole('button', { name: fr.registry.create })).not.toBeInTheDocument();
  });

  it('le gestionnaire du CNCGA enregistre aussi des CGA (01-PRD §3.3)', async () => {
    await openRegistry('gestionnaire');

    expect(await screen.findByRole('button', { name: fr.registry.create })).toBeVisible();
  });

  it('03-APPFLOW §7 · un refus 403 de l’API affiche l’écran commun, sans toast', async () => {
    server = installApiServer();
    server.signIn('0700000001', demoIds.president);
    server.failNext('GET', apiUrl('/network/organizations'), {
      status: 403,
      data: { message: 'Vous n’avez pas le droit de faire cette action.', code: 'forbidden' },
    });

    const session = await httpAuthApi.currentSession();
    renderApp({ api: httpAuthApi, session, entry: organizationRoutes.list });

    expect(
      await screen.findByRole('heading', { level: 1, name: fr.errorScreens.forbiddenTitle }),
    ).toBeVisible();
    expect(screen.queryByText(fr.errors.http.forbidden)).not.toBeInTheDocument();
  });
});

describe('Modale « Nouveau CGA » (F-ORG-02)', () => {
  const labels = fr.organization;
  const field = fieldByLabel;
  const newId = `01cga9${String(4).padStart(20, '0')}`;

  async function openCreation() {
    const user = userEvent.setup();
    const view = await openRegistry();
    await expectRows(DEMO_ROWS);

    await user.click(screen.getByRole('button', { name: fr.registry.create }));

    return { user, ...view, dialog: screen.getByRole('dialog', { name: labels.create.title }) };
  }

  async function fillMinimum(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
    await user.type(field(dialog, labels.fields.name), 'CGA du Nord');
    await user.type(field(dialog, labels.fields.city), 'Korhogo');
    await user.type(field(dialog, labels.fields.phone), '0700000020');
  }

  it('dénomination, ville et téléphone obligatoires ; focus sur le premier champ en erreur', async () => {
    const { user, dialog } = await openCreation();

    await user.click(within(dialog).getByRole('button', { name: labels.create.submit }));

    expect(within(dialog).getByText(labels.errors.nameRequired)).toBeInTheDocument();
    expect(within(dialog).getByText(labels.errors.cityRequired)).toBeInTheDocument();
    expect(within(dialog).getByText(labels.errors.phoneRequired)).toBeInTheDocument();
    expect(field(dialog, labels.fields.name)).toHaveFocus();
    expect(server.requests.some((request) => request.method === 'POST')).toBe(false);
  });

  it('RG-ORG-03 · « Agréé » demande le n° et la date d’agrément', async () => {
    const { user, dialog } = await openCreation();

    expect(within(dialog).queryByText(labels.fields.agreementNumber)).toBeNull();

    await fillMinimum(user, dialog);
    await user.click(within(dialog).getByRole('radio', { name: labels.agreement.granted }));
    await user.click(within(dialog).getByRole('button', { name: labels.create.submit }));

    expect(within(dialog).getByText(labels.errors.agreementNumberRequired)).toBeInTheDocument();
    expect(within(dialog).getByText(labels.errors.agreementDateRequired)).toBeInTheDocument();
  });

  it('Enregistrer → toast « CGA enregistré » → fiche du CGA, agrément en cours', async () => {
    const { user, dialog, router } = await openCreation();

    await fillMinimum(user, dialog);
    await user.type(field(dialog, labels.fields.sigle), 'NORD');
    await user.click(within(dialog).getByRole('button', { name: labels.create.submit }));

    expect(await screen.findByText(labels.create.done)).toBeInTheDocument();
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(organizationRoutes.detail(newId));
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'CGA du Nord' })).toBeVisible();
    expect(screen.getByText(labels.banners.pending)).toBeInTheDocument();
    expect(server.requests.find((request) => request.method === 'POST')?.body).toEqual({
      name: 'CGA du Nord',
      sigle: 'NORD',
      city: 'Korhogo',
      phone_1: '0700000020',
      email: null,
      agreement_status: 'pending',
      agreement_number: null,
      agreement_date: null,
    });
  });

  it('agréé : n° et date envoyés, statut d’agrément « agréé »', async () => {
    const { user, dialog } = await openCreation();

    await fillMinimum(user, dialog);
    await user.click(within(dialog).getByRole('radio', { name: labels.agreement.granted }));
    await user.type(field(dialog, labels.fields.agreementNumber), 'AGR-DEMO-777');
    await user.type(field(dialog, labels.fields.agreementDate), '2026-01-10');
    await user.click(within(dialog).getByRole('button', { name: labels.create.submit }));

    // Création, navigation puis lecture de la fiche : plus d'une seconde quand toute la suite
    // tourne en parallèle ; assertion inchangée.
    expect(
      await screen.findByRole('heading', { level: 1, name: 'CGA du Nord' }, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(server.cgas().at(-1)).toMatchObject({
      agreement_status: 'granted',
      agreement_number: 'AGR-DEMO-777',
      agreement_date: '2026-01-10',
    });
  });

  it('03-APPFLOW §7 · refus 422 : message de l’API sous le champ, saisie conservée', async () => {
    const { user, dialog } = await openCreation();

    await user.type(field(dialog, labels.fields.name), 'CGA du Nord');
    await user.type(field(dialog, labels.fields.city), 'Korhogo');
    await user.type(field(dialog, labels.fields.phone), '12');
    await user.click(within(dialog).getByRole('button', { name: labels.create.submit }));

    expect(
      await within(dialog).findByText('Le numéro de téléphone n’est pas valide.'),
    ).toBeInTheDocument();
    expect(field(dialog, labels.fields.phone)).toHaveFocus();
    expect(field(dialog, labels.fields.name)).toHaveValue('CGA du Nord');
  });

  it('« Ouvrir l’accès maintenant » : prénom, nom et téléphone du gérant obligatoires', async () => {
    const { user, dialog } = await openCreation();

    await fillMinimum(user, dialog);
    await user.click(within(dialog).getByRole('checkbox', { name: labels.create.openAccess }));
    await user.click(within(dialog).getByRole('button', { name: labels.create.submit }));

    expect(within(dialog).getByText(labels.errors.firstNameRequired)).toBeInTheDocument();
    expect(within(dialog).getByText(labels.errors.lastNameRequired)).toBeInTheDocument();
    expect(within(dialog).getAllByText(labels.errors.phoneRequired)).toHaveLength(1);
  });

  it('P1 · enregistrer le CGA et inviter le gérant : deux toasts, puis la fiche', async () => {
    const { user, dialog, router } = await openCreation();

    await fillMinimum(user, dialog);
    await user.click(within(dialog).getByRole('checkbox', { name: labels.create.openAccess }));
    await user.type(field(dialog, labels.create.managerFirstName), 'Awa');
    await user.type(field(dialog, labels.create.managerLastName), 'Koné');
    await user.type(field(dialog, labels.create.managerPhone), '0700000030');
    await user.click(within(dialog).getByRole('button', { name: labels.create.submit }));

    expect(await screen.findByText(labels.create.done)).toBeInTheDocument();
    expect(await screen.findByText(labels.create.invited)).toBeInTheDocument();
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(organizationRoutes.detail(newId));
    });
    expect(
      server.requests.find((request) => request.url.endsWith(`/${newId}/manager`))?.body,
    ).toEqual({ first_name: 'Awa', last_name: 'Koné', phone: '0700000030' });
    expect(server.cgas().at(-1)?.manager).toMatchObject({ name: 'Awa Koné', status: 'invited' });
  });

  it('invitation refusée : le CGA est enregistré, le toast dit pourquoi l’invitation n’est pas partie', async () => {
    const { user, dialog, router } = await openCreation();

    await fillMinimum(user, dialog);
    await user.click(within(dialog).getByRole('checkbox', { name: labels.create.openAccess }));
    await user.type(field(dialog, labels.create.managerFirstName), 'Awa');
    await user.type(field(dialog, labels.create.managerLastName), 'Koné');
    await user.type(field(dialog, labels.create.managerPhone), '12');
    await user.click(within(dialog).getByRole('button', { name: labels.create.submit }));

    expect(await screen.findByText(labels.create.inviteFailed)).toBeInTheDocument();
    expect(screen.getByText('Le numéro de téléphone n’est pas valide.')).toBeInTheDocument();
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(organizationRoutes.detail(newId));
    });
    expect(server.cgas().at(-1)?.manager).toBeNull();
  });

  it('409 à l’enregistrement : le message de l’API dans la modale', async () => {
    const { user, dialog } = await openCreation();

    server.failNext('POST', apiUrl('/network/organizations'), {
      status: 409,
      data: { message: 'Ce CGA existe déjà.', code: 'duplicate' },
    });
    await fillMinimum(user, dialog);
    await user.click(within(dialog).getByRole('button', { name: labels.create.submit }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Ce CGA existe déjà.');
  });

  it('« Annuler » ferme la modale sans rien enregistrer', async () => {
    const { user, dialog } = await openCreation();

    await user.type(field(dialog, labels.fields.name), 'CGA du Nord');
    await user.click(within(dialog).getByRole('button', { name: fr.common.cancel }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(server.cgas()).toHaveLength(3);
  });
});
