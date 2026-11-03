import type { CatalogImpact, CatalogVersion } from '@/features/obligations/api/catalog-api';
import { formInput } from './api-member-records';
import { forbidden, invalid, notFound, ok, text, type ApiReply } from './api-replies';

/*
 * Catalogue national simulé, d'après `ObligationCatalogController` (`CatalogVersionResource`,
 * `CatalogImpactResource`) : versions chargées, aperçu d'un fichier (contrôlé puis gardé), application
 * du fichier analysé, validation d'une version provisoire. Droit : `referentials.manage`.
 */
type Context = { allows: (permission: string) => boolean };

export const CATALOG_FILE_ID = '01fil0000000000000000cat01';

export function demoCatalogVersions(): CatalogVersion[] {
  return [
    {
      version: '2026.1',
      count: 7,
      provisional_count: 7,
      status: 'provisional',
      in_force: true,
      loaded_at: '2026-01-05T08:00:00Z',
      validated_at: null,
    },
    {
      version: '2025.2',
      count: 6,
      provisional_count: 0,
      status: 'validated',
      in_force: false,
      loaded_at: '2025-07-01T08:00:00Z',
      validated_at: '2025-07-10T08:00:00Z',
    },
  ];
}

const IMPACT: CatalogImpact = {
  file_id: CATALOG_FILE_ID,
  version: '2026.2',
  types: {
    added: ['PAT2'],
    removed: ['IME'],
    changed: [{ code: 'TEE', fields: ['due_rule'] }],
    unchanged: 4,
  },
  members: {
    suggested: 12,
    withdrawn: 3,
    ended: 2,
    rescheduled: 40,
    members: 55,
    organizations: 3,
  },
};

export function createCatalogBackend(initial: CatalogVersion[] = demoCatalogVersions()) {
  let versions = initial;
  let analysed: string | null = null;

  function route(
    method: string,
    path: string,
    body: unknown,
    context: Context,
  ): ApiReply | undefined {
    if (!path.startsWith('/network/obligation-catalog')) {
      return undefined;
    }
    if (!context.allows('referentials.manage')) {
      return forbidden;
    }
    if (method === 'GET' && path === '/network/obligation-catalog') {
      return ok(versions);
    }
    if (path === '/network/obligation-catalog/preview') {
      const file = formInput(body).file;

      if (!(file instanceof File)) {
        return invalid({ file: 'Le champ fichier est obligatoire.' });
      }
      if (!file.name.endsWith('.json')) {
        return invalid({ file: 'Le fichier doit être un catalogue JSON.' });
      }
      if (file.name.includes('invalide')) {
        return invalid({ file: 'Le catalogue est illisible : la clé « version » manque.' });
      }
      analysed = CATALOG_FILE_ID;

      return ok(IMPACT);
    }
    if (path === '/network/obligation-catalog/apply') {
      const fileId = text((body ?? {}) as Record<string, unknown>, 'file_id');

      if (fileId === '' || fileId !== analysed) {
        return notFound;
      }
      versions = [
        {
          version: IMPACT.version,
          count: 7,
          provisional_count: 7,
          status: 'provisional',
          in_force: true,
          loaded_at: '2026-11-03T10:00:00Z',
          validated_at: null,
        },
        ...versions.map((item) => ({ ...item, in_force: false })),
      ];

      return ok({
        version: IMPACT.version,
        loaded: 7,
        suggested: 12,
        withdrawn: 3,
        ended: 2,
        rescheduled: 40,
      });
    }
    const validated = /^\/network\/obligation-catalog\/([^/]+)\/validate$/.exec(path);
    const target = versions.find((item) => item.version === validated?.[1]);

    if (target === undefined) {
      return notFound;
    }
    versions = versions.map((item) =>
      item.version === target.version
        ? {
            ...item,
            provisional_count: 0,
            status: 'validated',
            validated_at: '2026-11-03T10:00:00Z',
          }
        : item,
    );

    return ok({ version: target.version, validated: target.provisional_count });
  }

  return { route, versions: () => versions };
}
