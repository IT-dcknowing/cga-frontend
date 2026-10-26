import { defineConfig, devices } from '@playwright/test';

// Parcours de bout en bout sur l'API réelle (`npm run e2e:api`), à l'adresse `VITE_API_BASE_URL` de
// `.env` : connexion, choix d'espace, menus selon les droits et registre des CGA, avec les comptes du
// jeu de démonstration du backend (`SEED_DEMO=true`, mot de passe `SEED_DEMO_PASSWORD`). Le backend
// doit tourner avant (`cd backend && php artisan serve --port=8002`).
// Le SPA doit être servi sur le même hôte que l'API (`localhost`) et sur une origine que l'API
// accepte (SANCTUM_STATEFUL_DOMAINS, CORS_ALLOWED_ORIGINS) : par défaut http://localhost:5173.
const channel = process.env.PLAYWRIGHT_CHANNEL;
const port = process.env.PLAYWRIGHT_API_PORT ?? '5173';
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: './e2e-api',
  globalSetup: './e2e-api/global-setup.ts',
  // Un vrai serveur et une vraie base : un parcours à la fois, sans relance qui fausserait la
  // limitation des essais de connexion.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report-api', open: 'never' }]],
  outputDir: 'test-results-api',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    locale: 'fr-FR',
    timezoneId: 'Africa/Abidjan',
  },
  projects: [{ name: 'ordinateur', use: { ...devices['Desktop Chrome'], channel } }],
  webServer: {
    command: `npm run dev -- --host localhost --port ${port} --strictPort`,
    url: baseURL,
    // Les variables déjà définies l'emportent sur `.env` : `VITE_API_BASE_URL` peut viser une autre API.
    env: { VITE_API_STUB: 'false', VITE_API_LOG: 'false' },
    reuseExistingServer: !process.env.CI,
  },
});
