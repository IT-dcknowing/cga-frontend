/*
 * Réponses types du backend simulé (`api-server.ts` et ses modules par domaine), au format de
 * `BaseApiController` : message, code métier, détails, erreurs de validation par champ.
 */
export type ApiReply =
  { status: number; data?: unknown; headers?: Record<string, string> } | 'network-error';

export type Input = Record<string, unknown>;

export const unauthenticated: ApiReply = {
  status: 401,
  data: { message: 'Non authentifié.', code: 'unauthenticated' },
};

export const forbidden: ApiReply = {
  status: 403,
  data: { message: 'Vous n’avez pas le droit de faire cette action.', code: 'forbidden' },
};

export const notFound: ApiReply = {
  status: 404,
  data: { message: 'Élément introuvable.', code: 'not_found' },
};

export function invalid(errors: Record<string, string>): ApiReply {
  return {
    status: 422,
    data: {
      message: Object.values(errors)[0],
      errors: Object.fromEntries(Object.entries(errors).map(([field, text]) => [field, [text]])),
    },
  };
}

export function conflict(
  code: string,
  message: string,
  details: Record<string, unknown> = {},
): ApiReply {
  return { status: 409, data: { message, code, details } };
}

export function ok(data: unknown, status = 200): ApiReply {
  return { status, data: { data } };
}

/** Liste paginée (02-TRD §4.3), découpée selon `page` et `per_page` (100 au plus). */
export function paginated<T>(items: T[], query: URLSearchParams): ApiReply {
  const perPage = Math.min(Number(query.get('per_page') ?? '25'), 100);
  const page = Math.max(1, Number(query.get('page') ?? '1'));

  return {
    status: 200,
    data: {
      data: items.slice((page - 1) * perPage, page * perPage),
      meta: {
        current_page: page,
        per_page: perPage,
        total: items.length,
        last_page: Math.max(1, Math.ceil(items.length / perPage)),
      },
    },
  };
}

/** Texte d'un champ reçu, vide s'il manque. */
export function text(input: Input, field: string): string {
  return typeof input[field] === 'string' ? (input[field] as string).trim() : '';
}
