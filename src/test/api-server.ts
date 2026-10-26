import {
  AxiosError,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import type { Membership, Session, SessionUser } from '@/features/auth/api/auth-api';
import {
  demoOrganization,
  demoRegionalDirectorates,
} from '@/features/organizations/api/fake-organizations-api';
import type { Organization } from '@/features/organizations/api/organizations-api';
import { config } from '@/lib/config';
import { http } from '@/lib/http';
import { fr } from '@/lib/i18n/fr';
import { defaultRolePermissions } from '@/lib/reference/default-permissions';
import {
  conflict,
  forbidden,
  invalid,
  notFound,
  unauthenticated,
  type ApiReply,
  type Input,
} from './api-replies';
import { createCgaBackend } from './api-cga';
import { createImportsBackend } from './api-imports';
import { createMemberFinanceBackend } from './api-member-finance';
import { createPermissionsBackend } from './api-permissions';
import { createReferenceDataBackend } from './api-reference-data';
import { createTemplatesBackend } from './api-templates';
import { verificationRoute } from './api-verification';
import type { createReferentialsBackend } from './api-referentials';
import { createMembersBackend } from './api-members';

/*
 * Backend de la plateforme (`backend/`, `/api/v1`) simulé derrière le **vrai** client `http` :
 * l'adresse de `VITE_API_BASE_URL`, les intercepteurs (419, 401, toasts) et `httpAuthApi` jouent
 * comme dans le navigateur ; seules les réponses du serveur sont écrites ici, d'après ses
 * contrôleurs : `SessionController`, `MeController` (`SessionResource`), `OrganizationController`,
 * `OrganizationStatusController` (`OrganizationResource`, bloc `can`), `RegionalDirectorateController`.
 * Comptes du `DemoSeeder` (mot de passe `Demo-Cga-2026`), et deux comptes propres aux tests.
 */

/** Adresse complète d'une route de l'API versionnée. */
export function apiUrl(path: string): string {
  return `${config.apiBaseUrl}${path}`;
}

/** Adresse du cookie CSRF de Sanctum, à la racine du serveur de l'API. */
export const csrfCookieUrl = `${config.apiRootUrl.replace(/\/$/, '')}/sanctum/csrf-cookie`;

export const DEMO_PASSWORD = 'Demo-Cga-2026';

export type ApiAccount = {
  user: SessionUser;
  memberships: Membership[];
  disabled?: boolean;
};

export type { ApiReply } from './api-replies';

export type RecordedRequest = {
  method: string;
  url: string;
  body: unknown;
  withCredentials: boolean | undefined;
};

const ids = {
  cncga: '01org0000000000000000cncga',
  platform: '01org000000000000000platfm',
  dck: '01cga000000000000000000001',
  bouake: '01cga000000000000000000002',
  suspended: '01cga000000000000000000003',
};

const organizations = {
  cncga: {
    id: ids.cncga,
    type: 'cncga',
    name: 'Collectif National des Centres de Gestion Agréés',
    banking_enabled: false,
  },
  platform: { id: ids.platform, type: 'platform', name: 'CGA Connect', banking_enabled: false },
  dck: { id: ids.dck, type: 'cga', name: 'DC-KNOWING CGA', banking_enabled: false },
  bouake: { id: ids.bouake, type: 'cga', name: 'CGA Démo Bouaké', banking_enabled: false },
} as const satisfies Record<string, Membership['organization']>;

function membership(
  id: string,
  role: string,
  organization: Membership['organization'],
  member: Membership['member'] = null,
): Membership {
  return { id, role, organization, member, unread_notifications: 0 };
}

function user(firstName: string, lastName: string, phone: string): SessionUser {
  return {
    first_name: firstName,
    last_name: lastName,
    phone,
    email: null,
    notification_preferences: { sms: false, whatsapp: false },
  };
}

/** Comptes par téléphone saisi (« 07 00 00 00 01 » vaut « +2250700000001 »). */
export const demoAccounts: Record<string, ApiAccount> = {
  '+2250700000001': {
    user: user('Aminata', 'Présidente', '+2250700000001'),
    memberships: [membership('01ms00000000000000000000p1', 'cncga_president', organizations.cncga)],
  },
  '+2250700000002': {
    user: user('Koffi', 'Gérant', '+2250700000002'),
    memberships: [membership('01ms00000000000000000000g2', 'cga_manager', organizations.dck)],
  },
  // Trois espaces : CNCGA (gestionnaire), DC-KNOWING (expert-comptable), Bouaké (comptable).
  '+2250700000003': {
    user: user('Yao', 'Multi-rôles', '+2250700000003'),
    memberships: [
      membership('01ms00000000000000000000m1', 'cncga_manager', organizations.cncga),
      membership('01ms00000000000000000000m2', 'cga_accountant_expert', organizations.dck),
      membership('01ms00000000000000000000m3', 'cga_accountant', organizations.bouake),
    ],
  },
  '+2250700000004': {
    user: user('Adjoua', 'Comptable', '+2250700000004'),
    memberships: [membership('01ms00000000000000000000c4', 'cga_accountant', organizations.dck)],
  },
  '+2250700000005': {
    user: user('Kouassi', 'Désactivé', '+2250700000005'),
    memberships: [membership('01ms00000000000000000000d5', 'cga_accountant', organizations.dck)],
    disabled: true,
  },
  '+2250700000007': {
    user: user('Mariam', 'Profil', '+2250700000007'),
    memberships: [membership('01ms00000000000000000000t7', 'cga_trainer', organizations.bouake)],
  },
  '+2250700000009': {
    user: user('Awa', 'Administratrice', '+2250700000009'),
    memberships: [
      membership('01ms00000000000000000000a9', 'platform_admin', organizations.platform),
    ],
  },
  // Propres aux tests : un adhérent et un membre du bureau du CNCGA, chacun dans un seul espace.
  '+2250700000012': {
    user: user('Sery', 'Adhérent', '+2250700000012'),
    memberships: [
      membership('01ms0000000000000000000a12', 'member_owner', organizations.dck, {
        id: '01mbr000000000000000000001',
        name: null as unknown as string,
      }),
    ],
  },
  '+2250700000013': {
    user: user('Bintou', 'Bureau', '+2250700000013'),
    memberships: [membership('01ms0000000000000000000b13', 'cncga_viewer', organizations.cncga)],
  },
};

/** `PhoneNormalizer` : un numéro ivoirien à 10 chiffres reçoit l'indicatif +225. */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');

  if (phone.trim().startsWith('+')) {
    return `+${digits}`;
  }

  return digits.length === 10 ? `+225${digits}` : digits;
}

