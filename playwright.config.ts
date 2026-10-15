import { defineConfig, devices } from '@playwright/test';

// Parcours de bout en bout (03-APPFLOW §8). Navigateur à installer une fois : `npx playwright install chromium`,
// ou `PLAYWRIGHT_CHANNEL=chrome` pour utiliser le Chrome déjà installé sur le poste.
const channel = process.env.PLAYWRIGHT_CHANNEL;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    locale: 'fr-FR',
    timezoneId: 'Africa/Abidjan',
  },
  projects: [
    { name: 'ordinateur', use: { ...devices['Desktop Chrome'], channel } },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel } },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
  },
});
