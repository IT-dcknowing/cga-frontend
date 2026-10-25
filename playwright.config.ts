import { defineConfig, devices } from '@playwright/test';

// Parcours de bout en bout (03-APPFLOW §8). Navigateur à installer une fois : `npx playwright install chromium`,
// ou `PLAYWRIGHT_CHANNEL=chrome` pour utiliser le Chrome déjà installé sur le poste.
const channel = process.env.PLAYWRIGHT_CHANNEL;

// Serveur de test à part (5174 par défaut, `PLAYWRIGHT_PORT` pour un autre) : le serveur de
// développement, sur 5173, vise l'API réelle, alors que les parcours tournent sur le bouchon.
const port = process.env.PLAYWRIGHT_PORT ?? '5174';
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
    locale: 'fr-FR',
    timezoneId: 'Africa/Abidjan',
  },
  projects: [
    { name: 'ordinateur', use: { ...devices['Desktop Chrome'], channel } },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel } },
  ],
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    // Les variables déjà définies l'emportent sur `.env.development` : parcours sur le bouchon.
    env: { VITE_API_STUB: 'true' },
    reuseExistingServer: !process.env.CI,
  },
});
