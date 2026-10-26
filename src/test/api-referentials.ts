import {
  conflict,
  forbidden,
  invalid,
  notFound,
  ok,
  paginated,
  text,
  type ApiReply,
  type Input,
} from './api-replies';

/*
 * Référentiels nationaux simulés, d'après les contrôleurs `…Controller` des référentiels
 * (`SaveReferential`, `DeleteReferential` : 409 `referential_in_use`, `MergeReferential` : cible
 * active, validée pour un secteur, même DR pour un CDI). Écriture avec `referentials.manage`.
 */
type Context = { allows: (permission: string) => boolean };

type Row = Record<string, unknown> & { id: string | number };

const can = { update: true, delete: true };

const abidjan = {
  id: '01dr0000000000000000000001',
  code: 'DEMO-ABJ',
  name: 'DR Abidjan (démonstration)',
};

function seed(): Record<string, Row[]> {
  return {
    'regional-directorates': [
      {
        ...abidjan,
        geo_key: null,
        active: true,
        data_status: 'provisional',
        validated_at: null,
        can,
      },
      {
        id: '01dr0000000000000000000002',
        code: 'DEMO-BKE',
        name: 'DR Bouaké (démonstration)',
        geo_key: null,
        active: true,
        data_status: 'validated',
        validated_at: '2026-01-01T00:00:00Z',
        can,
      },
    ],
    'tax-offices': [
      {
        id: '01cdi000000000000000000001',
        code: 'CDI-PLT',
        name: 'CDI Plateau (démonstration)',
        regional_directorate: abidjan,
        active: true,
        data_status: 'provisional',
        validated_at: null,
        can: { update: true, delete: false },
      },
      {
        id: '01cdi000000000000000000003',
        code: 'CDI-CCD',
        name: 'CDI Cocody (démonstration)',
        regional_directorate: abidjan,
        active: true,
        data_status: 'provisional',
        validated_at: null,
        can,
      },
    ],
    communes: [
      {
        id: '01com000000000000000000001',
        name: 'Cocody (démonstration)',
        regional_directorate_id: abidjan.id,
        data_status: 'provisional',
        validated_at: null,
        can,
      },
    ],
    sectors: [
      {
        id: '01sec000000000000000000001',
        code: 'COM',
        name: 'Commerce',
        status: 'validated',
        status_label: 'Validé',
        merged_into_id: null,
        data_status: 'validated',
        validated_at: '2026-01-01T00:00:00Z',
        can: { update: true, delete: false },
      },
      {
        id: '01sec000000000000000000009',
        code: 'BTQ',
        name: 'Boutique de quartier',
        status: 'proposed',
        status_label: 'Proposé',
        merged_into_id: null,
        data_status: 'provisional',
        validated_at: null,
        can,
      },
    ],
    'national-references': [
      {
        id: '01ref000000000000000002025',
        year: 2025,
        domestic_tax_revenue: 5_000_000_000_000,
        nominal_gdp: 45_000_000_000_000,
        tax_revenue_source: 'DGI',
        gdp_source: 'INS',
        data_status: 'provisional',
        validated_at: null,
        can,
      },
    ],
    holidays: [
      { id: 1, date: '2026-08-07', label: 'Fête de l’indépendance', can },
      { id: 2, date: '2026-12-25', label: 'Noël', can },
    ],
  };
}

/** Champs exigés par `…Request`. */
const REQUIRED: Record<string, string[]> = {
  'regional-directorates': ['code', 'name'],
  'tax-offices': ['regional_directorate_id', 'code', 'name'],
  communes: ['name'],
  sectors: ['code', 'name'],
  'national-references': ['year'],
  holidays: ['date', 'label'],
};

/** Champ unique de chaque référentiel. */
const UNIQUE: Record<string, string> = {
  'regional-directorates': 'code',
  'tax-offices': 'code',
  communes: 'name',
  sectors: 'code',
  'national-references': 'year',
  holidays: 'date',
};

