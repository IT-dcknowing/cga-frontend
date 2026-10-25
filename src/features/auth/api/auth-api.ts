import axios from 'axios';
import { ApiBusinessError, httpStatusOf, withApiErrors } from '@/lib/api-errors';
import { fetchCsrfCookie, http } from '@/lib/http';

/**
 * Rattachement de l'utilisateur à un espace, tel que le renverra `GET /api/v1/me`
 * (02-TRD §6.2 ; colonnes de `memberships`, 05-BACKEND-SCHEMA §2).
 */
export type Membership = {
  id: string;
  /** Rôle de la liste CHECK de `memberships.role` : `platform_admin`, `cncga_*`, `cga_*`, `member_*`. */
  role: string;
  organization: {
    id: string;
    type: 'platform' | 'cncga' | 'cga';
    name: string;
    /** `organizations.banking_enabled` (RG-BNK-00) : le module Bancabilité n'apparaît que s'il est activé. */
    banking_enabled: boolean;
  };
  /** Adhérent représenté, pour les rôles `member_*` (« INC SARL — Adhérent », F-AUTH-04). */
  member: { id: string; name: string } | null;
  /** Compteur affiché sur la carte du sélecteur d'espace (03-APPFLOW §2). */
  unread_notifications: number;
};

export type SessionUser = {
  first_name: string;
  last_name: string;
  /** Obligatoire (RG-ACC-01) : c'est l'identifiant principal du compte. */
  phone: string;
  email: string | null;
  /** Préférences d'information, propres aux adhérents (F-AUTH-05, RG-NOT-04). */
  notification_preferences: {
    sms: boolean;
    whatsapp: boolean;
  };
};

/**
 * Session ouverte, telle que la renverra `GET /api/v1/me` : l'utilisateur, ses rattachements, le
 * rattachement actif enregistré en session serveur et les **droits effectifs** de cet espace,
 * résolus par le serveur (02-TRD §6.2 ; RG-ROLE-07 : jamais déduits du rôle par le frontend).
 */
export type Session = {
  user: SessionUser;
  memberships: Membership[];
  active_membership_id: string | null;
  /** `users.last_space_membership_id` : présélection du sélecteur d'espace (03-APPFLOW §1). */
  last_membership_id: string | null;
  permissions: string[];
};

export type Credentials = {
  identifier: string;
  password: string;
};

/** Invitation lue depuis son jeton (F-AUTH-02, 03-APPFLOW §2). */
export type Invitation =
  | {
      status: 'valid';
      first_name: string;
      organization_name: string;
      organization_contact: string;
      role: string;
      /** Un adhérent choisit en plus ses consentements SMS / WhatsApp. */
      is_member: boolean;
    }
  | {
      status: 'invalid';
      /** Contact de l'organisation qui invite, affiché avec « Ce lien n'est plus valide ». */
      organization_contact: string | null;
    };

export type ActivationInput = {
  token: string;
  password: string;
  accepted_terms: boolean;
  sms_opt_in: boolean;
  whatsapp_opt_in: boolean;
};

export type ProfileInput = {
  first_name: string;
  last_name: string;
  email: string | null;
};

export type AuthApi = {
  /** Ouvre la session et renvoie l'état de `/me`. */
  login(credentials: Credentials): Promise<Session>;
  /** Relit `/me` au chargement de l'application ; `null` sans session ouverte. */
  currentSession(): Promise<Session | null>;
  /** `POST /api/v1/me/space` : enregistre l'espace actif et renvoie les droits qui vont avec. */
  chooseSpace(membershipId: string): Promise<Session>;
  logout(): Promise<void>;
  /** F-AUTH-03 : la réponse ne révèle jamais si le compte existe (A07). */
  requestPasswordCode(identifier: string): Promise<void>;
  resetPassword(input: { identifier: string; code: string; password: string }): Promise<void>;
  readInvitation(token: string): Promise<Invitation>;
  activate(input: ActivationInput): Promise<Session>;
  updateProfile(input: ProfileInput): Promise<Session>;
  changePassword(input: { current_password: string; password: string }): Promise<void>;
  /** F-AUTH-05 : un changement de numéro est confirmé par un code envoyé au nouveau numéro. */
  requestPhoneCode(phone: string): Promise<void>;
  confirmPhone(input: { phone: string; code: string }): Promise<Session>;
  updatePreferences(input: { sms: boolean; whatsapp: boolean }): Promise<Session>;
};

/** Causes d'échec de la connexion ; `unexpected` couvre l'erreur serveur ou réseau (03-APPFLOW §7). */
export type LoginFailure =
  'invalid_credentials' | 'too_many_attempts' | 'inactive_account' | 'unexpected';

export class LoginError extends Error {
  readonly reason: LoginFailure;

