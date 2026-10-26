import { Upload } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { createBrowserRouter, Navigate, Outlet, type RouteObject } from 'react-router';
import { authRoutes, spaces, type SpaceKind } from '@/features/auth/lib/destination';
import { ActivationPage } from '@/features/auth/pages/activation-page';
import { ChooseSpacePage } from '@/features/auth/pages/choose-space-page';
import { ForgottenPasswordPage } from '@/features/auth/pages/forgotten-password-page';
import { LoginPage } from '@/features/auth/pages/login-page';
import { ProfilePage } from '@/features/auth/pages/profile-page';
import {
  AnySpaceLayout,
  CgaLayout,
  CncgaLayout,
  MemberLayout,
  PlatformLayout,
  RequireMenuEntry,
  RequireSession,
} from '@/features/auth/session/guards';
import { DemoPage } from '@/features/demo/pages/demo-page';
import { ErrorScreen, RouteErrorPage } from '@/features/errors/pages/error-screen';
import { memberRoutes } from '@/features/members/lib/member';
import { MemberImportPage } from '@/features/members/pages/member-import-page';
import { MemberPage } from '@/features/members/pages/member-page';
import { MembersPage } from '@/features/members/pages/members-page';
import { NewMemberPage } from '@/features/members/pages/new-member-page';
import { cgaMenu, cncgaMenu, memberMenu, type MenuEntry } from '@/features/navigation/menu';
import { organizationRoutes } from '@/features/organizations/lib/organization';
import { OrganizationPage } from '@/features/organizations/pages/organization-page';
import { OrganizationsPage } from '@/features/organizations/pages/organizations-page';
import { PendingPage } from '@/features/pending/pages/pending-page';
import { fr } from '@/lib/i18n/fr';
import { permissionCodes } from '@/lib/reference/permissions';

/*
 * Routes de l'application (03-APPFLOW §1, §2, §7). Les écrans publics s'affichent sans session ;
 * chaque espace a sa coque (`CncgaLayout`, `CgaLayout`, `MemberLayout`, 02-TRD §5.2) qui exige une
 * session et l'espace actif correspondant. Les entrées de menu dont l'écran n'est pas encore construit
 * affichent l'écran d'attente, dans la coque et sous le même contrôle de droit que l'écran final.
 */

/** Écran construit d'une entrée de menu, et ses sous-pages (fiche…), sous le droit de l'entrée. */
type MenuScreen = { element: ReactNode; children?: RouteObject[] };

function menuRoutes(entries: MenuEntry[], screens: Record<string, MenuScreen> = {}): RouteObject[] {
  return entries.map((entry) => {
    const screen = screens[entry.path] as MenuScreen | undefined;

    return {
      path: entry.path,
      element: (
        <RequireMenuEntry entry={entry}>
          <Outlet />
        </RequireMenuEntry>
      ),
      children: [
        { index: true, element: screen?.element ?? <PendingPage title={entry.label} /> },
        ...(screen?.children ?? []),
      ],
    };
  });
}

const cncgaScreens: Record<string, MenuScreen> = {
  [organizationRoutes.list]: {
    element: <OrganizationsPage />,
    children: [{ path: ':id', element: <OrganizationPage /> }],
  },
};

const cgaScreens: Record<string, MenuScreen> = {
  [memberRoutes.list]: {
    element: <MembersPage />,
    children: [
      { path: 'nouveau', element: <NewMemberPage /> },
      { path: ':id', element: <MemberPage /> },
    ],
  },
};

/** Écrans d'un espace hors de son menu (import du portefeuille), sous leur propre droit. */
const cgaPages: RouteObject[] = [
  {
    path: memberRoutes.import,
    element: (
      <RequireMenuEntry
        entry={{
          path: memberRoutes.import,
          label: fr.members.import.title,
          icon: Upload,
          permissions: [permissionCodes.cga.membersImport],
        }}
      >
        <MemberImportPage />
      </RequireMenuEntry>
    ),
  },
];

/**
 * Routes d'un espace : sa coque, puis ses écrans. Une erreur levée par un écran (403, 404 de l'API)
 * s'affiche dans la coque ; une adresse inconnue de l'espace donne « Élément introuvable ».
 */
function spaceRoute(space: SpaceKind, Layout: ComponentType, children: RouteObject[]): RouteObject {
  const { prefix, home } = spaces[space];

  return {
    path: prefix,
    element: <Layout />,
    children: [
      {
        errorElement: <RouteErrorPage />,
        children: [
          ...(prefix === home ? [] : [{ index: true, element: <Navigate to={home} replace /> }]),
          ...children,
          { path: '*', element: <ErrorScreen kind="notFound" /> },
        ],
      },
    ],
  };
}

export const routes: RouteObject[] = [
  {
    errorElement: <RouteErrorPage />,
    children: [
      { path: '/', element: <Navigate to={authRoutes.login} replace /> },
      { path: authRoutes.login, element: <LoginPage /> },
      { path: authRoutes.forgottenPassword, element: <ForgottenPasswordPage /> },
      { path: authRoutes.activation, element: <ActivationPage /> },
      {
        path: authRoutes.chooseSpace,
        element: (
          <RequireSession>
            <ChooseSpacePage />
          </RequireSession>
        ),
      },
      {
        element: <AnySpaceLayout />,
        children: [
          {
            errorElement: <RouteErrorPage />,
            children: [{ path: authRoutes.profile, element: <ProfilePage /> }],
          },
        ],
      },
      spaceRoute('platform', PlatformLayout, [
        { index: true, element: <PendingPage title={fr.spaces.platform} /> },
      ]),
      spaceRoute('cncga', CncgaLayout, menuRoutes(cncgaMenu, cncgaScreens)),
      spaceRoute('cga', CgaLayout, [...menuRoutes(cgaMenu, cgaScreens), ...cgaPages]),
      spaceRoute('member', MemberLayout, menuRoutes(memberMenu)),
      // Page de démonstration des composants de l'étape 0.4.
      { path: '/demo', element: <DemoPage /> },
      { path: '*', element: <ErrorScreen kind="notFound" /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