export function createReferentialsBackend() {
  const data = seed();
  let nextId = 0;

  function sortRows(rows: Row[], sort: string | null): Row[] {
    if (sort === null) {
      return rows;
    }

    const field = sort.replace(/^-/, '');
    const direction = sort.startsWith('-') ? -1 : 1;

    return [...rows].sort(
      (a, b) => String(a[field]).localeCompare(String(b[field]), 'fr') * direction,
    );
  }

  function list(uri: string, query: URLSearchParams): ApiReply {
    const search = (query.get('filter[search]') ?? '').toLocaleLowerCase('fr');

    if (uri === 'national-references' && query.has('filter[search]')) {
      return invalid({ filter: 'Le filtre search n’est pas permis.' });
    }

    const rows = data[uri].filter(
      (row) =>
        search === '' ||
        `${String(row.name ?? row.label ?? '')} ${String(row.code ?? '')}`
          .toLocaleLowerCase('fr')
          .includes(search),
    );

    return paginated(sortRows(rows, query.get('sort')), query);
  }

  function save(uri: string, id: string | null, input: Input, context: Context): ApiReply {
    if (!context.allows('referentials.manage')) {
      return forbidden;
    }

    const errors: Record<string, string> = {};

    for (const field of REQUIRED[uri]) {
      if (
        input[field] === null ||
        input[field] === undefined ||
        text({ [field]: String(input[field]) }, field) === ''
      ) {
        errors[field] = `Le champ ${field} est obligatoire.`;
      }
    }

    const unique = UNIQUE[uri];

    if (
      data[uri].some(
        (row) =>
          String(row.id) !== id && row[unique] === input[unique] && input[unique] !== undefined,
      )
    ) {
      errors[unique] = 'Cette valeur existe déjà.';
    }

    if (Object.keys(errors).length > 0) {
      return invalid(errors);
    }

    const current = data[uri].find((row) => String(row.id) === id);

    if (id !== null && current === undefined) {
      return notFound;
    }

    const extra: Record<string, unknown> =
      uri === 'tax-offices'
        ? {
            regional_directorate: seed()['regional-directorates'].find(
              (row) => row.id === input.regional_directorate_id,
            ),
          }
        : uri === 'sectors' && current === undefined
          ? { status: 'validated', status_label: 'Validé', merged_into_id: null }
          : {};
    const saved: Row = {
      data_status: 'provisional',
      validated_at: null,
      can,
      ...current,
      ...input,
      ...extra,
      id:
        current?.id ??
        (uri === 'holidays' ? 100 + ++nextId : `01new9${String(++nextId).padStart(20, '0')}`),
    };

    data[uri] =
      current === undefined
        ? [...data[uri], saved]
        : data[uri].map((row) => (row === current ? saved : row));

    return ok(saved, current === undefined ? 201 : 200);
  }

  function remove(uri: string, id: string, context: Context): ApiReply {
    if (!context.allows('referentials.manage')) {
      return forbidden;
    }

    const current = data[uri].find((row) => String(row.id) === id);

    if (current === undefined) {
      return notFound;
    }

    if (!(current.can as { delete: boolean }).delete) {
      return conflict(
        'referential_in_use',
        'Cette valeur est déjà utilisée : elle ne peut pas être supprimée. Désactivez-la ou fusionnez-la plutôt.',
      );
    }

    data[uri] = data[uri].filter((row) => row !== current);

    return { status: 204 };
  }

  function merge(uri: string, id: string, input: Input, context: Context): ApiReply {
    if (!context.allows('referentials.manage')) {
      return forbidden;
    }

    const source = data[uri].find((row) => String(row.id) === id);
    const target = data[uri].find((row) => row.id === input.into_id);

    if (source === undefined || target === undefined) {
      return invalid({ into_id: 'La valeur cible est introuvable.' });
    }

    if (uri === 'sectors') {
      data[uri] = data[uri].map((row) =>
        row === source
          ? { ...row, status: 'merged', status_label: 'Fusionné', merged_into_id: target.id }
          : row,
      );
    } else {
      data[uri] = data[uri].filter((row) => row !== source);
    }

    return ok(target);
  }

  /** Routes `/referentials/{uri}…` ; `undefined` pour une autre route. */
  function route(
    method: string,
    path: string,
    query: URLSearchParams,
    body: unknown,
    context: Context,
  ): ApiReply | undefined {
    const match = /^\/referentials\/([a-z-]+)(?:\/([^/]+))?(?:\/(merge))?$/.exec(path);

    if (match === null || !(match[1] in data)) {
      return undefined;
    }

    const [, uri, id, action] = match;
    const input = (body ?? {}) as Input;

    if (method === 'GET' && id === undefined) {
      return list(uri, query);
    }

    if (method === 'POST' && id === undefined) {
      return save(uri, null, input, context);
    }

    if (method === 'PUT' && id !== undefined) {
      return save(uri, id, input, context);
    }

    if (method === 'DELETE' && id !== undefined) {
      return remove(uri, id, context);
    }

    if (method === 'POST' && action === 'merge') {
      return merge(uri, id, input, context);
    }

    return undefined;
  }

  return {
    route,
    /** Valeurs d'un référentiel dans leur état courant. */
    rows: (uri: string) => data[uri],
  };
}
