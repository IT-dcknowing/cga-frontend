import { describe, expect, it } from 'vitest';
import {
  createFakeOrganizationsApi,
  demoRegionalDirectorates,
} from '@/features/organizations/api/fake-organizations-api';
import type { OrganizationFilters } from '@/features/organizations/api/organizations-api';
import { ApiBusinessError, httpStatusOf } from '@/lib/api-errors';

const noFilter: OrganizationFilters = {
  search: '',
  status: null,
  subscriptionStatus: null,
  regionalDirectorateId: null,
  sort: null,
  page: 1,
};

const dck = '01cga000000000000000000001';
const lagunes = '01cga000000000000000000002';
const centre = '01cga000000000000000000003';

async function failureOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }

  throw new Error('L’appel aurait dû échouer.');
}

describe('Bouchon du registre des CGA (VITE_API_STUB)', () => {
  it('liste les CGA de démonstration par ordre alphabétique, ou selon le tri demandé', async () => {
    const api = createFakeOrganizationsApi();

    expect((await api.list(noFilter)).items.map((cga) => cga.name)).toEqual([
      'CGA des Lagunes',
      'CGA du Centre',
      'DC-KNOWING CGA',
    ]);
    expect((await api.list({ ...noFilter, sort: '-city' })).items[0].city).toBe('Bouaké');
  });

  it('filtre par recherche, statut, abonnement et direction régionale', async () => {
    const api = createFakeOrganizationsApi();
    const ids = async (filters: Partial<OrganizationFilters>) =>
      (await api.list({ ...noFilter, ...filters })).items.map((cga) => cga.id);

    expect(await ids({ search: 'bouaké' })).toEqual([centre]);
    expect(await ids({ search: 'agr-demo-0001' })).toEqual([dck]);
    expect(await ids({ status: 'suspended' })).toEqual([centre]);
    expect(await ids({ subscriptionStatus: 'active' })).toEqual([dck]);
    expect(await ids({ regionalDirectorateId: demoRegionalDirectorates[1].id })).toEqual([centre]);
  });

  it('RG-ORG-03 · crée un CGA avec son statut d’agrément, puis le modifie', async () => {
    const api = createFakeOrganizationsApi();
    const created = await api.create({
      name: 'CGA du Nord',
      sigle: null,
      city: 'Korhogo',
      phone_1: '+2250700000040',
      email: null,
      agreement_status: 'granted',
      agreement_number: 'AGR-DEMO-9',
      agreement_date: '2026-01-10',
    });

    expect(created).toMatchObject({ agreement_status: 'granted', status: 'active' });
    expect((await api.get(created.id)).name).toBe('CGA du Nord');

    const updated = await api.update(created.id, {
      ...created,
      agreement_status: 'pending',
      agreement_number: null,
      agreement_date: null,
    });

    expect(updated.agreement_status_label).toBe('Agrément en cours');
  });

  it('F-ORG-02 · invite le gérant une fois ; 409 si le CGA en a déjà un', async () => {
    const api = createFakeOrganizationsApi();
    const invited = await api.inviteManager(lagunes, {
      first_name: 'Awa',
      last_name: 'Koné',
      phone: '+2250700000030',
    });

    expect(invited.manager).toMatchObject({ name: 'Awa Koné', status: 'invited' });
    expect(
      await failureOf(api.inviteManager(lagunes, { first_name: 'A', last_name: 'B', phone: '1' })),
    ).toMatchObject({ code: 'cga_manager_exists' });
  });

  it('F-ORG-05 · change l’abonnement et trace l’événement ; 409 si l’état ne change pas', async () => {
    const api = createFakeOrganizationsApi();
    const changed = await api.changeSubscription(lagunes, { status: 'trial', reason: null });

    expect(changed.subscription).toMatchObject({ status: 'trial', status_label: 'Essai' });
    expect(changed.status_events?.[0].event).toBe('subscription_changed');
    expect(
      await failureOf(api.changeSubscription(lagunes, { status: 'trial', reason: null })),
    ).toBeInstanceOf(ApiBusinessError);
  });

  it('F-ORG-06 · suspend avec motif, refuse une double suspension (409), puis réactive', async () => {
    const api = createFakeOrganizationsApi();

    expect(await api.suspend(dck, 'Démonstration')).toMatchObject({
      status: 'suspended',
      suspension_reason: 'Démonstration',
    });
    expect(await failureOf(api.suspend(dck, 'Encore'))).toMatchObject({
      code: 'organization_already_suspended',
    });
    expect(await api.reactivate(dck, 'Levée')).toMatchObject({ status: 'active' });
    expect(await failureOf(api.reactivate(dck, 'Encore'))).toMatchObject({
      code: 'organization_not_suspended',
    });
  });

  it('F-ORG-07 · retire l’agrément : CGA suspendu, aucun second retrait', async () => {
    const api = createFakeOrganizationsApi();
    const withdrawn = await api.withdrawAgreement(dck, {
      withdrawn_at: '2026-10-20',
      reason: 'Manquement',
    });

    expect(withdrawn).toMatchObject({
      agreement_status: 'withdrawn',
      agreement_withdrawn_at: '2026-10-20',
      status: 'suspended',
      suspension_reason: 'Manquement',
    });
    expect(
      await failureOf(api.withdrawAgreement(dck, { withdrawn_at: '2026-10-21', reason: 'M' })),
    ).toMatchObject({ code: 'agreement_already_withdrawn' });
    // Un CGA déjà suspendu garde la date et le motif de sa suspension.
    expect(
      (await api.withdrawAgreement(centre, { withdrawn_at: '2026-10-20', reason: 'M' }))
        .suspension_reason,
    ).toBe('Démonstration : rapports trimestriels non transmis.');
  });

  it('CGA inconnu : 404, comme l’API ; les DR de démonstration', async () => {
    const api = createFakeOrganizationsApi();

    expect(httpStatusOf(await failureOf(api.get('inconnu')))).toBe(404);
    expect(await api.regionalDirectorates()).toEqual(demoRegionalDirectorates);
  });
});
