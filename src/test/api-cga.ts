import type { Agent, CgaProfile } from '@/features/cga-settings/api/cga-api';
import type { TaxOffice } from '@/features/referentials/api/referentials-api';
import { roleLabel } from '@/lib/reference/roles';
import { demoFeeSchedule } from './demo-members';
import {
  forbidden,
  invalid,
  notFound,
  ok,
  paginated,
  text,
  type ApiReply,
  type Input,
} from './api-replies';
import { formInput } from './api-member-records';

/*
 * Fiche du centre et agents simulés, d'après `CgaProfileController` (`CgaProfileResource`,
 * `CgaProfileRequest`, champs requis `Organization::PROFILE_REQUIRED_FIELDS`) et `AgentController`
 * (`AgentResource`, rôles assignables `TeamRoles`) ; centres des impôts rattachés à leur DR
 * (`TaxOfficeResource`), comme les renvoie le vrai serveur.
 */
type Context = { allows: (permission: string) => boolean; organizationId: string | null };

const NOW = '2026-10-26T09:00:00Z';

const REQUIRED = [
  'ncc',
  'rccm',
  'legal_form',
  'share_capital',
  'agreement_number',
  'agreement_date',
  'regional_directorate_id',
  'tax_office_id',
  'address',
  'city',
  'phone_1',
  'email',
  'manager_name',
  'expert_name',
  'numbering_abbreviation',
  'logo_file_id',
  'signature_file_id',
  'stamp_file_id',
] as const;

const directorates = {
  abidjan: {
    id: '01dr0000000000000000000001',
    code: 'DEMO-ABJ',
    name: 'DR Abidjan (démonstration)',
  },
  bouake: { id: '01dr0000000000000000000002', code: 'DEMO-BKE', name: 'DR Bouaké (démonstration)' },
};

/** CDI de démonstration, avec leur DR (les mêmes que `demoTaxOffices`). */
export const demoTaxOfficesWithDirectorate: TaxOffice[] = [
  {
    id: '01cdi000000000000000000001',
    code: 'CDI-PLT',
    name: 'CDI Plateau (démonstration)',
    regional_directorate: directorates.abidjan,
    active: true,
    data_status: 'provisional',
    validated_at: null,
    can: { update: false, delete: false },
  },
  {
    id: '01cdi000000000000000000002',
    code: 'CDI-BKE',
    name: 'CDI Bouaké (démonstration)',
    regional_directorate: directorates.bouake,
    active: true,
    data_status: 'provisional',
    validated_at: null,
    can: { update: false, delete: false },
  },
];

function image(name: string) {
  return { id: `01fil-${name}`, mime_type: 'image/png', url: `https://files.test/${name}.png` };
}

/** Fiche complète de DC-KNOWING (`DemoSeeder::completeProfile`), modifiable par `overrides`. */
export function demoProfile(overrides: Partial<CgaProfile> = {}): CgaProfile {
  return {
    id: '01cga000000000000000000001',
    name: 'DC-KNOWING CGA',
    sigle: 'DCK',
    legal_form: 'SARL',
    share_capital: 5000000,
    ncc: '9900001K',
    rccm: 'CI-ABJ-2020-B-00001',
    agreement_status: 'granted',
    agreement_status_label: 'Agréé',
    agreement_number: 'AGR-DEMO-0001',
    agreement_date: '2020-01-06',
    regional_directorate: directorates.abidjan,
    tax_office: {
      id: '01cdi000000000000000000001',
      code: 'CDI-PLT',
      name: 'CDI Plateau (démonstration)',
    },
    commune: null,
    said: null,
    address: 'Plateau, avenue Chardy, immeuble Démo',
    city: 'Abidjan',
    phone_1: '+2252722445501',
    phone_2: null,
    email: 'contact@dcknowing.demo',
    manager_name: 'Koffi Gérant',
    expert_name: 'Yao Multi-rôles',
    signatory_name: 'Koffi Gérant',
    signatory_title: 'Le Gérant',
    numbering_abbreviation: 'DCK',
    abbreviation_locked: true,
    history_text: null,
    previous_year_revenue: null,
    images: { logo: image('logo'), signature: image('signature'), stamp: image('stamp') },
    status: 'active',
    status_label: 'Actif',
    subscription_status: 'active',
    subscription_status_label: 'Actif',
    missing_fields: [],
    profile_completed_at: '2026-01-05T09:00:00Z',
    can: { update: true },
    ...overrides,
  };
}

