import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  httpOrganizationsApi,
  type OrganizationFilters,
  type OrganizationInput,
} from '@/features/organizations/api/organizations-api';
import { ApiBusinessError, ApiValidationError, httpStatusOf } from '@/lib/api-errors';
import { config } from '@/lib/config';
import { apiUrl, demoIds, installApiServer } from '@/test/api-server';

/*
 * Appels du registre des CGA vers `network/organizations`, par le vrai client `http` : seules les
 * réponses du backend sont simulées (`installApiServer`, d'après `OrganizationController`).
 */
let server: ReturnType<typeof installApiServer>;

const noFilter: OrganizationFilters = {
  search: '',
  status: null,
  subscriptionStatus: null,
  regionalDirectorateId: null,
  sort: null,
  page: 1,
};

const input: OrganizationInput = {
  name: 'CGA du Nord',
  sigle: 'NORD',
  city: 'Korhogo',
  phone_1: '0700000020',
  email: null,
  agreement_status: 'pending',
  agreement_number: null,
  agreement_date: null,
};

beforeEach(() => {
  server = installApiServer();
  server.signIn('0700000001', demoIds.president);
});

afterEach(() => {
  server.restore();
});

function lastRequest() {
  return server.requests[server.requests.length - 1];
}

async function failureOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }

  throw new Error('L’appel aurait dû échouer.');
}

describe('httpOrganizationsApi.list (F-ORG-01, 02-TRD §4.3)', () => {
  it('GET /network/organizations avec la page et la taille de page de config', async () => {
    const page = await httpOrganizationsApi.list(noFilter);

    expect(lastRequest().url).toBe(
      apiUrl(`/network/organizations?page=1&per_page=${String(config.pageSize)}`),
    );
    expect(page.items.map((cga) => cga.name)).toEqual([
      'CGA Démo Bouaké',
      'CGA Démo Suspendu',
      'DC-KNOWING CGA',
    ]);
    expect(page).toMatchObject({ total: 3, page: 1, perPage: config.pageSize });
  });

  it('envoie recherche, filtres et tri sous la forme filter[…] et sort (liste blanche du serveur)', async () => {
    await httpOrganizationsApi.list({
      search: 'démo',
      status: 'suspended',
      subscriptionStatus: 'none',
      regionalDirectorateId: '01dr0000000000000000000001',
      sort: '-city',
      page: 2,
    });

    expect(Object.fromEntries(new URL(lastRequest().url).searchParams)).toEqual({
      'filter[search]': 'démo',
      'filter[status]': 'suspended',
      'filter[subscription_status]': 'none',
      'filter[regional_directorate_id]': '01dr0000000000000000000001',
      sort: '-city',
      page: '2',
      per_page: String(config.pageSize),
    });
  });

  it('RG-SEC-02 · un gérant de CGA n’a pas le droit organizations.view : le serveur refuse (403)', async () => {
    server.signIn('0700000002', demoIds.manager);

    expect(httpStatusOf(await failureOf(httpOrganizationsApi.list(noFilter)))).toBe(403);
  });
});

describe('httpOrganizationsApi : fiche, création, modification (F-ORG-02, F-ORG-04)', () => {
  it('GET /network/organizations/{id}, avec le bloc can de la Présidente', async () => {
    const cga = await httpOrganizationsApi.get(demoIds.dck);

    expect(lastRequest().url).toBe(apiUrl(`/network/organizations/${demoIds.dck}`));
    expect(cga.can).toEqual({
      update: true,
      change_subscription: true,
      suspend: true,
      invite_manager: true,
    });
  });

  it('RG-ROLE-04 · le gestionnaire du CNCGA ne peut pas suspendre : can.suspend est faux', async () => {
    server.signIn('0700000003', demoIds.multiCncga);

    expect((await httpOrganizationsApi.get(demoIds.dck)).can.suspend).toBe(false);
  });

  it('un identifiant est encodé dans l’adresse', async () => {
    const error = await failureOf(httpOrganizationsApi.get('01cga/suspend'));

    expect(lastRequest().url).toBe(apiUrl('/network/organizations/01cga%2Fsuspend'));
    expect(httpStatusOf(error)).toBe(404);
  });

  it('POST /network/organizations : RG-ORG-03, un CGA sans agrément est créé « en cours »', async () => {
    const created = await httpOrganizationsApi.create(input);

    expect(lastRequest()).toMatchObject({ method: 'POST', body: input });
    expect(created).toMatchObject({
      name: 'CGA du Nord',
      agreement_status: 'pending',
      phone_1: '+2250700000020',
    });
  });

  it('422 → ApiValidationError, message par champ', async () => {
    const error = await failureOf(
      httpOrganizationsApi.create({ ...input, phone_1: '12', agreement_status: 'granted' }),
    );

    expect(error).toBeInstanceOf(ApiValidationError);
    expect(Object.keys((error as ApiValidationError).fields)).toEqual([
      'phone_1',
      'agreement_number',
      'agreement_date',
    ]);
  });

  it('PUT /network/organizations/{id} : la fiche complète du registre', async () => {
    const updated = await httpOrganizationsApi.update(demoIds.bouake, {
      ...input,
      name: 'CGA Démo Bouaké',
      agreement_status: 'granted',
      agreement_number: 'AGR-DEMO-002',
      agreement_date: '2026-01-10',
    });

    expect(lastRequest()).toMatchObject({
      method: 'PUT',
      url: apiUrl(`/network/organizations/${demoIds.bouake}`),
    });
    expect(updated.agreement_status).toBe('granted');
  });
});

