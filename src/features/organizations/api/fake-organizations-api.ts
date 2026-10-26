import { AxiosError, AxiosHeaders } from 'axios';
import { ApiBusinessError } from '@/lib/api-errors';
import { config } from '@/lib/config';
import { fr } from '@/lib/i18n/fr';
import type {
  Organization,
  OrganizationFilters,
  OrganizationInput,
  OrganizationsApi,
  RegionalDirectorate,
} from './organizations-api';

/*
 * Bouchon du registre des CGA (`VITE_API_STUB=true`) : il tient le rôle du backend, en mémoire,
 * avec des CGA et des directions régionales de démonstration (aucune donnée réelle, aucun réseau).
 * Mêmes réponses que `network/organizations` : fiche `OrganizationResource`, refus 409 du backend
 * (`organization_already_suspended`, `cga_manager_exists`…), 404 d'un CGA inconnu.
 */

export const demoRegionalDirectorates: RegionalDirectorate[] = [
  { id: '01dr0000000000000000000001', code: 'DEMO-ABJ', name: 'DR Abidjan (démonstration)' },
  { id: '01dr0000000000000000000002', code: 'DEMO-BKE', name: 'DR Bouaké (démonstration)' },
];

const labels = fr.status;

/** Fiche `OrganizationResource` d'un CGA de démonstration, complétée par `overrides`. */
export function demoOrganization(
  overrides: Partial<Organization> & Pick<Organization, 'id' | 'name' | 'city'>,
): Organization {
  const base: Organization = {
    sigle: null,
    phone_1: '+2252722000000',
    email: null,
    regional_directorate: null,
    agreement_status: 'pending',
    agreement_status_label: labels.agreement.pending,
    agreement_number: null,
    agreement_date: null,
    agreement_withdrawn_at: null,
    status: 'active',
    status_label: labels.organization.active,
    suspended_at: null,
    suspension_reason: null,
    subscription: {
      status: 'none',
      status_label: labels.subscription.none,
      started_at: null,
      trial_ends_at: null,
      ended_at: null,
      data_deletion_due_at: null,
    },
    members_count: 0,
    profile_completed_at: null,
    data_status: 'provisional',
    created_at: '2026-10-01T08:00:00Z',
    manager: null,
    status_events: [],
    can: { update: true, change_subscription: true, suspend: true, invite_manager: true },
    ...overrides,
  };

  return base;
}

function demoOrganizations(): Organization[] {
  const [abidjan, bouake] = demoRegionalDirectorates;

  return [
    demoOrganization({
      id: '01cga000000000000000000001',
      name: 'DC-KNOWING CGA',
      sigle: 'DCK',
      city: 'Abidjan',
      email: 'contact@dc-knowing.demo',
      regional_directorate: abidjan,
      agreement_status: 'granted',
      agreement_status_label: labels.agreement.granted,
      agreement_number: 'AGR-DEMO-0001',
      agreement_date: '2019-03-12',
      subscription: {
        status: 'active',
        status_label: labels.subscription.active,
        started_at: '2026-01-01',
        trial_ends_at: null,
        ended_at: null,
        data_deletion_due_at: null,
      },
      members_count: 143,
      profile_completed_at: '2026-02-01T09:00:00Z',
      manager: {
        id: '01usr00000000000000000001',
        name: 'Koffi Gérant',
        phone: '+2250700000002',
        email: null,
        status: 'active',
        status_label: 'Actif',
      },
    }),
    demoOrganization({
      id: '01cga000000000000000000002',
      name: 'CGA des Lagunes',
      city: 'Abidjan',
    }),
    demoOrganization({
      id: '01cga000000000000000000003',
      name: 'CGA du Centre',
      sigle: 'CGAC',
      city: 'Bouaké',
      regional_directorate: bouake,
      agreement_status: 'granted',
      agreement_status_label: labels.agreement.granted,
      agreement_number: 'AGR-DEMO-0003',
      agreement_date: '2021-06-01',
      status: 'suspended',
      status_label: labels.organization.suspended,
      suspended_at: '2026-09-15T09:00:00Z',
      suspension_reason: 'Démonstration : rapports trimestriels non transmis.',
    }),
  ];
}

function notFound(): AxiosError {
  return new AxiosError(
    'Ressource introuvable.',
    AxiosError.ERR_BAD_REQUEST,
    undefined,
    undefined,
    {
      status: 404,
      statusText: 'Not Found',
      data: { message: 'Ressource introuvable.', code: 'not_found' },
      headers: {},
      config: { headers: new AxiosHeaders() },
    },
  );
}

/** Refus 409 du backend, avec son message (`lang/fr/errors.php`). */
const refusals = {
  organization_already_suspended: 'Ce CGA est déjà suspendu.',
  organization_not_suspended: 'Ce CGA n’est pas suspendu.',
  subscription_unchanged: 'Ce CGA a déjà cet état d’abonnement.',
  agreement_already_withdrawn: 'L’agrément de ce CGA est déjà retiré.',
  cga_manager_exists: 'Ce CGA a déjà un gérant, invité ou actif.',
} as const;

function refuse(code: keyof typeof refusals): never {
  throw new ApiBusinessError(code, {}, refusals[code]);
}

