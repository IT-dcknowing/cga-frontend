import { httpStatusOf } from '@/lib/api-errors';

/**
 * 403 et 404 d'une lecture : l'écran commun « Vous n'avez pas accès » ou « Élément introuvable »
 * remplace la page (03-APPFLOW §7), sans nouvel essai.
 */
export function isScreenError(error: unknown): boolean {
  const status = httpStatusOf(error);

  return status === 403 || status === 404;
}

/** Un seul nouvel essai d'une lecture qui échoue, sauf pour un refus ou une absence. */
export function retryUnlessScreenError(failureCount: number, error: unknown): boolean {
  return !isScreenError(error) && failureCount < 1;
}

/** Statuts d'une lecture montrés par l'écran commun plutôt que par un toast (`skipErrorToast`). */
export const SHOWN_BY_SCREEN = [403, 404];

/** Réponse d'un élément de l'API (`JsonResource`). */
export type ApiItem<T> = { data: T };

/** Réponse d'une liste paginée de l'API (02-TRD §4.3). */
export type ApiPage<T> = {
  data: T[];
  meta: { current_page: number; per_page: number; total: number; last_page: number };
};

/** Page d'une liste, telle que la lisent les écrans. */
export type ListPage<T> = {
  items: T[];
  total: number;
  page: number;
  perPage: number;
};

export function pageOf<T>({ data, meta }: ApiPage<T>): ListPage<T> {
  return { items: data, total: meta.total, page: meta.current_page, perPage: meta.per_page };
}