describe('httpOrganizationsApi : gérant, abonnement, suspension, retrait (F-ORG-02, 05 à 07)', () => {
  it('POST …/manager : prénom, nom et téléphone du gérant ; 409 si le CGA en a déjà un', async () => {
    const invited = await httpOrganizationsApi.inviteManager(demoIds.bouake, {
      first_name: 'Awa',
      last_name: 'Koné',
      phone: '0700000030',
    });

    expect(lastRequest()).toMatchObject({
      url: apiUrl(`/network/organizations/${demoIds.bouake}/manager`),
      body: { first_name: 'Awa', last_name: 'Koné', phone: '0700000030' },
    });
    expect(invited.manager).toMatchObject({ name: 'Awa Koné', status: 'invited' });

    expect(
      await failureOf(
        httpOrganizationsApi.inviteManager(demoIds.dck, {
          first_name: 'A',
          last_name: 'B',
          phone: '0700000031',
        }),
      ),
    ).toMatchObject({ code: 'cga_manager_exists' });
  });

  it('POST …/subscription : état et motif ; 409 si l’état ne change pas', async () => {
    const changed = await httpOrganizationsApi.changeSubscription(demoIds.bouake, {
      status: 'trial',
      reason: null,
    });

    expect(lastRequest().body).toEqual({ status: 'trial', reason: null });
    expect(changed.subscription.status).toBe('trial');
    expect(
      await failureOf(
        httpOrganizationsApi.changeSubscription(demoIds.bouake, { status: 'trial', reason: null }),
      ),
    ).toMatchObject({ code: 'subscription_unchanged' });
  });

  it('POST …/suspend puis …/reactivate, avec leur motif', async () => {
    const suspended = await httpOrganizationsApi.suspend(demoIds.dck, 'Rapports non transmis');

    expect(lastRequest().body).toEqual({ reason: 'Rapports non transmis' });
    expect(suspended).toMatchObject({
      status: 'suspended',
      suspension_reason: 'Rapports non transmis',
    });

    const error = await failureOf(httpOrganizationsApi.suspend(demoIds.dck, 'Encore'));

    expect(error).toBeInstanceOf(ApiBusinessError);
    expect(error).toMatchObject({
      code: 'organization_already_suspended',
      message: 'Ce CGA est déjà suspendu.',
    });

    const reactivated = await httpOrganizationsApi.reactivate(demoIds.dck, 'Rapports reçus');

    expect(lastRequest().url).toBe(apiUrl(`/network/organizations/${demoIds.dck}/reactivate`));
    expect(reactivated.status).toBe('active');
  });

  it('F-ORG-07 · POST …/withdraw-agreement : date et motif ; le CGA est suspendu', async () => {
    const withdrawn = await httpOrganizationsApi.withdrawAgreement(demoIds.dck, {
      withdrawn_at: '2026-10-20',
      reason: 'Manquement réglementaire',
    });

    expect(lastRequest().body).toEqual({
      withdrawn_at: '2026-10-20',
      reason: 'Manquement réglementaire',
    });
    expect(withdrawn).toMatchObject({
      agreement_status: 'withdrawn',
      agreement_withdrawn_at: '2026-10-20',
      status: 'suspended',
    });
  });

  it('RG-ROLE-04 · le gestionnaire du CNCGA ne suspend pas : 403', async () => {
    server.signIn('0700000003', demoIds.multiCncga);

    expect(httpStatusOf(await failureOf(httpOrganizationsApi.suspend(demoIds.dck, 'M')))).toBe(403);
  });

  it('GET /referentials/regional-directorates : DR actives, triées, en une page', async () => {
    const regions = await httpOrganizationsApi.regionalDirectorates();

    expect(Object.fromEntries(new URL(lastRequest().url).searchParams)).toEqual({
      'filter[active]': '1',
      sort: 'name',
      per_page: String(config.pageSizeMax),
    });
    expect(regions.map((region) => region.code)).toEqual(['DEMO-ABJ', 'DEMO-BKE']);
  });
});
