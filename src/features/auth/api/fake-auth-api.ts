import { ApiBusinessError } from '@/lib/api-errors';
import { defaultRolePermissions } from '@/lib/reference/default-permissions';
import {
  LoginError,
  type ActivationInput,
  type AuthApi,
  type Credentials,
  type Invitation,
  type Membership,
  type Session,
  type SessionUser,
} from './auth-api';

/*
 * Bouchon de l'API des accès (M01), le temps que l'étape 0.9 livre `/auth/*`, `/me` et `/me/space`.
 * Il tient le rôle du serveur : c'est lui qui compte les échecs, refuse un accès inactif, vérifie
 * les codes et décide des droits effectifs — jamais les écrans. Aucun compte réel, aucun réseau.
 */
export const DEMO_PASSWORD = 'demo1234';

/** Code de démonstration pour le mot de passe oublié et le changement de numéro. */
export const DEMO_CODE = '123456';

/** 02-TRD §6.1 : 5 échecs / 15 min par identifiant + IP. Ici, le compteur vit en mémoire. */
const MAX_ATTEMPTS = 5;

/** 02-TRD §6.1 : 3 essais pour un code reçu par SMS. */
const MAX_CODE_ATTEMPTS = 3;

type DemoSpace = {
  membership: Membership;
};

type DemoAccount = {
  /** Téléphone et e-mail acceptés pour ce compte (03-APPFLOW §2 : « Téléphone ou e-mail »). */
  identifiers: string[];
  /** Un compte sans rattachement actif ne peut pas se connecter (F-AUTH-01). */
  active: boolean;
  user: SessionUser;
  spaces: DemoSpace[];
  /** `users.last_space_membership_id` au départ de la démonstration. */
  lastMembershipId: string | null;
};

const DC_KNOWING = 'DC-KNOWING CGA';
const DC_KNOWING_CONTACT = 'DC-KNOWING CGA · +225 27 20 00 00 00';

function membership(
  id: string,
  role: string,
  type: Membership['organization']['type'],
  name: string,
  options: { member?: { id: string; name: string }; unread?: number; banking?: boolean } = {},
): Membership {
  return {
    id,
    role,
    organization: {
      id: `org-${type}-${name}`,
      type,
      name,
      banking_enabled: options.banking ?? false,
    },
    member: options.member ?? null,
    unread_notifications: options.unread ?? 0,
  };
}

function user(
  firstName: string,
  lastName: string,
  phone: string,
  email: string | null,
  preferences = { sms: true, whatsapp: false },
): SessionUser {
  return {
    first_name: firstName,
    last_name: lastName,
    phone,
    email,
    notification_preferences: preferences,
  };
}

const demoAccounts: DemoAccount[] = [
  {
    identifiers: ['gerant@dc-knowing.ci', '+2250700000001'],
    active: true,
    user: user('Koffi', 'N’Guessan', '+2250700000001', 'gerant@dc-knowing.ci'),
    spaces: [
      {
        membership: membership('m-cga', 'cga_manager', 'cga', DC_KNOWING, { unread: 3 }),
      },
    ],
    lastMembershipId: 'm-cga',
  },
  {
    identifiers: ['presidente@cncga.ci', '+2250700000002'],
    active: true,
    user: user('Adjoua', 'Kouamé', '+2250700000002', 'presidente@cncga.ci'),
    spaces: [
      {
        membership: membership('m-cncga', 'cncga_president', 'cncga', 'CNCGA', { unread: 5 }),
      },
      {
        membership: membership('m-cga-2', 'cga_accountant_expert', 'cga', DC_KNOWING, {
          unread: 1,
        }),
      },
    ],
    lastMembershipId: 'm-cga-2',
  },
  {
    identifiers: ['secretaire@dc-knowing.ci', '+2250700000003'],
    active: true,
    user: user('Aya', 'Traoré', '+2250700000003', 'secretaire@dc-knowing.ci'),
    spaces: [
      {
        membership: membership('m-cga-3', 'cga_secretary', 'cga', DC_KNOWING),
      },
    ],
    lastMembershipId: null,
  },
  {
    identifiers: ['adherent@inc.ci', '+2250700000004'],
    active: true,
    user: user('Sery', 'Bamba', '+2250700000004', 'adherent@inc.ci', { sms: true, whatsapp: true }),
    spaces: [
      {
        membership: membership('m-member', 'member_owner', 'cga', DC_KNOWING, {
          member: { id: 'mem-1', name: 'INC SARL' },
          unread: 2,
        }),
      },
    ],
    lastMembershipId: null,
  },
  {
    identifiers: ['inactif@dc-knowing.ci'],
    active: false,
    user: user('Yao', 'Konan', '+2250700000005', 'inactif@dc-knowing.ci'),
    spaces: [],
    lastMembershipId: null,
  },
  {
    identifiers: ['admin@cga-connect.ci', '+2250700000006'],
    active: true,
    user: user('Éric', 'Diallo', '+2250700000006', 'admin@cga-connect.ci'),
    spaces: [
      {
        membership: membership('m-platform', 'platform_admin', 'platform', 'CGA Connect'),
      },
    ],
    lastMembershipId: null,
  },
];

