import { apiBaseUrl, apiRootUrl } from './api-env';

/** Avant les parcours : l'API de `VITE_API_BASE_URL` doit répondre, sinon un message clair. */
export default async function globalSetup(): Promise<void> {
  if (apiRootUrl === '') {
    throw new Error(
      `VITE_API_BASE_URL doit être une adresse absolue pour les parcours sur l'API réelle : « ${apiBaseUrl} ».`,
    );
  }

  const csrfCookieUrl = `${apiRootUrl}/sanctum/csrf-cookie`;
  const response = await fetch(csrfCookieUrl).catch((error: unknown) => {
    throw new Error(
      `API injoignable sur ${apiRootUrl} : lancer le backend (cd backend && php artisan serve --port=${new URL(apiRootUrl).port || '80'}).`,
      { cause: error },
    );
  });

  if (response.status !== 204) {
    throw new Error(
      `${csrfCookieUrl} répond ${String(response.status)} au lieu de 204 : ce n'est pas le backend de la plateforme.`,
    );
  }
}
