import { createBrowserRouter } from 'react-router';
import { DemoPage } from '@/features/demo/pages/demo-page';

// Étape 0.4 : seule la page de démonstration ; les écrans arrivent avec l'étape 0.10 (03-APPFLOW).
export const routes = [{ path: '/', element: <DemoPage /> }];

export const router = createBrowserRouter(routes);