/** Champs requis encore vides (`missingProfileFields`). */
function missingOf(profile: CgaProfile): string[] {
  const values: Record<(typeof REQUIRED)[number], unknown> = {
    ncc: profile.ncc,
    rccm: profile.rccm,
    legal_form: profile.legal_form,
    share_capital: profile.share_capital,
    agreement_number: profile.agreement_number,
    agreement_date: profile.agreement_date,
    regional_directorate_id: profile.regional_directorate,
    tax_office_id: profile.tax_office,
    address: profile.address,
    city: profile.city,
    phone_1: profile.phone_1,
    email: profile.email,
    manager_name: profile.manager_name,
    expert_name: profile.expert_name,
    numbering_abbreviation: profile.numbering_abbreviation,
    logo_file_id: profile.images.logo,
    signature_file_id: profile.images.signature,
    stamp_file_id: profile.images.stamp,
  };

  return REQUIRED.filter((field) => values[field] === null || values[field] === '');
}

function agent(overrides: Partial<Agent> & Pick<Agent, 'id' | 'first_name' | 'last_name'>): Agent {
  return {
    name: `${overrides.first_name} ${overrides.last_name}`,
    phone: '+2250700000000',
    email: null,
    status: 'active',
    status_label: 'Actif',
    roles: [],
    last_login_at: '2026-10-25T08:00:00Z',
    invitation: null,
    can: { update_roles: true, disable: true, enable: false, resend_invitation: false },
    ...overrides,
  };
}

function roles(list: string[], status = 'active') {
  return list.map((role) => ({ role, role_label: roleLabel(role), status }));
}

function demoAgents(): Record<string, Agent[]> {
  return {
    cga: [
      agent({
        id: '01usr0000000000000000koffi',
        first_name: 'Koffi',
        last_name: 'Gérant',
        phone: '+2250700000002',
        roles: roles(['cga_manager']),
        can: { update_roles: false, disable: false, enable: false, resend_invitation: false },
      }),
      agent({
        id: '01usr000000000000000adjoua',
        first_name: 'Adjoua',
        last_name: 'Comptable',
        phone: '+2250700000004',
        email: 'adjoua@dcknowing.demo',
        roles: roles(['cga_accountant']),
      }),
      agent({
        id: '01usr00000000000000kouassi',
        first_name: 'Kouassi',
        last_name: 'Désactivé',
        phone: '+2250700000005',
        status: 'disabled',
        status_label: 'Désactivé',
        roles: roles(['cga_accountant'], 'disabled'),
        can: { update_roles: false, disable: false, enable: true, resend_invitation: false },
      }),
      agent({
        id: '01usr0000000000000000fatou',
        first_name: 'Fatou',
        last_name: 'Invitée',
        phone: '+2250700000006',
        status: 'invited',
        status_label: 'Invité',
        roles: roles(['cga_secretary'], 'invited'),
        last_login_at: null,
        invitation: { channel: 'sms', sent_at: NOW, expires_at: '2026-11-02T09:00:00Z' },
        can: { update_roles: true, disable: true, enable: false, resend_invitation: true },
      }),
    ],
    network: [
      agent({
        id: '01usr000000000000000aminata',
        first_name: 'Aminata',
        last_name: 'Présidente',
        phone: '+2250700000001',
        roles: roles(['cncga_president']),
        can: { update_roles: false, disable: false, enable: false, resend_invitation: false },
      }),
      agent({
        id: '01usr000000000000000000yao',
        first_name: 'Yao',
        last_name: 'Multi-rôles',
        phone: '+2250700000003',
        roles: roles(['cncga_manager']),
      }),
    ],
  };
}

const PERMISSIONS: Record<string, string> = {
  cga: 'cga_users.manage',
  network: 'network_users.manage',
};

