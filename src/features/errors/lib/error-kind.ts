import { isRouteErrorResponse } from 'react-router';
import { httpStatusOf } from '@/lib/api-errors';

/** Écrans d'erreur communs (03-APPFLOW §7). */
export type ErrorKind = 'forbidden' | 'notFound' | 'unexpected';

/** Écran à afficher pour une erreur levée pendant l'affichage d'une route (API ou routeur). */
export function errorKindOf(error: unknown): ErrorKind {
  const status = isRouteErrorResponse(error) ? error.status : httpStatusOf(error);

  if (status === 403) {
    return 'forbidden';
  }

  if (status === 404) {
    return 'notFound';
  }

  return 'unexpected';
}