const PHONE_PATTERN = /^\+225\d{10}$/;

const labels = fr.status;

/** CGA du `DemoSeeder` : DC-KNOWING (agréé, abonné), Bouaké (agrément en cours), Suspendu. */
export function demoCgas(): Organization[] {
  const [abidjan, bouake] = demoRegionalDirectorates;

  return [
    demoOrganization({
      id: ids.dck,
      name: 'DC-KNOWING CGA',
      sigle: 'DCK',
      city: 'Abidjan',
      phone_1: '+2252722445501',
      email: 'contact@dcknowing.demo',
      regional_directorate: abidjan,
      agreement_status: 'granted',
      agreement_status_label: labels.agreement.granted,
      agreement_number: 'AGR-DEMO-001',
      agreement_date: '2018-01-01',
      subscription: {
        status: 'active',
        status_label: labels.subscription.active,
        started_at: '2026-01-01',
        trial_ends_at: null,
        ended_at: null,
        data_deletion_due_at: null,
      },
      members_count: 3,
      manager: {
        id: '01usr00000000000000000002',
        name: 'Koffi Gérant',
        phone: '+2250700000002',
        email: null,
        status: 'active',
        status_label: 'Actif',
      },
    }),
    demoOrganization({
      id: ids.bouake,
      name: 'CGA Démo Bouaké',
      sigle: 'DEMOB',
      city: 'Bouaké',
      phone_1: '+2252731630102',
      regional_directorate: bouake,
    }),
    demoOrganization({
      id: ids.suspended,
      name: 'CGA Démo Suspendu',
      sigle: 'DEMOS',
      city: 'Korhogo',
      phone_1: '+2252722445502',
      agreement_status: 'granted',
      agreement_status_label: labels.agreement.granted,
      agreement_number: 'AGR-DEMO-003',
      agreement_date: '2019-06-01',
      status: 'suspended',
      status_label: labels.organization.suspended,
      suspended_at: '2026-10-01T08:00:00Z',
      suspension_reason: 'Démonstration : cotisation impayée',
      status_events: [
        {
          event: 'suspended',
          event_label: 'Suspension',
          reason: 'Démonstration : cotisation impayée',
          actor: { id: '01usr00000000000000000001', name: 'Aminata Présidente' },
          occurred_at: '2026-10-01T08:00:00Z',
        },
      ],
    }),
  ];
}

