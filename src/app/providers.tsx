import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { Toaster } from 'sonner';
import type { AuthApi, Session } from '@/features/auth/api/auth-api';
import { AuthProvider } from '@/features/auth/session/auth-provider';

const TOAST_DURATION_MS = 4000;

// 04-UX-UI §6 (Toast) : en bas à droite, en haut sur mobile (< 768 px, §8).
const MOBILE_QUERY = '(max-width: 767px)';

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);

  useEffect(() => {
    const query = window.matchMedia(MOBILE_QUERY);
    const update = () => {
      setMobile(query.matches);
    };

    query.addEventListener('change', update);

    return () => {
      query.removeEventListener('change', update);
    };
  }, []);

  return mobile;
}

type AppProvidersProps = {
  children: ReactNode;
  /** API des accès ; par défaut celle de l'application. Remplacée dans les tests. */
  authApi?: AuthApi;
  /** Session de départ sans relire `/me` (tests). */
  initialSession?: Session | null;
};

export function AppProviders({ children, authApi, initialSession }: AppProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );
  const mobile = useIsMobile();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider api={authApi} initialSession={initialSession}>
        {children}
      </AuthProvider>
      <Toaster
        position={mobile ? 'top-center' : 'bottom-right'}
        duration={TOAST_DURATION_MS}
        richColors
      />
    </QueryClientProvider>
  );
}
