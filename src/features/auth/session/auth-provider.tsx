import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi } from '@/features/auth/api';
import type { AuthApi, Session } from '@/features/auth/api/auth-api';
import { activeMembershipOf } from '@/features/auth/lib/destination';
import { AuthContext, type AuthState, type SessionEnd } from '@/features/auth/session/auth-context';
import { fr } from '@/lib/i18n/fr';
import { onUnauthorized } from '@/lib/http';
import { toastUnexpectedError } from '@/lib/http-error-toast';

type AuthProviderProps = {
  children: ReactNode;
  /** API des accès ; par défaut celle de l'application (bouchon ou HTTP). */
  api?: AuthApi;
  /**
   * Session de départ, sans relire `/me` : utilisé par les tests. Absent, la session est relue
   * auprès du serveur au chargement de l'application.
   */
  initialSession?: Session | null;
};

/** Écran de démarrage pendant la relecture de `/me` : jamais d'écran blanc (03-APPFLOW §7). */
function StartupScreen() {
  return (
    <div role="status" className="flex min-h-dvh items-center justify-center bg-bg">
      <span className="sr-only">{fr.common.loading}</span>
      <span aria-hidden="true" className="h-1 w-24 animate-pulse rounded-full bg-primary-soft" />
    </div>
  );
}

export function AuthProvider({ children, api = authApi, initialSession }: AuthProviderProps) {
  const [session, setCurrentSession] = useState<Session | null>(initialSession ?? null);
  const [endedBy, setEndedBy] = useState<SessionEnd | null>(null);
  const [ready, setReady] = useState(initialSession !== undefined);

  const setSession = useCallback((next: Session) => {
    setCurrentSession(next);
    setEndedBy(null);
  }, []);

  const endSession = useCallback((reason: SessionEnd) => {
    setCurrentSession(null);
    setEndedBy(reason);
  }, []);

  useEffect(() => {
    if (initialSession !== undefined) {
      return;
    }

    let cancelled = false;

    api
      .currentSession()
      .catch((error: unknown) => {
        // Erreur serveur ou réseau (03-APPFLOW §7) : l'utilisateur repart de la connexion.
        toastUnexpectedError(error);

        return null;
      })
      .then((current) => {
        if (!cancelled) {
          setCurrentSession(current);
          setReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [api, initialSession]);

  // 03-APPFLOW §7 : toute réponse 401 ferme la session locale ; les gardes renvoient alors vers
  // `/connexion?retour=<page>` avec « Votre session a expiré ».
  // Sans session ouverte (connexion refusée, relecture de `/me`), un 401 ne change rien.
  const sessionOpen = session !== null;

  useEffect(
    () =>
      onUnauthorized(() => {
        if (sessionOpen) {
          endSession('expired');
        }
      }),
    [sessionOpen, endSession],
  );

  const value = useMemo<AuthState>(
    () => ({
      api,
      session,
      activeMembership: activeMembershipOf(session),
      can: (permission: string) => session?.permissions.includes(permission) ?? false,
      endedBy,
      setSession,
      endSession,
    }),
    [api, session, endedBy, setSession, endSession],
  );

  if (!ready) {
    return <StartupScreen />;
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
