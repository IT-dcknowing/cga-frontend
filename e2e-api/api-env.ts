import { loadEnv } from 'vite';

/**
 * Adresse de l'API visée par le SPA des parcours : `VITE_API_BASE_URL`, lue comme Vite la lit
 * (`.env`, `.env.development`, puis l'environnement, qui l'emporte).
 */
export const apiBaseUrl = loadEnv('development', process.cwd(), 'VITE_').VITE_API_BASE_URL ?? '';

/** Racine du serveur de l'API, où Sanctum sert `/sanctum/csrf-cookie`. */
export const apiRootUrl = /^https?:\/\//i.test(apiBaseUrl) ? new URL(apiBaseUrl).origin : '';
