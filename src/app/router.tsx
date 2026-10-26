import { Upload, Wallet } from 'lucide-react';
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
import { cgaPermissionRoutes, cgaSettingsRoutes } from '@/features/cga-settings/lib/routes';
import { CgaSettingsPage } from '@/features/cga-settings/pages/cga-settings-page';
import { cncgaSettingsRoutes } from '@/features/cncga-settings/lib/routes';
import { CncgaSettingsPage } from '@/features/cncga-settings/pages/cncga-settings-page';
import { memberSpaceRoutes } from '@/features/member-space/lib/routes';
import { MemberDocumentsPage } from '@/features/member-space/pages/member-documents-page';
import { MemberFeesPage } from '@/features/member-space/pages/member-fees-page';
import { MemberHomePage } from '@/features/member-space/pages/member-home-page';
import { MemberImportPage } from '@/features/members/pages/member-import-page';
import { MemberPage } from '@/features/members/pages/member-page';
import { MembersPage } from '@/features/members/pages/members-page';
import { NewMemberPage } from '@/features/members/pages/new-member-page';
import { cgaMenu, cncgaMenu, memberMenu, type MenuEntry } from '@/features/navigation/menu';
import { organizationRoutes } from '@/features/organizations/lib/organization';
import { OrganizationPage } from '@/features/organizations/pages/organization-page';
import { OrganizationsPage } from '@/features/organizations/pages/organizations-page';
import { PendingPage } from '@/features/pending/pages/pending-page';
import { RolePermissionsPage } from '@/features/permissions/pages/role-permissions-page';
import { UserPermissionsPage } from '@/features/permissions/pages/user-permissions-page';
import { VerificationPage } from '@/features/verification/pages/verification-page';
import { platformRoutes } from '@/features/platform/lib/routes';
import { PlatformPage } from '@/features/platform/pages/platform-page';
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
  [cncgaSettingsRoutes.root]: { element: <CncgaSettingsPage /> },
};

const cgaScreens: Record<string, MenuScreen> = {
  [cgaSettingsRoutes.root]: {
    element: <CgaSettingsPage />,
    children: [
      {
        path: 'droits/:role',
        element: (
          <RolePermissionsPage
            level="cga"
            back={cgaPermissionRoutes.rolesTab}
            userPath={cgaPermissionRoutes.user}
          />
        ),
      },
      {
        path: 'utilisateurs/:id',
        element: <UserPermissionsPage scope="cga" back={cgaPermissionRoutes.usersTab} />,
      },
    ],
  },
  [memberRoutes.list]: {
    element: <MembersPage />,
    children: [
      { path: 'nouveau', element: <NewMemberPage /> },
      { path: ':id', element: <MemberPage /> },
    ],
  },
};

const memberScreens: Record<string, MenuScreen> = {
  [spaces.member.home]: { element: <MemberHomePage /> },
  [memberSpaceRoutes.documents]: { element: <MemberDocumentsPage /> },
};

/** Écrans de l'espace adhérent hors de son menu (honoraires, depuis l'accueil), sous leur droit. */
const memberPages: RouteObject[] = [
  {
    path: memberSpaceRoutes.fees,
    element: (
      <RequireMenuEntry
        entry={{
          path: memberSpaceRoutes.fees,
          label: fr.memberSpace.fees.title,
          icon: Wallet,
          permissions: [permissionCodes.member.payments],
        }}
      >
        <MemberFeesPage />
      </RequireMenuEntry>
    ),
  },
];

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
      // Vérification publique d'un document par son QR code (F-DOC-04), sans compte.
      { path: '/verifier/:jeton', element: <VerificationPage /> },
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
        { index: true, element: <PlatformPage /> },
        {
          path: 'droits/:role',
          element: <RolePermissionsPage level="network" back={platformRoutes.rolesTab} />,
        },
        {
          path: 'utilisateurs/:id',
          element: <UserPermissionsPage scope="network" back={platformRoutes.usersTab} />,
        },
      ]),
      spaceRoute('cncga', CncgaLayout, menuRoutes(cncgaMenu, cncgaScreens)),
      spaceRoute('cga', CgaLayout, [...menuRoutes(cgaMenu, cgaScreens), ...cgaPages]),
      spaceRoute('member', MemberLayout, [
        ...menuRoutes(memberMenu, memberScreens),
        ...memberPages,
      ]),
      // Page de démonstration des composants de l'étape 0.4.
      { path: '/demo', element: <DemoPage /> },
      { path: '*', element: <ErrorScreen kind="notFound" /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
