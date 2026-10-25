import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
  // Sonner garde ses messages dans un état global qu'un nouveau <Toaster> rejoue : chaque test
  // repart sans message éphémère.
  toast.dismiss();
});

// jsdom n'implémente pas matchMedia, que lit Sonner pour son thème.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
});
