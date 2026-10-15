import axios from 'axios';

/**
 * Client de l'API. L'authentification passe par le cookie de session HttpOnly et le jeton CSRF
 * de Sanctum : le navigateur ne stocke jamais de jeton (02-TRD §6.1, §6.7).
 */
export const http = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  withXSRFToken: true,
  xsrfCookieName: 'XSRF-TOKEN',
  xsrfHeaderName: 'X-XSRF-TOKEN',
  headers: {
    Accept: 'application/json',
  },
});
