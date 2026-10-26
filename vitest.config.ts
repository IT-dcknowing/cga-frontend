import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      coverage: {
        provider: 'v8',
        include: ['src/app/**', 'src/components/**', 'src/features/**', 'src/lib/**'],
        exclude: ['src/**/*.test.{ts,tsx}'],
        reporter: ['text', 'html', 'json-summary'],
        // Seuil du frontend (02-TRD §13) : une baisse fait échouer `npm run test:ci`.
        thresholds: {
          lines: 70,
        },
      },
    },
  }),
);