  /** `cause` garde l'erreur d'origine : la page sait si un toast l'a déjà signalée. */
  constructor(reason: LoginFailure, options?: ErrorOptions) {
    super(reason, options);
    this.name = 'LoginError';
    this.reason = reason;
  }
}

/** Nombre d'essais restants porté par un conflit `wrong_code`, quand l'API le fournit. */
export function attemptsLeftOf(error: unknown): number | null {
  if (!(error instanceof ApiBusinessError)) {
    return null;
  }

  const left = error.details.attempts_left;

  return typeof left === 'number' ? left : null;
}

/**
 * Traduction du code HTTP en cause d'échec (02-TRD §4.4) : 429 pour la limitation des essais
 * (§6.1 : 5 échecs / 15 min), 403 pour un compte sans rattachement actif (F-AUTH-01), 401 et 422
 * pour des identifiants refusés. Le serveur reste seul juge : l'écran ne compte rien lui-même.
 */
export function loginFailureFor(status: number | undefined): LoginFailure {
  if (status === 429) {
    return 'too_many_attempts';
  }

  if (status === 403) {
    return 'inactive_account';
  }

  if (status === 401 || status === 422) {
    return 'invalid_credentials';
  }

  return 'unexpected';
}

// Sanctum en mode SPA : cookie CSRF, puis connexion (02-TRD §6.1). Aucun jeton stocké par le navigateur.

/** Identifiants refusés, accès inactif, trop d'essais : messages de la page de connexion (03-APPFLOW §2). */
const LOGIN_FAILURES_SHOWN_ON_PAGE = [401, 403, 422, 429];

async function fetchSession(): Promise<Session> {
  const { data } = await http.get<{ data: Session }>('/me');

  return data.data;
}

async function chooseSpace(membershipId: string): Promise<Session> {
  await http.post('/me/space', { membership_id: membershipId });

  return await fetchSession();
}

/**
 * 03-APPFLOW §1 : un seul rattachement actif ouvre directement son espace. Si le serveur ne l'a pas
 * déjà fait, le frontend l'enregistre par `POST /me/space` — le serveur reste juge du rattachement.
 */
async function withSingleSpaceOpened(session: Session): Promise<Session> {
  if (session.active_membership_id === null && session.memberships.length === 1) {
    return await chooseSpace(session.memberships[0].id);
  }

  return session;
}

export const httpAuthApi: AuthApi = {
  async login(credentials: Credentials): Promise<Session> {
    try {
      await fetchCsrfCookie();
      await http.post(
        '/auth/login',
        { identifier: credentials.identifier, password: credentials.password },
        { skipErrorToast: LOGIN_FAILURES_SHOWN_ON_PAGE },
      );

      return await withSingleSpaceOpened(await fetchSession());
    } catch (error) {
      throw new LoginError(
        axios.isAxiosError(error) ? loginFailureFor(httpStatusOf(error)) : 'unexpected',
        { cause: error },
      );
    }
  },

  async currentSession(): Promise<Session | null> {
    try {
      return await fetchSession();
    } catch (error) {
      if (httpStatusOf(error) === 401) {
        return null;
      }

      throw error;
    }
  },

  chooseSpace,

  async logout(): Promise<void> {
    await http.post('/auth/logout');
  },

  async requestPasswordCode(identifier: string): Promise<void> {
    await fetchCsrfCookie();
    await withApiErrors(() => http.post('/auth/password/code', { identifier }));
  },

  async resetPassword(input): Promise<void> {
    await withApiErrors(() => http.post('/auth/password/reset', input));
  },

  async readInvitation(token: string): Promise<Invitation> {
    try {
      const { data } = await http.get<{ data: Invitation }>(
        `/auth/invitations/${encodeURIComponent(token)}`,
      );

      return data.data;
    } catch (error) {
      // 404 : jeton inconnu, expiré ou déjà utilisé — même écran, sans en dire plus (A07).
      if (httpStatusOf(error) === 404) {
        return { status: 'invalid', organization_contact: null };
      }

      throw error;
    }
  },

  async activate({ token, ...input }: ActivationInput): Promise<Session> {
    await fetchCsrfCookie();
    await withApiErrors(() =>
      http.post(`/auth/invitations/${encodeURIComponent(token)}/accept`, input),
    );

    return await fetchSession();
  },

  async updateProfile(input): Promise<Session> {
    await withApiErrors(() => http.patch('/me', input));

    return await fetchSession();
  },

  async changePassword(input): Promise<void> {
    await withApiErrors(() => http.post('/me/password', input));
  },

  async requestPhoneCode(phone: string): Promise<void> {
    await withApiErrors(() => http.post('/me/phone/code', { phone }));
  },

  async confirmPhone(input): Promise<Session> {
    await withApiErrors(() => http.post('/me/phone', input));

    return await fetchSession();
  },

  async updatePreferences(input): Promise<Session> {
    await withApiErrors(() => http.patch('/me/preferences', input));

    return await fetchSession();
  },
};
