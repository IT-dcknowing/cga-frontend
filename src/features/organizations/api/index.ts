import { config } from '@/lib/config';
import { createFakeOrganizationsApi } from './fake-organizations-api';
import { httpOrganizationsApi, type OrganizationsApi } from './organizations-api';

/** Registre des CGA : le bouchon avec `VITE_API_STUB=true`, sinon l'API de `VITE_API_BASE_URL`. */
export const organizationsApi: OrganizationsApi = config.useApiStub
  ? createFakeOrganizationsApi()
  : httpOrganizationsApi;
