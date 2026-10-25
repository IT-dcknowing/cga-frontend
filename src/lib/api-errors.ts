import axios from 'axios';

/*
 * Erreurs de l'API traduites pour les écrans (02-TRD §4.3, 03-APPFLOW §7). Les codes HTTP restent
 * dans cette couche : un écran ne manipule que ces classes, ou le statut pour 403 / 404.
 */

/**
 * Conflit métier (409 `{ message, code, details }`) : code mauvais, code expiré, mot de passe actuel
 * refusé… Le message vient du serveur ; `details` porte par exemple le nombre d'essais restants.
 */
export class ApiBusinessError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(code: string, details: Record<string, unknown> = {}, message: string = code) {
    super(message);
    this.name = 'ApiBusinessError';
    this.code = code;
    this.details = details;
  }
}

/** Erreur de validation (422 `{ message, errors: { champ: [..] } }`, format Laravel). */
export class ApiValidationError extends Error {
  /** Premier message de chaque champ refusé, dans l'ordre renvoyé par le serveur. */
  readonly fields: Record<string, string>;

  constructor(fields: Record<string, string>, message = 'validation_failed') {
    super(message);
    this.name = 'ApiValidationError';
    this.fields = fields;
  }
}

type ErrorPayload = {
  message?: unknown;
  code?: unknown;
  details?: unknown;
  errors?: unknown;
};

function firstMessages(errors: unknown): Record<string, string> {
  if (typeof errors !== 'object' || errors === null) {
    return {};
  }

  const fields: Record<string, string> = {};

  for (const [field, messages] of Object.entries(errors)) {
    const first: unknown = Array.isArray(messages) ? messages[0] : messages;

    if (typeof first === 'string') {
      fields[field] = first;
    }
  }

  return fields;
}

/** Statut HTTP d'une erreur d'appel à l'API, ou `undefined` (panne réseau, erreur du code). */
export function httpStatusOf(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined;
}

/** Transforme un 409 en `ApiBusinessError` et un 422 en `ApiValidationError` ; le reste est inchangé. */
export function toApiError(error: unknown): unknown {
  if (!axios.isAxiosError(error) || error.response === undefined) {
    return error;
  }

  const payload = (error.response.data ?? {}) as ErrorPayload;
  const message = typeof payload.message === 'string' ? payload.message : undefined;

  if (error.response.status === 409) {
    return new ApiBusinessError(
      typeof payload.code === 'string' ? payload.code : 'business_error',
      typeof payload.details === 'object' && payload.details !== null
        ? (payload.details as Record<string, unknown>)
        : {},
      message,
    );
  }

  if (error.response.status === 422) {
    return new ApiValidationError(firstMessages(payload.errors), message);
  }

  return error;
}

/** Exécute un appel et relance son échec sous la forme de `toApiError`. */
export async function withApiErrors<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw toApiError(error);
  }
}