/** Invitations de démonstration (F-AUTH-02) : un agent et un adhérent. */
const demoInvitations: Record<string, { account: DemoAccount; invitation: Invitation }> = {
  'invitation-agent': {
    account: demoAccounts[2],
    invitation: {
      status: 'valid',
      first_name: 'Aya',
      organization_name: DC_KNOWING,
      organization_contact: DC_KNOWING_CONTACT,
      role: 'cga_secretary',
      is_member: false,
    },
  },
  'invitation-adherent': {
    account: demoAccounts[3],
    invitation: {
      status: 'valid',
      first_name: 'Sery',
      organization_name: DC_KNOWING,
      organization_contact: DC_KNOWING_CONTACT,
      role: 'member_owner',
      is_member: true,
    },
  },
};

const EXPIRED_INVITATION: Invitation = {
  status: 'invalid',
  organization_contact: DC_KNOWING_CONTACT,
};

export function createFakeAuthApi(): AuthApi {
  const failures = new Map<string, number>();
  const codeAttempts = new Map<string, number>();
  // Dernier espace utilisé par compte, comme `users.last_space_membership_id`.
  const lastUsed = new Map<DemoAccount, string | null>(
    demoAccounts.map((account) => [account, account.lastMembershipId]),
  );
  // Copie de travail : les comptes de démonstration ne sont jamais modifiés d'une session à l'autre.
  let source: DemoAccount | null = null;
  let current: DemoAccount | null = null;
  let activeId: string | null = null;
  let pendingPhone: string | null = null;

  function spaceOf(account: DemoAccount, membershipId: string | null): DemoSpace | null {
    return account.spaces.find((space) => space.membership.id === membershipId) ?? null;
  }

  function sessionOf(account: DemoAccount): Session {
    const active = spaceOf(account, activeId);

    return {
      user: account.user,
      memberships: account.spaces.map((space) => space.membership),
      active_membership_id: active?.membership.id ?? null,
      last_membership_id: source === null ? null : (lastUsed.get(source) ?? null),
      // Droits effectifs du rôle, d'après la matrice par défaut du backend (`PermissionResolver`).
      permissions:
        active === null ? [] : [...(defaultRolePermissions[active.membership.role] ?? [])],
    };
  }

  function select(account: DemoAccount, membershipId: string): void {
    activeId = membershipId;

    if (source !== null) {
      lastUsed.set(source, membershipId);
    }

    current = account;
  }

  function openFor(account: DemoAccount, membershipId: string | null): Session {
    source = account;
    current = { ...account, user: { ...account.user } };
    activeId = null;

    // 03-APPFLOW §1 : un seul rattachement ouvre directement son espace.
    const opened =
      membershipId ?? (account.spaces.length === 1 ? account.spaces[0].membership.id : null);

    if (opened !== null) {
      select(current, opened);
    }

    return sessionOf(current);
  }

  function requireCurrent(): DemoAccount {
    if (current === null) {
      throw new Error('Aucune session ouverte.');
    }

    return current;
  }

  function checkCode(key: string, code: string): void {
    const used = codeAttempts.get(key) ?? 0;

    if (used >= MAX_CODE_ATTEMPTS) {
      throw new ApiBusinessError('expired_code');
    }

    if (code !== DEMO_CODE) {
      const attempts = used + 1;
      codeAttempts.set(key, attempts);
      const left = MAX_CODE_ATTEMPTS - attempts;

      throw left > 0
        ? new ApiBusinessError('wrong_code', { attempts_left: left })
        : new ApiBusinessError('expired_code');
    }

    codeAttempts.delete(key);
  }

  return {
    async login({ identifier, password }: Credentials): Promise<Session> {
      const key = identifier.trim().toLowerCase();

      if ((failures.get(key) ?? 0) >= MAX_ATTEMPTS) {
        throw new LoginError('too_many_attempts');
      }

      const account = demoAccounts.find((candidate) => candidate.identifiers.includes(key));

      if (account === undefined || password !== DEMO_PASSWORD) {
        const attempts = (failures.get(key) ?? 0) + 1;
        failures.set(key, attempts);

        throw new LoginError(
          attempts >= MAX_ATTEMPTS ? 'too_many_attempts' : 'invalid_credentials',
        );
      }

      failures.delete(key);

      if (!account.active) {
        throw new LoginError('inactive_account');
      }

      return openFor(account, null);
    },

    async currentSession(): Promise<Session | null> {
      return current === null ? null : sessionOf(current);
    },

    async chooseSpace(membershipId: string): Promise<Session> {
      const account = requireCurrent();

      if (spaceOf(account, membershipId) === null) {
        throw new Error('Rattachement inconnu pour cette session.');
      }

      select(account, membershipId);

      return sessionOf(account);
    },

    async logout(): Promise<void> {
      source = null;
      current = null;
      activeId = null;
    },

    async requestPasswordCode(identifier: string): Promise<void> {
      // A07 : aucune réponse différente selon que le compte existe ou non.
      codeAttempts.delete(`password:${identifier.trim().toLowerCase()}`);
    },

    async resetPassword({ identifier, code }): Promise<void> {
      checkCode(`password:${identifier.trim().toLowerCase()}`, code);
    },

    async readInvitation(token: string): Promise<Invitation> {
      return demoInvitations[token]?.invitation ?? EXPIRED_INVITATION;
    },

    async activate({ token }: ActivationInput): Promise<Session> {
      const invitation = demoInvitations[token];

      if (invitation === undefined) {
        throw new ApiBusinessError('invitation_invalid');
      }

      // L'espace actif est le rattachement de l'invitation (05-BACKEND-SCHEMA, flux d'authentification).
      return openFor(invitation.account, invitation.account.spaces[0].membership.id);
    },

    async updateProfile({ first_name, last_name, email }): Promise<Session> {
      const account = requireCurrent();
      account.user = { ...account.user, first_name, last_name, email };

      return sessionOf(account);
    },

    async changePassword({ current_password }): Promise<void> {
      requireCurrent();

      if (current_password !== DEMO_PASSWORD) {
        throw new ApiBusinessError('wrong_password');
      }
    },

    async requestPhoneCode(phone: string): Promise<void> {
      requireCurrent();
      pendingPhone = phone;
      codeAttempts.delete(`phone:${phone}`);
    },

    async confirmPhone({ phone, code }): Promise<Session> {
      const account = requireCurrent();
      checkCode(`phone:${phone}`, code);
      account.user = { ...account.user, phone: pendingPhone ?? phone };
      pendingPhone = null;

      return sessionOf(account);
    },

    async updatePreferences({ sms, whatsapp }): Promise<Session> {
      const account = requireCurrent();
      account.user = { ...account.user, notification_preferences: { sms, whatsapp } };

      return sessionOf(account);
    },
  };
}

export const fakeAuthApi = createFakeAuthApi();
