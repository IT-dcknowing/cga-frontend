import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// En développement, l'API Laravel est servie sous le même domaine que le SPA (cookies de session, 02-TRD §3).
const apiOrigin = process.env.VITE_API_ORIGIN ?? 'http://127.0.0.1:8000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': apiOrigin,
      '/sanctum': apiOrigin,
    },
  },
});
