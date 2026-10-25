import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadConfig(env: Record<string, string>) {
  vi.resetModules();

  for (const [name, value] of Object.entries(env)) {
    vi.stubEnv(name, value);
  }

  const { config } = await import('@/lib/config');

  return config;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('config (02-TRD §7.6 : aucune valeur en dur)', () => {
  it('l’adresse de l’API vient du fichier .env : une adresse absolue de l’API versionnée', async () => {
    const config = await loadConfig({});

    expect(import.meta.env.VITE_API_BASE_URL).toMatch(/^https?:\/\/[^/]+\/api\/v1$/);
    expect(config.apiBaseUrl).toBe(import.meta.env.VITE_API_BASE_URL);
  });

  it('lit l’adresse de l’API dans l’environnement ; le cookie CSRF se prend à la racine de son serveur', async () => {
    const config = await loadConfig({
      VITE_API_BASE_URL: ' https://api.cga-connect.ci:8443/api/v1 ',
    });

    expect(config.apiBaseUrl).toBe('https://api.cga-connect.ci:8443/api/v1');
    expect(config.apiRootUrl).toBe('https://api.cga-connect.ci:8443');
  });

  it('02-TRD T-01 · une adresse relative vise l’API du même domaine que le SPA', async () => {
    const config = await loadConfig({ VITE_API_BASE_URL: '/api/v1' });

    expect(config.apiBaseUrl).toBe('/api/v1');
    expect(config.apiRootUrl).toBe('/');
  });

  it('sans adresse réglée, retombe sur /api/v1 du même domaine (02-TRD §4)', async () => {
    const config = await loadConfig({ VITE_API_BASE_URL: '' });

    expect(config.apiBaseUrl).toBe('/api/v1');
    expect(config.apiRootUrl).toBe('/');
  });

  it('lit le bouchon d’API dans l’environnement', async () => {
    expect((await loadConfig({ VITE_API_STUB: 'true' })).useApiStub).toBe(true);
    expect((await loadConfig({ VITE_API_STUB: '1' })).useApiStub).toBe(true);
  });

  it('reste sur l’API réelle quand la variable est absente, vide ou négative', async () => {
    expect((await loadConfig({ VITE_API_STUB: '' })).useApiStub).toBe(false);
    expect((await loadConfig({ VITE_API_STUB: 'false' })).useApiStub).toBe(false);
  });

  it('choisit le bouchon ou l’API HTTP selon ce réglage', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_API_STUB', 'true');

    const [{ authApi }, { fakeAuthApi }] = await Promise.all([
      import('@/features/auth/api'),
      import('@/features/auth/api/fake-auth-api'),
    ]);

    expect(authApi).toBe(fakeAuthApi);
  });

  it('sans bouchon, passe par le backend de la plateforme (étape 0.9)', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_API_STUB', 'false');

    const [{ authApi }, { httpAuthApi }] = await Promise.all([
      import('@/features/auth/api'),
      import('@/features/auth/api/auth-api'),
    ]);

    expect(authApi).toBe(httpAuthApi);
  });

  it('journal de la console : coupé dans les tests, sauf demande explicite', async () => {
    expect((await loadConfig({ VITE_API_LOG: '' })).logApiCalls).toBe(false);
    expect((await loadConfig({ VITE_API_LOG: 'true' })).logApiCalls).toBe(true);
  });

  it('journal de la console : actif par défaut en développement', async () => {
    expect((await loadConfig({ MODE: 'development', VITE_API_LOG: '' })).logApiCalls).toBe(true);
    expect((await loadConfig({ MODE: 'development', VITE_API_LOG: 'false' })).logApiCalls).toBe(
      false,
    );
  });

  it('journal de la console : jamais dans un build de production', async () => {
    vi.stubEnv('DEV', false);

    expect((await loadConfig({ MODE: 'production', VITE_API_LOG: 'true' })).logApiCalls).toBe(
      false,
    );
  });

  it('02-TRD §6.1 · mot de passe de 8 caractères et code de 6 chiffres par défaut', async () => {
    const config = await loadConfig({ VITE_PASSWORD_MIN_LENGTH: '', VITE_CODE_LENGTH: '' });

    expect(config.passwordMinLength).toBe(8);
    expect(config.codeLength).toBe(6);
  });

  it('lit les longueurs dans l’environnement et ignore une valeur invalide', async () => {
    const changed = await loadConfig({ VITE_PASSWORD_MIN_LENGTH: '12', VITE_CODE_LENGTH: '8' });

    expect(changed.passwordMinLength).toBe(12);
    expect(changed.codeLength).toBe(8);

    const invalid = await loadConfig({ VITE_PASSWORD_MIN_LENGTH: 'douze', VITE_CODE_LENGTH: '0' });

    expect(invalid.passwordMinLength).toBe(8);
    expect(invalid.codeLength).toBe(6);
  });

  it('02-TRD §4.3 · 25 lignes par page et 300 ms de pause avant une recherche, par défaut', async () => {
    const config = await loadConfig({ VITE_PAGE_SIZE: '', VITE_SEARCH_DEBOUNCE_MS: '' });

    expect(config.pageSize).toBe(25);
    expect(config.searchDebounceMs).toBe(300);
  });

  it('lit la taille de page et la pause de recherche dans l’environnement', async () => {
    const changed = await loadConfig({ VITE_PAGE_SIZE: '50', VITE_SEARCH_DEBOUNCE_MS: '500' });

    expect(changed.pageSize).toBe(50);
    expect(changed.searchDebounceMs).toBe(500);

    const invalid = await loadConfig({ VITE_PAGE_SIZE: 'cent', VITE_SEARCH_DEBOUNCE_MS: '-1' });

    expect(invalid.pageSize).toBe(25);
    expect(invalid.searchDebounceMs).toBe(300);
  });
});
