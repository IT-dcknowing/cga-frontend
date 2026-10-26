import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { AppShell } from '@/components/layout/app-shell';
import {
  authRoutes,
  loginReturningTo,
  spaceKindOf,
  type SpaceKind,
} from '@/features/auth/lib/destination';
import { useAuth } from '@/features/auth/session/auth-context';
import { CgaBanners } from '@/features/cga-settings/components/cga-banners';
import { ErrorScreen } from '@/features/errors/pages/error-screen';
import { isEntryVisible, type MenuEntry } from '@/features/navigation/menu';

/*
 * Gardes de routes (03-APPFLOW §7). Le serveur refait le contrôle à chaque requête : ces gardes ne
 * protègent pas les données, elles évitent seulement d'afficher un écran que l'API refuserait.
 */

/**
 * Sans session : retour à la connexion avec la page demandée en mémoire (« Votre session a
 * expiré »). Après une déconnexion voulue, retour à la connexion simple.
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const { session, endedBy } = useAuth();
  const location = useLocation();

  if (session === null) {
    return (
      <Navigate
        to={
          endedBy === 'logout'
            ? authRoutes.login
            : loginReturningTo(`${location.pathname}${location.search}`)
        }
        replace
      />
    );
  }

  return children;
}

/**
 * Écrans d'un espace ouvert : il faut une session **et** un espace actif. Tant qu'aucun espace n'est
 * choisi, le serveur répond 409 `space_required` (02-TRD §6.2) : l'utilisateur passe d'abord par le
 * sélecteur.
 */
export function RequireSpace({ children }: { children: ReactNode }) {
  const { session, activeMembership } = useAuth();

  if (session !== null && activeMembership === null) {
    return <Navigate to={authRoutes.chooseSpace} replace />;
  }

  return <RequireSession>{children}</RequireSession>;
}

/**
 * Coque d'un espace (`CncgaLayout`, `CgaLayout`, `MemberLayout`, 02-TRD §5.2) : session, espace
 * actif, et espace actif **de ce type**. Une adresse d'un autre espace affiche « Vous n'avez pas
 * accès à cette page » dans la coque de l'espace ouvert ; pour y entrer, l'utilisateur change
 * d'espace par le sélecteur.
 */
export function SpaceLayout({ space, banners }: { space: SpaceKind; banners?: ReactNode }) {
  return (
    <RequireSpace>
      <SpaceGate space={space} banners={banners} />
    </RequireSpace>
  );
}

/** `banners` : bandeaux propres à l'espace (03-APPFLOW §4.2), au-dessus de chaque écran. */
function SpaceGate({ space, banners }: { space: SpaceKind; banners?: ReactNode }) {
  const { activeMembership } = useAuth();
  const allowed = activeMembership !== null && spaceKindOf(activeMembership) === space;

  return (
    <AppShell>
      {allowed ? (
        <>
          {banners}
          <Outlet />
        </>
      ) : (
        <ErrorScreen kind="forbidden" />
      )}
    </AppShell>
  );
}

export const PlatformLayout = () => <SpaceLayout space="platform" />;
export const CncgaLayout = () => <SpaceLayout space="cncga" />;
export const CgaLayout = () => <SpaceLayout space="cga" banners={<CgaBanners />} />;
export const MemberLayout = () => <SpaceLayout space="member" />;

/**
 * Écrans communs à tous les espaces (`/profil`) : la coque de l'espace actif, quel qu'il soit.
 */
export function AnySpaceLayout() {
  return (
    <RequireSpace>
      <AppShell>
        <Outlet />
      </AppShell>
    </RequireSpace>
  );
}

/**
 * Écran d'une entrée de menu : visible seulement avec le droit effectif (RG-ROLE-07) et, pour la
 * bancabilité, le module activé. Sinon, « Vous n'avez pas accès à cette page », comme pour un 403
 * du serveur — qui reste seul juge à chaque requête.
 */
export function RequireMenuEntry({ entry, children }: { entry: MenuEntry; children: ReactNode }) {
  const { can, activeMembership } = useAuth();

  return activeMembership !== null && isEntryVisible(entry, can, activeMembership) ? (
    children
  ) : (
    <ErrorScreen kind="forbidden" />
  );
}
