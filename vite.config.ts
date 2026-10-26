import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// L'adresse de l'API vient de `VITE_API_BASE_URL` (`.env`, lue par `src/lib/config.ts`) : le SPA
// appelle l'API directement, sans relais du serveur de développement.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
