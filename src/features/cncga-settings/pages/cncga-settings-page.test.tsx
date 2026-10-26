import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { httpAuthApi } from '@/features/auth/api/auth-api';
import { cncgaSettingsRoutes } from '@/features/cncga-settings/lib/routes';
import { fr } from '@/lib/i18n/fr';
import { apiUrl, demoIds, installApiServer } from '@/test/api-server';
import { createReferentialsBackend } from '@/test/api-referentials';
import { fieldByLabel } from '@/test/fields';
import { renderApp } from '@/test/render-app';

/*
 * `/cncga/parametres` (étape 1.7, 03-APPFLOW §3.2) : onglets selon les droits, Utilisateurs CNCGA,
 * Secteurs (ajout, fusion d'une proposition), DR / CDI / communes (ajout, modification, fusion,
 * suppression refusée d'une valeur utilisée), Références nationales, Jours fériés. Vrai client
 * `http`, backend simulé (`api-referentials.ts`, `api-cga.ts`).
 */
const labels = fr.referentials;
const tabs = fr.cncgaSettings.tabs;

let server: ReturnType<typeof installApiServer>;
let referentials: ReturnType<typeof createReferentialsBackend>;

afterEach(() => {
  server.restore();
});

const accesses = {
  presidente: ['0700000001', demoIds.president],
  gestionnaire: ['0700000003', demoIds.multiCncga],
} as const;

async function open(tab: string, who: keyof typeof accesses = 'presidente') {
  referentials = createReferentialsBackend();
  server = installApiServer({ referentials });

  const [phone, membershipId] = accesses[who];

  server.signIn(phone, membershipId);

  const session = await httpAuthApi.currentSession();
  const user = userEvent.setup({ delay: null });
  const view = renderApp({
    api: httpAuthApi,
    session,
    entry: `${cncgaSettingsRoutes.root}?onglet=${tab}`,
  });

  return { user, ...view };
}

type User = ReturnType<typeof userEvent.setup>;

/** Liste d'un référentiel ; `findByText` attend aussi qu'elle soit chargée. */
function list(title: string) {
  const current = () => within(screen.getByRole('list', { name: title }));

  return {
    findByText: (text: string | RegExp) => waitFor(() => current().getByText(text)),
    getByText: (text: string) => current().getByText(text),
    queryByText: (text: string) => current().queryByText(text),
  };
}

async function rowAction(user: User, name: string, action: string) {
  await user.click(screen.getByRole('button', { name: labels.rowActions(name) }));
  await user.click(screen.getByRole('menuitem', { name: action }));
}

function card(title: string): HTMLElement {
  return screen.getByRole('heading', { name: title }).closest('[data-slot="card"]') as HTMLElement;
}

function writes(suffix: string) {
  return server.requests.filter(
    (request) => request.method !== 'GET' && new URL(request.url).pathname.endsWith(suffix),
  );
}

function bodyOf(suffix: string): unknown {
  return writes(suffix).at(-1)?.body;
}

const JOURNEY = { timeout: 15_000 };

describe('/cncga/parametres · onglets et utilisateurs (1.7)', JOURNEY, () => {
  it('onglets selon les droits : la Présidente les voit tous ; le gestionnaire, sans les utilisateurs', async () => {
    const president = await open('reseau');

    expect(await screen.findByRole('heading', { level: 1, name: fr.nav.settings })).toBeVisible();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(Object.values(tabs));
    expect(screen.getByText(fr.common.comingSoon)).toBeVisible();
    president.unmount();
    server.restore();

    await open('utilisateurs', 'gestionnaire');
    expect(await screen.findByRole('tab', { name: tabs.secteurs })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.queryByRole('tab', { name: tabs.utilisateurs })).toBeNull();
  });

  it('F-ORG-10 · Utilisateurs CNCGA : la liste, puis une invitation avec un profil du réseau', async () => {
    const { user } = await open('utilisateurs');
    const users = fr.cgaSettings.users;

    expect(await list(users.caption).findByText('Yao Multi-rôles')).toBeVisible();
    await user.click(screen.getByRole('button', { name: users.invite }));

    const dialog = screen.getByRole('dialog', { name: users.inviteDialog.title });

    expect(within(dialog).queryByRole('checkbox', { name: 'Comptable' })).toBeNull();
    await user.type(fieldByLabel(dialog, users.inviteDialog.firstName), 'Marie');
    await user.type(fieldByLabel(dialog, users.inviteDialog.lastName), 'Cotisations');
    await user.type(fieldByLabel(dialog, users.inviteDialog.phone), '+2250700000030');
    await user.click(within(dialog).getByRole('checkbox', { name: fr.roles.cncga_dues }));
    await user.click(within(dialog).getByRole('button', { name: users.inviteDialog.submit }));

    expect(await screen.findByText(users.inviteDialog.done)).toBeInTheDocument();
    expect(bodyOf('/network/users')).toMatchObject({ roles: ['cncga_dues'] });
  });
});

