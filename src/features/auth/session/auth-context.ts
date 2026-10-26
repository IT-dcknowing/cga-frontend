import { createContext, useContext } from 'react';
import type { AuthApi, Membership, Session } from '@/features/auth/api/auth-api';

/** Fin de la session : déconnexion voulue, ou session expirée (réponse 401, 03-APPFLOW §7). */
export type SessionEnd = 'logout' | 'expired';

/**
 * Session de l'application. Rien n'est stocké dans le navigateur : la session vit dans le cookie
 * HttpOnly de Sanctum et cet état n'est que le reflet de `/me` (02-TRD §6.1, §6.7 — aucun secret
 * dans `localStorage`). Au rechargement de la page, l'état se reconstruit par un appel à `/me`.
 */
export type AuthState = {
  /** API des accès : le bouchon tant que l'étape 0.9 n'est pas livrée, remplaçable dans les tests. */
  api: AuthApi;
  session: Session | null;
  /** Espace actif, nul tant que l'utilisateur n'en a pas choisi un (02-TRD §6.2). */
  activeMembership: Membership | null;
  /** Droit effectif renvoyé par `/me` pour l'espace actif (RG-ROLE-07) : jamais déduit du rôle. */
  can: (permission: string) => boolean;
  /** Pourquoi la session s'est fermée ; `null` tant qu'aucune session ne s'est fermée. */
  endedBy: SessionEnd | null;
  setSession: (session: Session) => void;
  endSession: (reason: SessionEnd) => void;
};

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const state = useContext(AuthContext);

  if (state === null) {
    throw new Error('useAuth doit être appelé dans <AuthProvider>.');
  }

  return state;
}
