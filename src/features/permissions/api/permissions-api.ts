import type { Agent } from '@/features/cga-settings/api/cga-api';
import { withApiErrors } from '@/lib/api-errors';
import { config } from '@/lib/config';
import { http } from '@/lib/http';
import { SHOWN_BY_SCREEN, type ApiPage } from '@/lib/query';

/*
 * Droits par rôle (F-ADM-05, `/api/v1/{network|cga}/roles`) et habilitations par utilisateur
 * (RG-ROLE-07, « nuage », `/api/v1/cga/users/{agent}/permissions` et
 * `/api/v1/platform/network-users/{agent}/permissions`). Le serveur résout les droits dans l'ordre
 * verrou → ajustement de l'utilisateur → surcharge du CGA → réseau ; le frontend n'envoie que la
 * liste des droits cochés et affiche ce que le serveur renvoie.
 */
export type PermissionLevel = 'network' | 'cga';

export type RoleSummary = {
  role: string;
  label: string;
  users_count: number;
  granted_count: number;
  permissions_count: number;
  customized: boolean;
};

export type RolePermission = {
  code: string;
  label: string;
  granted: boolean;
  /** Valeur de référence : le réseau pour un CGA, le défaut pour le réseau. */
  reference: boolean;
  locked: boolean;
  customized: boolean;
};

export type PermissionModule<P> = { module: string; label: string; permissions: P[] };

export type RolePermissions = {
  role: string;
  label: string;
  level: PermissionLevel;
  modules: PermissionModule<RolePermission>[];
  users_count: number;
  /** Utilisateurs du rôle, pour un CGA seulement ; au réseau, un compteur. */
  users: { id: string; name: string; status: string }[] | null;
};

export type RoleImpact = {
  role: string;
  users_count: number;
  added: { code: string; label: string }[];
  removed: { code: string; label: string }[];
};

export type UserPermission = {
  code: string;
  label: string;
  module: string;
  granted: boolean;
  origin: string;
  /** Valeur donnée par le profil (rôle), sans ajustement de l'utilisateur. */
  profile: boolean;
  adjusted: boolean;
  locked: boolean;
};

export type UserPermissions = {
  user: { id: string; name: string };
  roles: { role: string; role_label: string }[];
  adjusted_count: number;
  modules: PermissionModule<UserPermission>[];
};

/** Espace des habilitations par utilisateur : agents du centre, ou utilisateurs du CNCGA. */
export type UserScope = 'cga' | 'network';

function rolePath(level: PermissionLevel, role?: string, action?: string): string {
  return [`/${level}/roles`, role === undefined ? null : encodeURIComponent(role), action]
    .filter((part) => part !== null && part !== undefined)
    .join('/');
}

function userPath(scope: UserScope, id: string, action?: string): string {
  const base =
    scope === 'cga'
      ? `/cga/users/${encodeURIComponent(id)}/permissions`
      : `/platform/network-users/${encodeURIComponent(id)}/permissions`;

  return action === undefined ? base : `${base}/${action}`;
}

/** Clés React Query des droits. */
export const permissionKeys = {
  roles: (level: PermissionLevel) => ['permissions', level, 'roles'] as const,
  role: (level: PermissionLevel, role: string) => ['permissions', level, 'roles', role] as const,
  user: (scope: string, id: string) => ['permissions', scope, 'users', id] as const,
  networkUsers: ['permissions', 'network', 'users'] as const,
};

export const permissionsApi = {
  async roles(level: PermissionLevel): Promise<RoleSummary[]> {
    const { data } = await http.get<{ data: RoleSummary[] }>(rolePath(level));

    return data.data;
  },

  async role(level: PermissionLevel, role: string): Promise<RolePermissions> {
    const { data } = await http.get<{ data: RolePermissions }>(
      rolePath(level, role, 'permissions'),
      { skipErrorToast: SHOWN_BY_SCREEN },
    );

    return data.data;
  },

  /** Effet d'un enregistrement avant de le faire : utilisateurs touchés, droits ajoutés, retirés. */
  impact: (level: PermissionLevel, role: string, granted: string[]) =>
    withApiErrors(async () => {
      const { data } = await http.get<{ data: RoleImpact }>(rolePath(level, role, 'impact'), {
        params: { permissions: granted },
      });

      return data.data;
    }),

  saveRole: (level: PermissionLevel, role: string, granted: string[]) =>
    withApiErrors(async () => {
      const { data } = await http.put<{ data: RolePermissions }>(
        rolePath(level, role, 'permissions'),
        { permissions: granted },
      );

      return data.data;
    }),

  resetRole: (level: PermissionLevel, role: string) =>
    withApiErrors(async () => {
      const { data } = await http.post<{ data: RolePermissions }>(
        rolePath(level, role, 'permissions/reset'),
      );

      return data.data;
    }),

  async user(scope: UserScope, id: string): Promise<UserPermissions> {
    const { data } = await http.get<{ data: UserPermissions }>(userPath(scope, id), {
      skipErrorToast: SHOWN_BY_SCREEN,
    });

    return data.data;
  },

  saveUser: (scope: UserScope, id: string, granted: string[], reason: string | null) =>
    withApiErrors(async () => {
      const { data } = await http.put<{ data: UserPermissions }>(userPath(scope, id), {
        permissions: granted,
        reason,
      });

      return data.data;
    }),

  /** Utilisateurs du CNCGA, pour leurs habilitations (administrateur de la plateforme). */
  async networkUsers(): Promise<Agent[]> {
    const { data } = await http.get<ApiPage<Agent>>('/platform/network-users', {
      params: { per_page: config.pageSizeMax },
    });

    return data.data;
  },

  resetUser: (scope: UserScope, id: string) =>
    withApiErrors(async () => {
      const { data } = await http.post<{ data: UserPermissions }>(userPath(scope, id, 'reset'));

      return data.data;
    }),
};