export function createCgaBackend(
  initial: CgaProfile = demoProfile(),
  options: { eligible?: number } = {},
) {
  let profile = initial;
  let schedule = structuredClone(demoFeeSchedule);
  let eligible = options.eligible ?? 12;
  const agents = demoAgents();
  let nextId = 0;

  function updateProfile(input: Input, context: Context): ApiReply {
    if (!context.allows('cga.profile.manage')) {
      return forbidden;
    }

    const errors: Record<string, string> = {};

    for (const field of ['city', 'phone_1']) {
      if (text(input, field) === '') {
        errors[field] = `Le champ ${field} est obligatoire.`;
      }
    }

    const abbreviation = input.numbering_abbreviation;

    if (profile.abbreviation_locked && abbreviation !== profile.numbering_abbreviation) {
      errors.numbering_abbreviation = 'L’abréviation est verrouillée.';
    }

    if (Object.keys(errors).length > 0) {
      return invalid(errors);
    }

    const value = (field: string) => (input[field] ?? null) as string | null;
    const office = demoTaxOfficesWithDirectorate.find((item) => item.id === input.tax_office_id);
    const directorate = Object.values(directorates).find(
      (item) => item.id === input.regional_directorate_id,
    );

    profile = {
      ...profile,
      legal_form: value('legal_form'),
      share_capital: (input.share_capital ?? null) as number | null,
      ncc: value('ncc'),
      rccm: value('rccm'),
      agreement_number: value('agreement_number'),
      agreement_date: value('agreement_date'),
      regional_directorate: directorate ?? null,
      tax_office:
        office === undefined ? null : { id: office.id, code: office.code, name: office.name },
      said: value('said'),
      address: value('address'),
      city: text(input, 'city'),
      phone_1: text(input, 'phone_1'),
      phone_2: value('phone_2'),
      email: value('email'),
      manager_name: value('manager_name'),
      expert_name: value('expert_name'),
      signatory_name: value('signatory_name'),
      signatory_title: value('signatory_title'),
      numbering_abbreviation: value('numbering_abbreviation'),
      history_text: value('history_text'),
      previous_year_revenue: (input.previous_year_revenue ?? null) as number | null,
    };

    return saved();
  }

  /** Fiche enregistrée : liste des manques et date de complétude recalculées. */
  function saved(): ApiReply {
    const missing = missingOf(profile);

    profile = {
      ...profile,
      missing_fields: missing,
      profile_completed_at: missing.length === 0 ? (profile.profile_completed_at ?? NOW) : null,
    };

    return ok(profile);
  }

  function storeImage(kind: string, body: unknown, context: Context): ApiReply {
    if (!context.allows('cga.profile.manage')) {
      return forbidden;
    }

    const file = formInput(body).image;

    if (!(file instanceof File) || !['image/png', 'image/jpeg'].includes(file.type)) {
      return invalid({ image: 'L’image doit être au format PNG ou JPEG.' });
    }

    profile = { ...profile, images: { ...profile.images, [kind]: image(`${kind}-${file.name}`) } };

    return saved();
  }

  function agentRoute(
    scope: string,
    method: string,
    rest: string,
    input: Input,
    query: URLSearchParams,
    context: Context,
  ): ApiReply {
    if (!context.allows(PERMISSIONS[scope])) {
      return forbidden;
    }

    const list = agents[scope];

    if (rest === '' && method === 'GET') {
      const search = (query.get('filter[search]') ?? '').toLocaleLowerCase('fr');
      const status = query.get('filter[status]');

      return paginated(
        list.filter(
          (item) =>
            (search === '' ||
              `${item.name} ${item.phone}`.toLocaleLowerCase('fr').includes(search)) &&
            (status === null || item.status === status),
        ),
        query,
      );
    }

    if (rest === '' && method === 'POST') {
      const errors: Record<string, string> = {};

      for (const field of ['first_name', 'last_name', 'phone']) {
        if (text(input, field) === '') {
          errors[field] = `Le champ ${field} est obligatoire.`;
        }
      }

      if (list.some((item) => item.phone === input.phone)) {
        errors.phone = 'Ce téléphone est déjà utilisé par un agent.';
      }

      if (Object.keys(errors).length > 0) {
        return invalid(errors);
      }

      const created = agent({
        id: `01usr9${String(++nextId).padStart(20, '0')}`,
        first_name: text(input, 'first_name'),
        last_name: text(input, 'last_name'),
        phone: text(input, 'phone'),
        email: (input.email ?? null) as string | null,
        status: 'invited',
        status_label: 'Invité',
        roles: roles(input.roles as string[], 'invited'),
        last_login_at: null,
        invitation: { channel: String(input.channel), sent_at: NOW, expires_at: NOW },
        can: { update_roles: true, disable: true, enable: false, resend_invitation: true },
      });

      agents[scope] = [...list, created];

      return ok(created, 201);
    }

    const match = /^\/([^/]+)\/(roles|disable|enable|invitation)$/.exec(rest);
    const target = match === null ? undefined : list.find((item) => item.id === match[1]);

    if (match === null || target === undefined) {
      return notFound;
    }

    let updated: Agent = target;

    switch (match[2]) {
      case 'roles':
        updated = { ...target, roles: roles(input.roles as string[], target.status) };
        break;
      case 'disable':
        updated = {
          ...target,
          status: 'disabled',
          status_label: 'Désactivé',
          can: { update_roles: false, disable: false, enable: true, resend_invitation: false },
        };
        break;
      case 'enable':
        updated = {
          ...target,
          status: 'active',
          status_label: 'Actif',
          can: { update_roles: true, disable: true, enable: false, resend_invitation: false },
        };
        break;
      default:
        updated = { ...target, invitation: { channel: 'sms', sent_at: NOW, expires_at: NOW } };
    }

    agents[scope] = list.map((item) => (item.id === target.id ? updated : item));

    return ok(updated);
  }

  function feeSchedule(method: string, body: unknown, context: Context): ApiReply | undefined {
    if (method === 'GET') {
      return context.allows('cga.profile.view') || context.allows('members.create')
        ? ok({ ...schedule, can: { update: context.allows('cga.profile.manage') } })
        : forbidden;
    }

    if (method !== 'PUT') {
      return undefined;
    }

    if (!context.allows('cga.profile.manage')) {
      return forbidden;
    }

    const input = (body ?? {}) as {
      entry_fee: number;
      fees: Record<'RME' | 'TEE', { amount: number; periodicity: string }>;
    };

    schedule = {
      entry_fee: { amount: input.entry_fee, valid_from: '2026-10-26' },
      fees: {
        RME: { ...input.fees.RME, valid_from: '2026-10-26' },
        TEE: { ...input.fees.TEE, valid_from: '2026-10-26' },
      },
    };

    return ok({ ...schedule, can: { update: true } });
  }

  function campaign(method: string, context: Context): ApiReply | undefined {
    if (!context.allows('documents.produce')) {
      return forbidden;
    }

    if (method === 'GET') {
      return ok({
        year: 2026,
        eligible,
        issued: 3,
        blocked: [
          {
            member: {
              id: '01mbr000000000000000000012',
              company_name: 'IMPRIMERIE KONÉ',
              membership_number: '2026-DCK-0012',
            },
            trigger: 'fees_overdue',
            trigger_label: 'Honoraires impayés',
            reason: 'Relances sans réponse',
            blocked_at: '2026-10-20T09:00:00Z',
          },
        ],
      });
    }

    if (method === 'POST') {
      const queued = eligible;

      eligible = 0;

      return ok({ year: 2026, queued }, 202);
    }

    return undefined;
  }

  /** Routes de la fiche, des agents et des CDI ; `undefined` pour une autre route. */
  function route(
    method: string,
    path: string,
    query: URLSearchParams,
    body: unknown,
    context: Context,
  ): ApiReply | undefined {
    if (method === 'GET' && path === '/referentials/tax-offices') {
      return paginated(demoTaxOfficesWithDirectorate, query);
    }

    if (path === '/cga/fee-schedule') {
      return feeSchedule(method, body, context);
    }

    if (path === '/cga/certificate-campaign') {
      return campaign(method, context);
    }

    if (path === '/cga/profile') {
      if (method === 'GET') {
        return context.allows('cga.profile.view')
          ? ok({ ...profile, can: { update: context.allows('cga.profile.manage') } })
          : forbidden;
      }

      return method === 'PUT' ? updateProfile(formInput(body), context) : undefined;
    }

    const imageRoute = /^\/cga\/profile\/images\/(logo|signature|stamp)$/.exec(path);

    if (method === 'POST' && imageRoute !== null) {
      return storeImage(imageRoute[1], body, context);
    }

    const users = /^\/(cga|network)\/users(.*)$/.exec(path);

    if (users !== null && !users[2].includes('/permissions')) {
      return agentRoute(users[1], method, users[2], formInput(body), query, context);
    }

    return undefined;
  }

  return {
    route,
    /** Fiche du centre dans son état courant. */
    profile: () => profile,
    /** Agents d'un espace dans leur état courant. */
    agents: (scope: 'cga' | 'network') => agents[scope],
  };
}