function now(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function matches(organization: Organization, search: string): boolean {
  const needle = search.toLocaleLowerCase('fr');

  return [organization.name, organization.sigle, organization.city, organization.agreement_number]
    .filter((value) => value !== null)
    .some((value) => value.toLocaleLowerCase('fr').includes(needle));
}

function sortWith(sort: OrganizationFilters['sort']) {
  const field = (sort ?? 'name').replace(/^-/, '') as 'name' | 'city' | 'created_at';
  const direction = sort?.startsWith('-') === true ? -1 : 1;

  return (a: Organization, b: Organization) =>
    direction * String(a[field] ?? '').localeCompare(String(b[field] ?? ''), 'fr');
}

function withEvent(organization: Organization, event: string, reason: string): Organization {
  return {
    ...organization,
    status_events: [
      {
        event,
        event_label: event,
        reason,
        actor: { id: '01usr00000000000000000000', name: 'Adjoua Kouamé' },
        occurred_at: now(),
      },
      ...(organization.status_events ?? []),
    ],
  };
}

function registered(organization: Organization, input: OrganizationInput): Organization {
  return {
    ...organization,
    ...input,
    agreement_status_label: labels.agreement[input.agreement_status],
  };
}

export function createFakeOrganizationsApi(): OrganizationsApi {
  let organizations = demoOrganizations();
  let created = 0;

  function find(id: string): Organization {
    const organization = organizations.find((candidate) => candidate.id === id);

    if (organization === undefined) {
      throw notFound();
    }

    return organization;
  }

  function save(organization: Organization): Organization {
    organizations = organizations.map((candidate) =>
      candidate.id === organization.id ? organization : candidate,
    );

    return organization;
  }

  /** Lecture puis écriture, comme une requête : une erreur devient un rejet de la promesse. */
  function change(id: string, apply: (organization: Organization) => Organization) {
    return Promise.resolve().then(() => save(apply(find(id))));
  }

  return {
    list({ search, status, subscriptionStatus, regionalDirectorateId, sort, page }) {
      const selected = organizations
        .filter((organization) => search === '' || matches(organization, search))
        .filter((organization) => status === null || organization.status === status)
        .filter(
          (organization) =>
            subscriptionStatus === null || organization.subscription.status === subscriptionStatus,
        )
        .filter(
          (organization) =>
            regionalDirectorateId === null ||
            organization.regional_directorate?.id === regionalDirectorateId,
        )
        .sort(sortWith(sort));
      const start = (page - 1) * config.pageSize;

      return Promise.resolve({
        items: selected.slice(start, start + config.pageSize),
        total: selected.length,
        page,
        perPage: config.pageSize,
      });
    },

    get(id) {
      return Promise.resolve().then(() => find(id));
    },

    create(input) {
      created += 1;

      const organization = registered(
        demoOrganization({
          id: `01cga9${String(created).padStart(20, '0')}`,
          name: input.name,
          city: input.city,
          created_at: now(),
        }),
        input,
      );

      organizations = [...organizations, organization];

      return Promise.resolve(organization);
    },

    update(id, input) {
      return change(id, (organization) => registered(organization, input));
    },

    inviteManager(id, { first_name: firstName, last_name: lastName, phone }) {
      return change(id, (organization) => {
        if (organization.manager !== null && organization.manager !== undefined) {
          refuse('cga_manager_exists');
        }

        return {
          ...organization,
          manager: {
            id: `01usr9${id.slice(-20)}`,
            name: `${firstName} ${lastName}`,
            phone,
            email: null,
            status: 'invited',
            status_label: 'Invité',
          },
        };
      });
    },

    changeSubscription(id, { status, reason }) {
      return change(id, (organization) => {
        if (organization.subscription.status === status) {
          refuse('subscription_unchanged');
        }

        return withEvent(
          {
            ...organization,
            subscription: {
              ...organization.subscription,
              status,
              status_label: labels.subscription[status],
            },
          },
          'subscription_changed',
          reason ?? '',
        );
      });
    },

    suspend(id, reason) {
      return change(id, (organization) => {
        if (organization.status === 'suspended') {
          refuse('organization_already_suspended');
        }

        return withEvent(
          {
            ...organization,
            status: 'suspended',
            status_label: labels.organization.suspended,
            suspended_at: now(),
            suspension_reason: reason,
          },
          'suspended',
          reason,
        );
      });
    },

    reactivate(id, reason) {
      return change(id, (organization) => {
        if (organization.status !== 'suspended') {
          refuse('organization_not_suspended');
        }

        return withEvent(
          {
            ...organization,
            status: 'active',
            status_label: labels.organization.active,
            suspended_at: null,
            suspension_reason: null,
          },
          'reactivated',
          reason,
        );
      });
    },

    withdrawAgreement(id, { withdrawn_at: withdrawnAt, reason }) {
      return change(id, (organization) => {
        if (organization.agreement_status === 'withdrawn') {
          refuse('agreement_already_withdrawn');
        }

        // F-ORG-07 : le CGA est suspendu ; aucune radiation n'est créée (RG-ADH-18).
        return withEvent(
          {
            ...organization,
            agreement_status: 'withdrawn',
            agreement_status_label: labels.agreement.withdrawn,
            agreement_withdrawn_at: withdrawnAt,
            status: 'suspended',
            status_label: labels.organization.suspended,
            suspended_at: organization.suspended_at ?? now(),
            suspension_reason: organization.suspension_reason ?? reason,
          },
          'agreement_withdrawn',
          reason,
        );
      });
    },

    regionalDirectorates() {
      return Promise.resolve(demoRegionalDirectorates);
    },
  };
}
