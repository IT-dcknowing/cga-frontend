import type {
  PermissionModule,
  RolePermission,
  RolePermissions,
  RoleSummary,
  UserPermission,
  UserPermissions,
} from '@/features/permissions/api/permissions-api';
import { roleLabel } from '@/lib/reference/roles';
import { forbidden, notFound, ok, paginated, type ApiReply, type Input } from './api-replies';

/*
 * Droits par rôle et habilitations par utilisateur simulés, d'après `RolePermissionController`
 * (`RoleMatrix::values` : référence = réseau pour un CGA, défaut pour le réseau ; verrou), et
 * `UserPermissionController` (`UserPermissionCloud` : profil, ajustement de l'utilisateur).
 * Droits exigés : `cga_permissions.manage`, `network_permissions.manage`,
 * `cga_user_permissions.manage`, `network_user_permissions.manage`.
 */
type Context = { allows: (permission: string) => boolean };

type Definition = { code: string; label: string; module: string; locked: boolean };

const MODULES: Record<string, string> = { members: 'Adhérents', settings: 'Paramètres du centre' };

const CATALOG: Definition[] = [
  { code: 'members.view', label: 'Voir les adhérents', module: 'members', locked: false },
  { code: 'members.create', label: 'Inscrire un adhérent', module: 'members', locked: false },
  { code: 'members.import', label: 'Importer un portefeuille', module: 'members', locked: false },
  {
    code: 'cga.profile.manage',
    label: 'Modifier la fiche du centre',
    module: 'settings',
    locked: true,
  },
];

/** Droits de référence de chaque rôle (réseau pour un CGA, défaut pour le réseau). */
const REFERENCE: Record<string, string[]> = {
  cga_accountant: ['members.view', 'members.create'],
  cga_secretary: ['members.view', 'members.create', 'members.import'],
  cncga_manager: ['members.view'],
};

const LEVEL_ROLES: Record<string, string[]> = {
  cga: ['cga_accountant', 'cga_secretary'],
  network: ['cncga_manager', 'cga_accountant', 'cga_secretary'],
};

const HOLDERS: Record<string, { id: string; name: string; status: string }[]> = {
  cga_accountant: [
    { id: '01usr000000000000000adjoua', name: 'Adjoua Comptable', status: 'active' },
    { id: '01usr00000000000000kouassi', name: 'Kouassi Désactivé', status: 'disabled' },
  ],
  cga_secretary: [{ id: '01usr0000000000000000fatou', name: 'Fatou Invitée', status: 'invited' }],
  cncga_manager: [{ id: '01usr000000000000000000yao', name: 'Yao Multi-rôles', status: 'active' }],
};

function byModule<P extends { code: string }>(rows: P[]): PermissionModule<P>[] {
  return Object.entries(MODULES)
    .map(([module, label]) => ({
      module,
      label,
      permissions: rows.filter(
        (row) => CATALOG.find((item) => item.code === row.code)?.module === module,
      ),
    }))
    .filter((module) => module.permissions.length > 0);
}

/** Les droits d'une liste reçue (`permissions[]` en lecture, `permissions` en écriture). */
function granted(input: Input | URLSearchParams): string[] {
  if (input instanceof URLSearchParams) {
    return input.getAll('permissions[]');
  }

  return Array.isArray(input.permissions) ? (input.permissions as string[]) : [];
}