describe('/cncga/parametres · Secteurs (RG-REF-01, RG-DATA-05)', JOURNEY, () => {
  it('RG-REF-01 · liste : statut et badge « Provisoire » ; ajout d’un secteur (champs exigés, code déjà pris)', async () => {
    const { user } = await open('secteurs');
    const title = labels.sectors.title;

    expect(await list(title).findByText('Boutique de quartier')).toBeVisible();
    expect(list(title).getByText(fr.status.sector.proposed)).toBeVisible();
    expect(list(title).getByText(fr.status.dataStatus.provisional)).toBeVisible();

    await user.click(within(card(title)).getByRole('button', { name: labels.add }));

    const dialog = screen.getByRole('dialog', { name: labels.createTitle(labels.sectors.noun) });

    await user.click(within(dialog).getByRole('button', { name: labels.submit }));
    expect(await within(dialog).findAllByText(fr.members.create.errors.required)).toHaveLength(2);
    expect(writes('/referentials/sectors')).toHaveLength(0);

    await user.type(fieldByLabel(dialog, labels.sectors.code), 'COM');
    await user.type(fieldByLabel(dialog, labels.sectors.name), 'Petit commerce');
    await user.click(within(dialog).getByRole('button', { name: labels.submit }));
    expect(await within(dialog).findByText('Cette valeur existe déjà.')).toBeVisible();

    await user.clear(fieldByLabel(dialog, labels.sectors.code));
    await user.type(fieldByLabel(dialog, labels.sectors.code), 'BTQ2');
    await user.click(within(dialog).getByRole('button', { name: labels.submit }));

    expect(await screen.findByText(labels.created)).toBeInTheDocument();
    expect(bodyOf('/referentials/sectors')).toEqual({ code: 'BTQ2', name: 'Petit commerce' });
    expect(await list(title).findByText('Petit commerce')).toBeVisible();
  });

  it('RG-DATA-05 · une proposition se fusionne dans un secteur validé ; suppression refusée (409) d’un secteur utilisé', async () => {
    const { user } = await open('secteurs');
    const title = labels.sectors.title;

    await list(title).findByText('Boutique de quartier');
    await rowAction(user, 'Boutique de quartier', labels.merge.action);

    const dialog = screen.getByRole('dialog', { name: labels.merge.title });
    const target = fieldByLabel(dialog, labels.merge.target);

    await waitFor(() => {
      expect(within(target).getAllByRole('option')).toHaveLength(2);
    });
    await user.click(within(dialog).getByRole('button', { name: labels.merge.submit }));
    expect(await within(dialog).findByText(fr.members.create.errors.required)).toBeVisible();

    await user.selectOptions(target, '01sec000000000000000000001');
    await user.click(within(dialog).getByRole('button', { name: labels.merge.submit }));

    expect(await screen.findByText(labels.merge.done)).toBeInTheDocument();
    expect(bodyOf('/merge')).toEqual({ into_id: '01sec000000000000000000001' });
    expect(await list(title).findByText(fr.status.sector.merged)).toBeVisible();

    // Un secteur fusionné ne se fusionne plus.
    await user.click(
      screen.getByRole('button', { name: labels.rowActions('Boutique de quartier') }),
    );
    expect(screen.queryByRole('menuitem', { name: labels.merge.action })).toBeNull();
    await user.keyboard('{Escape}');

    // « Commerce » est utilisé : le serveur refuse la suppression, sans bouton ici (`can.delete`).
    await user.click(screen.getByRole('button', { name: labels.rowActions('Commerce') }));
    expect(screen.queryByRole('menuitem', { name: labels.remove.action })).toBeNull();
  });
});

