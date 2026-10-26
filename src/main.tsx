import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { AppProviders } from '@/app/providers';
import { router } from '@/app/router';
import './index.css';

const root = document.getElementById('root');

if (root === null) {
  throw new Error('Élément #root introuvable dans index.html.');
}

createRoot(root).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