export function createPermissionsBackend() {
  // Droits accordés par niveau et par rôle ; un CGA démarre personnalisé pour la secrétaire.
  const grants: Record<string, Record<string, Set<string>>> = {
    cga: {
      cga_accountant: new Set(REFERENCE.cga_accountant),
      cga_secretary: new Set(['members.view']),
    },
    network: {
      cncga_manager: new Set(REFERENCE.cncga_manager),
      cga_accountant: new Set(REFERENCE.cga_accountant),
      cga_secretary: new Set(REFERENCE.cga_secretary),
    },
  };
  // Ajustements individuels : agent → droit → accordé ou retiré.
  const adjustments: Record<string, Record<string, boolean>> = {
    '01usr000000000000000adjoua': { 'members.import': true },
  };

  function values(level: string, role: string): RolePermission[] {
    return CATALOG.map(({ code, label, locked }) => {
      const reference = REFERENCE[role].includes(code) || (locked && role === 'cga_manager');
      const isGranted = locked ? reference : grants[level][role].has(code);

      return {
        code,
        label,
        granted: isGranted,
        reference,
        locked,
        customized: isGranted !== reference,
      };
    });
  }

  function payload(level: string, role: string): RolePermissions {
    return {
      role,
      label: roleLabel(role),
      level: level as RolePermissions['level'],
      modules: byModule(values(level, role)),
      users_count: HOLDERS[role].length,
      users: level === 'cga' ? HOLDERS[role] : null,
    };
  }

  function summaries(level: string): RoleSummary[] {
    return LEVEL_ROLES[level].map((role) => {
      const rows = values(level, role);

      return {
        role,
        label: roleLabel(role),
        users_count: HOLDERS[role].length,
        granted_count: rows.filter((row) => row.granted).length,
        permissions_count: rows.length,
        customized: rows.some((row) => row.customized),
      };
    });
  }

  function roleRoute(
    level: string,
    method: string,
    rest: string,
    query: URLSearchParams,
    input: Input,
    context: Context,
  ): ApiReply | undefined {
    if (!context.allows(`${level}_permissions.manage`)) {
      return forbidden;
    }

    if (rest === '' && method === 'GET') {
      return ok(summaries(level));
    }

    const match = /^\/([a-z_]+)\/(permissions|permissions\/reset|impact)$/.exec(rest);

    if (match === null) {
      return undefined;
    }

    const [, role, action] = match;

    if (!LEVEL_ROLES[level].includes(role)) {
      return notFound;
    }

    if (action === 'permissions' && method === 'GET') {
      return ok(payload(level, role));
    }

    const editable = CATALOG.filter((item) => !item.locked).map((item) => item.code);

    if (action === 'impact' && method === 'GET') {
      const wanted = granted(query).filter((code) => editable.includes(code));
      const current = [...grants[level][role]].filter((code) => editable.includes(code));
      const describe = (codes: string[]) =>
        codes.map((code) => ({
          code,
          label: CATALOG.find((item) => item.code === code)?.label ?? code,
        }));

      return ok({
        role,
        users_count: HOLDERS[role].length,
        added: describe(wanted.filter((code) => !current.includes(code))),
        removed: describe(current.filter((code) => !wanted.includes(code))),
      });
    }

    if (action === 'permissions' && method === 'PUT') {
      grants[level][role] = new Set(granted(input).filter((code) => editable.includes(code)));

      return ok(payload(level, role));
    }

    if (action === 'permissions/reset' && method === 'POST') {
      grants[level][role] = new Set(REFERENCE[role]);

      return ok(payload(level, role));
    }

    return undefined;
  }

  function cloud(level: string, id: string, name: string, role: string): UserPermissions {
    const rows: UserPermission[] = values(level, role).map((row) => {
      const adjusted = adjustments[id]?.[row.code];
      const isGranted = row.locked || adjusted === undefined ? row.granted : adjusted;

      return {
        code: row.code,
        label: row.label,
        module: CATALOG.find((item) => item.code === row.code)?.module ?? '',
        granted: isGranted,
        origin: adjusted === undefined || row.locked ? 'role' : 'user',
        profile: row.granted,
        adjusted: adjusted !== undefined && !row.locked,
        locked: row.locked,
      };
    });

    return {
      user: { id, name },
      roles: [{ role, role_label: roleLabel(role) }],
      adjusted_count: rows.filter((row) => row.adjusted).length,
      modules: byModule(rows),
    };
  }

  function userRoute(
    scope: string,
    method: string,
    id: string,
    action: string | undefined,
    input: Input,
    context: Context,
  ): ApiReply | undefined {
    if (!context.allows(`${scope}_user_permissions.manage`)) {
      return forbidden;
    }

    const holder = Object.entries(HOLDERS)
      .flatMap(([role, list]) => list.map((item) => ({ ...item, role })))
      .find((item) => item.id === id);

    if (holder === undefined) {
      return notFound;
    }

    if (method === 'GET' && action === undefined) {
      return ok(cloud(scope, id, holder.name, holder.role));
    }

    if (method === 'PUT' && action === undefined) {
      const wanted = granted(input);
      const profile = values(scope, holder.role);

      adjustments[id] = Object.fromEntries(
        profile
          .filter((row) => !row.locked && wanted.includes(row.code) !== row.granted)
          .map((row) => [row.code, wanted.includes(row.code)]),
      );

      return ok(cloud(scope, id, holder.name, holder.role));
    }

    if (method === 'POST' && action === 'reset') {
      adjustments[id] = {};

      return ok(cloud(scope, id, holder.name, holder.role));
    }

    return undefined;
  }

  /** Routes des droits ; `undefined` pour une autre route. */
  function route(
    method: string,
    path: string,
    query: URLSearchParams,
    body: unknown,
    context: Context,
  ): ApiReply | undefined {
    const input = (body ?? {}) as Input;
    const roles = /^\/(cga|network)\/roles(.*)$/.exec(path);

    if (roles !== null) {
      return roleRoute(roles[1], method, roles[2], query, input, context);
    }

    const cgaUser = /^\/cga\/users\/([^/]+)\/permissions(?:\/(reset))?$/.exec(path);

    if (cgaUser !== null) {
      return userRoute('cga', method, cgaUser[1], cgaUser[2], input, context);
    }

    // Utilisateurs du CNCGA (`UserPermissionController::networkUsers`, `AgentResource`).
    if (method === 'GET' && path === '/platform/network-users') {
      return context.allows('network_user_permissions.manage')
        ? paginated(
            HOLDERS.cncga_manager.map((holder) => ({
              ...holder,
              first_name: holder.name.split(' ')[0],
              last_name: holder.name.split(' ').slice(1).join(' '),
              phone: '+2250700000003',
              email: null,
              status_label: 'Actif',
              roles: [
                { role: 'cncga_manager', role_label: roleLabel('cncga_manager'), status: 'active' },
              ],
              last_login_at: null,
              invitation: null,
              can: { update_roles: true, disable: true, enable: false, resend_invitation: false },
            })),
            query,
          )
        : forbidden;
    }

    const networkUser = /^\/platform\/network-users\/([^/]+)\/permissions(?:\/(reset))?$/.exec(
      path,
    );

    if (networkUser !== null) {
      return userRoute('network', method, networkUser[1], networkUser[2], input, context);
    }

    return undefined;
  }

  return {
    route,
    /** Droits accordés d'un rôle à un niveau. */
    granted: (level: 'cga' | 'network', role: string) => [...grants[level][role]],
  };
}
