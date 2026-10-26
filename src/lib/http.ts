import axios, { type AxiosResponse } from 'axios';
import { config } from '@/lib/config';
import { toastApiError } from '@/lib/http-error-toast';
import { attachApiLogger } from '@/lib/http-logger';

declare module 'axios' {
  interface AxiosRequestConfig {
    /**
     * Pas de toast global pour ces statuts (`true` : pour aucun), quand l'écran affiche lui-même
     * l'erreur, par exemple les messages de la page de connexion.
     */
    skipErrorToast?: boolean | number[];
    /** Heure d'envoi, pour la durée affichée par le journal de la console. */
    metadata?: { startedAt: number };
    /** Requête déjà rejouée après un jeton CSRF expiré (419) : pas de second essai. */
    csrfRetried?: boolean;
  }
}

/**
 * Client de l'API, à l'adresse `VITE_API_BASE_URL` (`.env`). L'authentification passe par le cookie
 * de session HttpOnly et le jeton CSRF de Sanctum : le navigateur ne stocke jamais de jeton
 * (02-TRD §6.1, §6.7). `withXSRFToken` envoie le jeton CSRF même quand l'API est sur un autre port.
 */
export const http = axios.create({
  baseURL: config.apiBaseUrl,
  withCredentials: true,
  withXSRFToken: true,
  xsrfCookieName: 'XSRF-TOKEN',
  xsrfHeaderName: 'X-XSRF-TOKEN',
  headers: {
    Accept: 'application/json',
  },
});

// Sanctum en mode SPA (02-TRD §6.1) : le cookie CSRF se prend à la racine du serveur de l'API, hors
// de `/api/v1`, avant la connexion.
const CSRF_PATH = '/sanctum/csrf-cookie';
const CSRF_EXPIRED = 419;

export async function fetchCsrfCookie(): Promise<void> {
  await http.get(CSRF_PATH, { baseURL: config.apiRootUrl });
}

/**
 * Jeton CSRF expiré (419) : un nouveau cookie CSRF, puis un seul nouvel essai de la requête, sans
 * toast pour ce premier refus. Un second 419 suit le chemin d'une erreur ordinaire.
 */
export async function retryWithFreshCsrf(error: unknown): Promise<AxiosResponse> {
  if (
    !axios.isAxiosError(error) ||
    error.response?.status !== CSRF_EXPIRED ||
    error.config === undefined ||
    error.config.csrfRetried === true
  ) {
    throw error;
  }

  await fetchCsrfCookie();

  return await http.request({ ...error.config, csrfRetried: true });
}

type Listener = () => void;

const unauthorizedListeners = new Set<Listener>();

/**
 * Abonnement aux réponses 401 (03-APPFLOW §7 : session expirée). Le fournisseur de session s'y
 * abonne ; c'est lui qui décide si une session était ouverte. Renvoie la fonction de désabonnement.
 */
export function onUnauthorized(listener: Listener): () => void {
  unauthorizedListeners.add(listener);

  return () => {
    unauthorizedListeners.delete(listener);
  };
}

/** Erreurs 401 déjà signalées : une requête rejouée (419) repasse par la chaîne d'origine. */
const noticedErrors = new WeakSet<object>();

export function rejectWithUnauthorizedNotice(error: unknown): Promise<never> {
  if (axios.isAxiosError(error) && error.response?.status === 401 && !noticedErrors.has(error)) {
    noticedErrors.add(error);
    unauthorizedListeners.forEach((listener) => {
      listener();
    });
  }

  return Promise.reject(error);
}

// Journal des requêtes et réponses dans la console, en développement seulement (`VITE_API_LOG`).
if (config.logApiCalls) {
  attachApiLogger(http);
}

// Dans cet ordre : reprise d'un 419, avis de session expirée (401), puis toast d'erreur.
http.interceptors.response.use(undefined, retryWithFreshCsrf);
http.interceptors.response.use(undefined, rejectWithUnauthorizedNotice);
http.interceptors.response.use(undefined, toastApiError);
