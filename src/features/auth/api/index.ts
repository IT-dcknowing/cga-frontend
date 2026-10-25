import { config } from '@/lib/config';
import { httpAuthApi, type AuthApi } from './auth-api';
import { fakeAuthApi } from './fake-auth-api';

/**
 * API d'authentification de l'application : le bouchon avec `VITE_API_STUB=true`, sinon le backend
 * de la plateforme (étape 0.9) à l'adresse `VITE_API_BASE_URL`.
 */
export const authApi: AuthApi = config.useApiStub ? fakeAuthApi : httpAuthApi;
