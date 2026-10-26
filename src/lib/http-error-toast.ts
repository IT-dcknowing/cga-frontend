import axios from 'axios';
import { toast } from 'sonner';
import { fr } from '@/lib/i18n/fr';

/*
 * Toast pour chaque appel à l'API qui échoue (03-APPFLOW §7). Restent sans toast global : 401
 * (session expirée), 409 (conflit affiché par l'écran), 422 (messages sous les champs), et les
 * statuts qu'une requête exclut par `skipErrorToast` parce que son écran les affiche déjà.
 * La trace d'une erreur reste dans la console : le toast ne montre que le message de l'API.
 */

const SILENT_STATUSES: ReadonlySet<number> = new Set([401, 409, 422]);
const DESCRIPTION_MAX_LENGTH = 200;

export type ErrorToast = {
  /** Même erreur, même identifiant : Sonner remplace le toast au lieu d'en empiler un autre. */
  id: string;
  title: string;
  description?: string;
};

/** Erreurs déjà signalées par un toast du client de l'API. */
const notifiedErrors = new WeakSet<object>();

function titleFor(status: number | undefined): string {
  const titles = fr.errors.http;

  if (status === undefined) {
    return titles.network;
  }

  const byStatus: Record<number, string> = {
    400: titles.badRequest,
    403: titles.forbidden,
    404: titles.notFound,
    405: titles.methodNotAllowed,
    419: titles.csrfExpired,
    429: titles.tooManyRequests,
    503: titles.serviceUnavailable,
  };

  return byStatus[status] ?? (status >= 500 ? titles.server : fr.errors.unexpected);
}

/** Message de l'API (`{ message, code }`), raccourci, suivi de son code ; rien s'il répète le titre. */
function descriptionOf(data: unknown, title: string): string | undefined {
  if (typeof data !== 'object' || data === null) {
    return undefined;
  }

  const { message, code } = data as { message?: unknown; code?: unknown };
  const text =
    typeof message === 'string' && message !== title
      ? message.length > DESCRIPTION_MAX_LENGTH
        ? `${message.slice(0, DESCRIPTION_MAX_LENGTH)}…`
        : message
      : '';
  const description = [text, typeof code === 'string' ? `[${code}]` : '']
    .filter((part) => part !== '')
    .join(' ');

  return description === '' ? undefined : description;
}

function isSkipped(skip: boolean | number[] | undefined, status: number | undefined): boolean {
  return skip === true || (Array.isArray(skip) && status !== undefined && skip.includes(status));
}

/** Toast à afficher pour une erreur d'appel à l'API, ou `null` quand l'écran s'en charge. */
export function errorToastFor(error: unknown): ErrorToast | null {
  if (!axios.isAxiosError(error) || axios.isCancel(error)) {
    return null;
  }

  const status = error.response?.status;

  if (
    (status !== undefined && SILENT_STATUSES.has(status)) ||
    isSkipped(error.config?.skipErrorToast, status)
  ) {
    return null;
  }

  const title = titleFor(status);
  const method = (error.config?.method ?? 'get').toUpperCase();

  return {
    id: `api-${status ?? 'network'}-${method}-${error.config?.url ?? ''}`,
    title,
    description: descriptionOf(error.response?.data, title),
  };
}

/** Intercepteur de réponse du client de l'API : affiche le toast, puis relance l'erreur d'origine. */
export function toastApiError(error: unknown): Promise<never> {
  const errorToast = errorToastFor(error);

  // Une requête rejouée (419) repasse par la chaîne de la requête d'origine : un seul toast.
  if (errorToast !== null && !notifiedErrors.has(error as object)) {
    toast.error(errorToast.title, { id: errorToast.id, description: errorToast.description });
    notifiedErrors.add(error as object);
  }

  return Promise.reject(error);
}

/** Vrai si le client de l'API a déjà affiché un toast pour cette erreur ou pour sa cause. */
export function wasNotified(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  return notifiedErrors.has(error) || (error instanceof Error && wasNotified(error.cause));
}

/** Vrai pour une session expirée (401), même enveloppée dans une autre erreur. */
function isSessionExpiry(error: unknown): boolean {
  if (axios.isAxiosError(error)) {
    return error.response?.status === 401;
  }

  return error instanceof Error && isSessionExpiry(error.cause);
}

/**
 * Toast « erreur imprévue » d'un écran (03-APPFLOW §7), sauf si le client de l'API a déjà affiché
 * un toast plus précis pour cette même erreur : jamais deux toasts pour une erreur. Rien non plus
 * pour une session expirée (401) : le retour à la connexion affiche « Votre session a expiré ».
 */
export function toastUnexpectedError(error: unknown): void {
  if (!wasNotified(error) && !isSessionExpiry(error)) {
    toast.error(fr.errors.unexpected);
  }
}