describe('/cncga/parametres · DR, CDI et communes (F-REF-01, 02)', JOURNEY, () => {
  it('modifier une DR (désactivée) ; ajouter un CDI rattaché à une DR ; fusion d’un CDI dans un CDI de sa DR', async () => {
    const { user } = await open('territoire');
    const dr = labels.directorates;
    const cdi = labels.taxOffices;

    await list(dr.title).findByText('DR Bouaké (démonstration)');
    await rowAction(user, 'DR Bouaké (démonstration)', labels.edit);

    const edit = screen.getByRole('dialog', { name: labels.editTitle(dr.noun) });

    expect(fieldByLabel(edit, dr.code)).toHaveValue('DEMO-BKE');
    await user.click(within(edit).getByRole('checkbox', { name: dr.active }));
    await user.click(within(edit).getByRole('button', { name: labels.submit }));
    expect(await screen.findByText(labels.saved)).toBeInTheDocument();
    expect(bodyOf('/regional-directorates/01dr0000000000000000000002')).toEqual({
      code: 'DEMO-BKE',
      name: 'DR Bouaké (démonstration)',
      geo_key: null,
      active: false,
    });
    expect(await list(dr.title).findByText(/Inactive/)).toBeVisible();

    await user.click(within(card(cdi.title)).getByRole('button', { name: labels.add }));

    const create = screen.getByRole('dialog', { name: labels.createTitle(cdi.noun) });

    await user.type(fieldByLabel(create, cdi.code), 'CDI-YOP');
    await user.type(fieldByLabel(create, cdi.name), 'CDI Yopougon');
    await user.click(within(create).getByRole('button', { name: labels.submit }));
    expect(await within(create).findByText(fr.members.create.errors.required)).toBeVisible();
    await waitFor(() => {
      expect(
        within(fieldByLabel(create, cdi.directorate)).getAllByRole('option').length,
      ).toBeGreaterThan(1);
    });
    await user.selectOptions(fieldByLabel(create, cdi.directorate), '01dr0000000000000000000001');
    await user.click(within(create).getByRole('button', { name: labels.submit }));
    expect(await list(cdi.title).findByText('CDI Yopougon')).toBeVisible();

    await rowAction(user, 'CDI Cocody (démonstration)', labels.merge.action);

    const merge = screen.getByRole('dialog', { name: labels.merge.title });
    const target = fieldByLabel(merge, labels.merge.target);

    await waitFor(() => {
      expect(
        within(target).getByRole('option', { name: 'CDI Plateau (démonstration)' }),
      ).toBeInTheDocument();
    });
    await user.type(fieldByLabel(merge, labels.merge.search), 'Plateau');
    await user.selectOptions(target, '01cdi000000000000000000001');
    await user.click(within(merge).getByRole('button', { name: labels.merge.submit }));
    expect(await screen.findByText(labels.merge.done)).toBeInTheDocument();
    await waitFor(() => {
      expect(list(cdi.title).queryByText('CDI Cocody (démonstration)')).toBeNull();
    });
  });

  it('suppression : confirmation, puis refus (409) d’une valeur utilisée ; ajout d’une commune ; panne et « Réessayer »', async () => {
    const { user } = await open('territoire');
    const communes = labels.communes;

    await list(communes.title).findByText('Cocody (démonstration)');
    server.failNext('DELETE', apiUrl('/referentials/communes/01com000000000000000000001'), {
      status: 409,
      data: {
        message: 'Cette valeur est déjà utilisée.',
        code: 'referential_in_use',
        details: {},
      },
    });
    await rowAction(user, 'Cocody (démonstration)', labels.remove.action);

    const dialog = screen.getByRole('dialog', { name: labels.remove.title });

    expect(within(dialog).getByText(labels.remove.effects[0])).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: labels.remove.submit }));
    expect(await within(dialog).findByText('Cette valeur est déjà utilisée.')).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: labels.remove.submit }));
    expect(await screen.findByText(labels.remove.done)).toBeInTheDocument();

    await user.click(within(card(communes.title)).getByRole('button', { name: labels.add }));

    const create = screen.getByRole('dialog', { name: labels.createTitle(communes.noun) });

    await user.type(fieldByLabel(create, communes.name), 'Abobo');
    await user.click(within(create).getByRole('button', { name: labels.submit }));
    expect(await list(communes.title).findByText('Abobo')).toBeVisible();
    expect(bodyOf('/referentials/communes')).toEqual({
      name: 'Abobo',
      regional_directorate_id: null,
    });

    for (let attempt = 0; attempt < 2; attempt++) {
      server.failNext('GET', apiUrl('/referentials/communes'), {
        status: 500,
        data: { message: 'Erreur.' },
      });
    }
    await user.type(screen.getByLabelText(labels.search(communes.title)), 'Abo');
    expect(await screen.findByText(labels.loadError, {}, { timeout: 4000 })).toBeVisible();
    await user.click(screen.getByRole('button', { name: fr.common.retry }));
    expect(await list(communes.title).findByText('Abobo')).toBeVisible();
  });
});