function parse(data: unknown): unknown {
  return typeof data === 'string' && data !== '' ? (JSON.parse(data) as unknown) : data;
}

/**
 * Installe le serveur simulé sur le client `http`. `failNext` force la prochaine réponse d'une route
 * (refus, panne, réseau coupé) ; `restore` remet le client d'origine.
 */
export function installApiServer({
  accounts = demoAccounts,
  cgas = demoCgas(),
  members = createMembersBackend(),
  imports = createImportsBackend(),
  cga = createCgaBackend(),
  referentials,
  // Nommé `rights` ici : `permissions()` donne déjà les droits de l'espace actif.
  permissions: rights = createPermissionsBackend(),
  referenceData = createReferenceDataBackend(),
  memberFinance = createMemberFinanceBackend(),
  templates = createTemplatesBackend(),
}: {
  accounts?: Record<string, ApiAccount>;
  cgas?: Organization[];
  members?: ReturnType<typeof createMembersBackend>;
  imports?: ReturnType<typeof createImportsBackend>;
  cga?: ReturnType<typeof createCgaBackend>;
  /** Gestion des référentiels nationaux (`/cncga/parametres`), seulement pour les tests qui la demandent. */
  referentials?: ReturnType<typeof createReferentialsBackend>;
  permissions?: ReturnType<typeof createPermissionsBackend>;
  referenceData?: ReturnType<typeof createReferenceDataBackend>;
  memberFinance?: ReturnType<typeof createMemberFinanceBackend>;
  templates?: ReturnType<typeof createTemplatesBackend>;
} = {}) {
  const requests: RecordedRequest[] = [];
  const forced = new Map<string, ApiReply[]>();
  const previousAdapter = http.defaults.adapter;
  const lastUsed = new Map<string, string>();
  let registry = cgas;
  let signedIn: { phone: string; activeId: string | null } | null = null;

  function account(): ApiAccount | null {
    return signedIn === null ? null : accounts[signedIn.phone];
  }

  function permissions(): readonly string[] {
    const active = account()?.memberships.find((item) => item.id === signedIn?.activeId);

    return active === undefined ? [] : (defaultRolePermissions[active.role] ?? []);
  }

  /** Organisation de l'espace actif (`TenantContext::organizationId()`). */
  function activeOrganizationId(): string | null {
    return (
      account()?.memberships.find((item) => item.id === signedIn?.activeId)?.organization.id ?? null
    );
  }

  /** Dossier de l'accès adhérent actif (`TenantContext::memberId()`). */
  function activeMemberId(): string | null {
    return (
      account()?.memberships.find((item) => item.id === signedIn?.activeId)?.member?.id ?? null
    );
  }

  function allows(permission: string): boolean {
    return permissions().includes(permission);
  }

  function session(): Session {
    const current = account() as ApiAccount;
    const phone = signedIn?.phone ?? '';

    return {
      user: current.user,
      memberships: current.memberships,
      active_membership_id: signedIn?.activeId ?? null,
      last_membership_id: lastUsed.get(phone) ?? null,
      permissions: [...permissions()],
    };
  }

  /** Bloc `can` d'`OrganizationResource`, d'après les droits de l'espace actif. */
  function withCan(organization: Organization): Organization {
    return {
      ...organization,
      can: {
        update: allows('organizations.manage'),
        change_subscription: allows('organizations.subscription.manage'),
        suspend: allows('organizations.suspend'),
        invite_manager: allows('organizations.manage'),
      },
    };
  }

  function login(body: Input): ApiReply {
    const identifier = typeof body.identifier === 'string' ? body.identifier : '';
    const phone = normalizePhone(identifier);
    const found = accounts[phone] as ApiAccount | undefined;

    if (found === undefined || body.password !== DEMO_PASSWORD) {
      return invalid({ identifier: 'Identifiants incorrects.' });
    }

    if (found.disabled === true) {
      return {
        status: 403,
        data: { message: 'Votre accès n’est pas actif.', code: 'inactive_account' },
      };
    }

    // Un seul espace : le serveur l'ouvre d'office (`SessionController::store`).
    const only = found.memberships.length === 1 ? found.memberships[0].id : null;

    signedIn = { phone, activeId: only };

    if (only !== null) {
      lastUsed.set(phone, only);
    }

    return { status: 200, data: { data: session() } };
  }

  function selectSpace(body: Input): ApiReply {
    const chosen = account()?.memberships.find((item) => item.id === body.membership_id);

    if (signedIn === null || chosen === undefined) {
      return invalid({ membership_id: 'L’espace choisi est invalide.' });
    }

    signedIn.activeId = chosen.id;
    lastUsed.set(signedIn.phone, chosen.id);

    return { status: 200, data: { data: session() } };
  }

  /** Règles de `CgaRegistrationRequest`. */
  function validateRegistration(
    input: Input,
    current: Organization | null,
  ): Record<string, string> {
    const errors: Record<string, string> = {};
    const text = (field: string) =>
      typeof input[field] === 'string' ? (input[field] as string) : '';

    if (text('name').trim() === '') {
      errors.name = 'Le champ dénomination est obligatoire.';
    }

    if (text('city').trim() === '') {
      errors.city = 'Le champ ville est obligatoire.';
    }

    if (!PHONE_PATTERN.test(normalizePhone(text('phone_1')))) {
      errors.phone_1 = 'Le numéro de téléphone n’est pas valide.';
    }

    if (!['pending', 'granted'].includes(text('agreement_status'))) {
      errors.agreement_status = 'Le statut d’agrément est invalide.';
    }

    if (input.agreement_status === 'granted') {
      if (text('agreement_number') === '') {
        errors.agreement_number = 'Le champ n° d’agrément est obligatoire quand le CGA est agréé.';
      } else if (
        registry.some(
          (cga) => cga.agreement_number === input.agreement_number && cga.id !== current?.id,
        )
      ) {
        errors.agreement_number = 'La valeur du champ n° d’agrément est déjà utilisée.';
      }

      if (text('agreement_date') === '') {
        errors.agreement_date = 'Le champ date d’agrément est obligatoire quand le CGA est agréé.';
      }
    }

    return errors;
  }

  function registered(organization: Organization, input: Input): Organization {
    const status = input.agreement_status === 'granted' ? 'granted' : 'pending';

    return {
      ...organization,
      name: input.name as string,
      sigle: (input.sigle as string | null) ?? null,
      city: input.city as string,
      phone_1: normalizePhone(input.phone_1 as string),
      email: (input.email as string | null) ?? null,
      agreement_status: status,
      agreement_status_label: labels.agreement[status],
      agreement_number: (input.agreement_number as string | null) ?? null,
      agreement_date: (input.agreement_date as string | null) ?? null,
    };
  }

  function list(query: URLSearchParams): ApiReply {
    const search = query.get('filter[search]')?.toLocaleLowerCase('fr') ?? '';
    const status = query.get('filter[status]');
    const subscription = query.get('filter[subscription_status]');
    const region = query.get('filter[regional_directorate_id]');
    const sort = query.get('sort') ?? 'name';
    const field = sort.replace(/^-/, '') as 'name' | 'city' | 'created_at';
    const direction = sort.startsWith('-') ? -1 : 1;
    const perPage = Math.min(Number(query.get('per_page') ?? '25'), 100);
    const page = Math.max(1, Number(query.get('page') ?? '1'));
    const selected = registry
      .filter(
        (cga) =>
          search === '' ||
          [cga.name, cga.sigle, cga.city, cga.agreement_number].some((value) =>
            value?.toLocaleLowerCase('fr').includes(search),
          ),
      )
      .filter((cga) => status === null || cga.status === status)
      .filter((cga) => subscription === null || cga.subscription.status === subscription)
      .filter((cga) => region === null || cga.regional_directorate?.id === region)
      .sort(
        (a, b) => direction * String(a[field] ?? '').localeCompare(String(b[field] ?? ''), 'fr'),
      );

    return {
      status: 200,
      data: {
        data: selected.slice((page - 1) * perPage, page * perPage).map(withCan),
        meta: {
          current_page: page,
          per_page: perPage,
          total: selected.length,
          last_page: Math.max(1, Math.ceil(selected.length / perPage)),
        },
      },
    };
  }

  function event(organization: Organization, name: string, reason: string): Organization {
    return {
      ...organization,
      status_events: [
        {
          event: name,
          event_label: name,
          reason,
          actor: { id: '01usr00000000000000000001', name: 'Aminata Présidente' },
          occurred_at: '2026-10-22T10:00:00Z',
        },
        ...(organization.status_events ?? []),
      ],
    };
  }

  /** Actions de `OrganizationStatusController` et invitation du gérant. */
  function act(organization: Organization, action: string, input: Input): ApiReply | Organization {
    const reason = typeof input.reason === 'string' ? input.reason.trim() : '';

    if (action === 'subscription') {
      if (!allows('organizations.subscription.manage')) {
        return forbidden;
      }

      const status = input.status as Organization['subscription']['status'];

      if (status === organization.subscription.status) {
        return conflict('subscription_unchanged', 'Ce CGA a déjà cet état d’abonnement.');
      }

      return event(
        {
          ...organization,
          subscription: {
            ...organization.subscription,
            status,
            status_label: labels.subscription[status as 'none'],
          },
        },
        'subscription_changed',
        reason,
      );
    }

    if (action === 'manager') {
      if (!allows('organizations.manage')) {
        return forbidden;
      }

      const errors: Record<string, string> = {};

      for (const field of ['first_name', 'last_name']) {
        if (typeof input[field] !== 'string' || input[field] === '') {
          errors[field] = `Le champ ${field === 'first_name' ? 'prénom' : 'nom'} est obligatoire.`;
        }
      }

      const phone = typeof input.phone === 'string' ? normalizePhone(input.phone) : '';

      if (!PHONE_PATTERN.test(phone)) {
        errors.phone = 'Le numéro de téléphone n’est pas valide.';
      }

      if (Object.keys(errors).length > 0) {
        return invalid(errors);
      }

      if (organization.manager !== null && organization.manager !== undefined) {
        return conflict('cga_manager_exists', 'Ce CGA a déjà un gérant, invité ou actif.');
      }

      return {
        ...organization,
        manager: {
          id: '01usr00000000000000000099',
          name: `${String(input.first_name)} ${String(input.last_name)}`,
          phone,
          email: null,
          status: 'invited',
          status_label: 'Invité',
        },
      };
    }

    // Suspension, réactivation, retrait d'agrément : `Gate::allows('suspend')` (RG-ROLE-04).
    if (!allows('organizations.suspend')) {
      return forbidden;
    }

    if (reason === '') {
      return invalid({ reason: 'Le champ motif est obligatoire.' });
    }

    if (action === 'suspend') {
      if (organization.status === 'suspended') {
        return conflict('organization_already_suspended', 'Ce CGA est déjà suspendu.');
      }

      return event(
        {
          ...organization,
          status: 'suspended',
          status_label: labels.organization.suspended,
          suspended_at: '2026-10-22T10:00:00Z',
          suspension_reason: reason,
        },
        'suspended',
        reason,
      );
    }

    if (action === 'reactivate') {
      if (organization.status !== 'suspended') {
        return conflict('organization_not_suspended', 'Ce CGA n’est pas suspendu.');
      }

      return event(
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
    }

    if (typeof input.withdrawn_at !== 'string' || input.withdrawn_at === '') {
      return invalid({ withdrawn_at: 'Le champ date du retrait est obligatoire.' });
    }

    if (organization.agreement_status === 'withdrawn') {
      return conflict('agreement_already_withdrawn', 'L’agrément de ce CGA est déjà retiré.');
    }

    return event(
      {
        ...organization,
        agreement_status: 'withdrawn',
        agreement_status_label: labels.agreement.withdrawn,
        agreement_withdrawn_at: input.withdrawn_at,
        status: 'suspended',
        status_label: labels.organization.suspended,
        suspended_at: organization.suspended_at ?? '2026-10-22T10:00:00Z',
        suspension_reason: organization.suspension_reason ?? reason,
      },
      'agreement_withdrawn',
      reason,
    );
  }

  function organizationsRoute(method: string, url: URL, body: Input): ApiReply | undefined {
    const path = url.pathname.replace(/^.*\/api\/v1/, '');
    const match =
      /^\/network\/organizations(?:\/([^/]+))?(?:\/(manager|subscription|suspend|reactivate|withdraw-agreement))?$/.exec(
        path,
      );

    if (match === null) {
      return undefined;
    }

    const [, rawId, action] = match;

    if (!allows('organizations.view')) {
      return forbidden;
    }

    if (rawId === undefined) {
      if (method === 'GET') {
        return list(url.searchParams);
      }

      if (!allows('organizations.manage')) {
        return forbidden;
      }

      const errors = validateRegistration(body, null);

      if (Object.keys(errors).length > 0) {
        return invalid(errors);
      }

      const created = registered(
        demoOrganization({
          id: `01cga9${String(registry.length + 1).padStart(20, '0')}`,
          name: '',
          city: '',
          created_at: '2026-10-22T10:00:00Z',
        }),
        body,
      );

      registry = [...registry, created];

      return { status: 201, data: { data: withCan(created) } };
    }

    const organization = registry.find((candidate) => candidate.id === rawId);

    if (organization === undefined) {
      return notFound;
    }

    let updated: ApiReply | Organization;

    if (action !== undefined) {
      updated = act(organization, action, body);
    } else if (method === 'PUT') {
      if (!allows('organizations.manage')) {
        return forbidden;
      }

      const errors = validateRegistration(body, organization);

      updated = Object.keys(errors).length > 0 ? invalid(errors) : registered(organization, body);
    } else {
      return { status: 200, data: { data: withCan(organization) } };
    }

    if (typeof updated === 'string' || !('id' in updated)) {
      return updated;
    }

    const saved = updated;

    registry = registry.map((candidate) => (candidate.id === saved.id ? saved : candidate));

    return { status: action === 'manager' ? 201 : 200, data: { data: withCan(saved) } };
  }

  function answer(method: string, url: string, body: unknown): ApiReply {
    // Une réponse forcée vise l'adresse exacte, ou la route quels que soient ses paramètres.
    const queued =
      forced.get(`${method} ${url}`)?.shift() ??
      forced.get(`${method} ${url.split('?')[0]}`)?.shift();

    if (queued !== undefined) {
      return queued;
    }

    if (method === 'GET' && url === csrfCookieUrl) {
      return { status: 204 };
    }

    const input = (body ?? {}) as Input;

    // Vérification publique d'un document : sans session (F-DOC-04).
    const verified = verificationRoute(method, new URL(url).pathname.replace(/^.*\/api\/v1/, ''));

    if (verified !== undefined) {
      return verified;
    }

    if (method === 'POST' && url === apiUrl('/auth/login')) {
      return login(input);
    }

    if (account() === null) {
      return unauthenticated;
    }

    if (method === 'GET' && url === apiUrl('/me')) {
      return { status: 200, data: { data: session() } };
    }

    if (method === 'POST' && url === apiUrl('/me/space')) {
      return selectSpace(input);
    }

    if (method === 'POST' && url === apiUrl('/auth/logout')) {
      signedIn = null;

      return { status: 204 };
    }

    // Routes métier : un espace actif d'abord (02-TRD §6.2).
    if (signedIn?.activeId === null) {
      return conflict('space_required', 'Choisissez d’abord un espace.');
    }

    const parsed = new URL(url);
    const managed = referentials?.route(
      method,
      parsed.pathname.replace(/^.*\/api\/v1/, ''),
      parsed.searchParams,
      body,
      { allows },
    );

    if (managed !== undefined) {
      return managed;
    }

    if (method === 'GET' && parsed.pathname.endsWith('/referentials/regional-directorates')) {
      return {
        status: 200,
        data: {
          data: demoRegionalDirectorates,
          meta: { current_page: 1, per_page: 100, total: 2, last_page: 1 },
        },
      };
    }

    const path = parsed.pathname.replace(/^.*\/api\/v1/, '');

    return (
      imports.route(method, path, body, { allows }) ??
      rights.route(method, path, parsed.searchParams, body, { allows }) ??
      referenceData.route(method, path, body, { allows }) ??
      templates.route(method, path, body, { allows }) ??
      memberFinance.route(method, path, body, { allows, memberId: activeMemberId() }) ??
      cga.route(method, path, parsed.searchParams, body, {
        allows,
        organizationId: activeOrganizationId(),
      }) ??
      members.route(method, path, parsed.searchParams, input, {
        allows,
        memberId: activeMemberId(),
      }) ??
      organizationsRoute(method, parsed, input) ??
      notFound
    );
  }

  const adapter: AxiosAdapter = (request: InternalAxiosRequestConfig) => {
    const method = (request.method ?? 'get').toUpperCase();
    const url = http.getUri(request);
    const body = parse(request.data);

    requests.push({ method, url, body, withCredentials: request.withCredentials });

    const reply = answer(method, url, body);

    if (reply === 'network-error') {
      return Promise.reject(new AxiosError('Network Error', AxiosError.ERR_NETWORK, request));
    }

    const response = {
      data: reply.data ?? '',
      status: reply.status,
      statusText: '',
      headers: reply.headers ?? {},
      config: request,
    } as AxiosResponse;

    if (reply.status >= 400) {
      return Promise.reject(
        new AxiosError(
          `Request failed with status code ${String(reply.status)}`,
          reply.status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
          request,
          null,
          response,
        ),
      );
    }

    return Promise.resolve(response);
  };

  http.defaults.adapter = adapter;

  return {
    requests,
    /** CGA du registre simulé, dans leur état courant. */
    cgas: () => registry,
    /** Dossiers des adhérents simulés (`api-members.ts`). */
    members,
    /** Imports de portefeuille simulés (`api-imports.ts`). */
    imports,
    /** Ouvre une session côté serveur, comme un cookie de session encore valide. */
    signIn(phone: string, activeId: string | null = null) {
      signedIn = { phone: normalizePhone(phone), activeId };
    },
    /** `url` : adresse complète, `apiUrl('/auth/login')` ou `csrfCookieUrl`. */
    failNext(method: string, url: string, reply: ApiReply) {
      const key = `${method} ${url}`;

      forced.set(key, [...(forced.get(key) ?? []), reply]);
    },
    restore() {
      http.defaults.adapter = previousAdapter;
    },
  };
}

/** Identifiants des accès et des CGA de démonstration, pour les tests. */
export const demoIds = {
  ...ids,
  president: demoAccounts['+2250700000001'].memberships[0].id,
  manager: demoAccounts['+2250700000002'].memberships[0].id,
  multiCncga: demoAccounts['+2250700000003'].memberships[0].id,
  multiDck: demoAccounts['+2250700000003'].memberships[1].id,
  multiBouake: demoAccounts['+2250700000003'].memberships[2].id,
  board: demoAccounts['+2250700000013'].memberships[0].id,
  accountant: demoAccounts['+2250700000004'].memberships[0].id,
  trainer: demoAccounts['+2250700000007'].memberships[0].id,
  platformAdmin: demoAccounts['+2250700000009'].memberships[0].id,
  memberOwner: demoAccounts['+2250700000012'].memberships[0].id,
};