describe(
  '/cncga/parametres · Références nationales et jours fériés (F-REF-03, 04)',
  JOURNEY,
  () => {
    it('références nationales : sans recherche ; année exigée, montants entiers, puis l’année ajoutée', async () => {
      const { user } = await open('references');
      const refs = labels.nationalReferences;

      expect(await list(refs.title).findByText('2025')).toBeVisible();
      expect(screen.queryByLabelText(labels.search(refs.title))).toBeNull();

      await user.click(screen.getByRole('button', { name: labels.add }));

      const dialog = screen.getByRole('dialog', { name: labels.createTitle(refs.noun) });

      await user.type(fieldByLabel(dialog, refs.revenue), '5,2 milliards');
      await user.click(within(dialog).getByRole('button', { name: labels.submit }));
      expect(await within(dialog).findByText(fr.members.create.errors.required)).toBeVisible();
      expect(within(dialog).getByText(labels.integer)).toBeVisible();

      await user.type(fieldByLabel(dialog, refs.year), '2026');
      await user.clear(fieldByLabel(dialog, refs.revenue));
      await user.type(fieldByLabel(dialog, refs.revenue), '5200000000000');
      await user.click(within(dialog).getByRole('button', { name: labels.submit }));

      expect(await list(refs.title).findByText('2026')).toBeVisible();
      expect(bodyOf('/referentials/national-references')).toEqual({
        year: 2026,
        domestic_tax_revenue: 5200000000000,
        nominal_gdp: null,
        tax_revenue_source: null,
        gdp_source: null,
      });
    });

    it('jours fériés : ajout, suppression, pages de la liste', async () => {
      const { user } = await open('feries');
      const holidays = labels.holidays;

      expect(await list(holidays.title).findByText('Noël')).toBeVisible();
      expect(list(holidays.title).getByText('25/12/2026')).toBeVisible();

      await user.click(screen.getByRole('button', { name: labels.add }));

      const dialog = screen.getByRole('dialog', { name: labels.createTitle(holidays.noun) });

      await user.type(fieldByLabel(dialog, holidays.date), '2026-05-01');
      await user.type(fieldByLabel(dialog, holidays.label), 'Fête du travail');
      await user.click(within(dialog).getByRole('button', { name: labels.submit }));
      expect(await list(holidays.title).findByText('Fête du travail')).toBeVisible();

      await rowAction(user, 'Noël', labels.remove.action);
      await user.click(
        within(screen.getByRole('dialog', { name: labels.remove.title })).getByRole('button', {
          name: labels.remove.submit,
        }),
      );
      await waitFor(() => {
        expect(list(holidays.title).queryByText('Noël')).toBeNull();
      });

      // Assez de jours pour deux pages (25 par page).
      for (let day = 1; day <= 30; day++) {
        referentials.rows('holidays').push({
          id: 500 + day,
          date: `2027-01-${String(day).padStart(2, '0')}`,
          label: `Jour ${String(day)}`,
          can: { update: true, delete: true },
        });
      }
      await user.type(screen.getByLabelText(labels.search(holidays.title)), 'Jour');
      expect(await screen.findByText(labels.page('1', '2'))).toBeVisible();
      expect(screen.getByRole('button', { name: labels.previous })).toBeDisabled();
      await user.click(screen.getByRole('button', { name: labels.next }));
      expect(await screen.findByText(labels.page('2', '2'))).toBeVisible();
      await user.click(screen.getByRole('button', { name: labels.previous }));
      expect(await screen.findByText(labels.page('1', '2'))).toBeVisible();
    });
  },
);
