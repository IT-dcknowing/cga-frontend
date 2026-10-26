import {
  BarChart3,
  Building2,
  CalendarCheck,
  CalendarClock,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Landmark,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Receipt,
  Settings,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { Membership } from '@/features/auth/api/auth-api';
import { spaceKindOf, type SpaceKind } from '@/features/auth/lib/destination';
import { cgaSettingsRoutes } from '@/features/cga-settings/lib/routes';
import { memberRoutes } from '@/features/members/lib/member';
import { organizationRoutes } from '@/features/organizations/lib/organization';
import { fr } from '@/lib/i18n/fr';
import { permissionCodes } from '@/lib/reference/permissions';

/**
 * Menus des espaces (03-APPFLOW §3.1, §4.1, §5.1). Chaque entrée porte les droits du catalogue du
 * backend qui la rendent visible : le menu se calcule sur les **droits effectifs** renvoyés par
 * `/me`, jamais sur le rôle (RG-ROLE-07). Masquer une entrée ne protège rien — le serveur autorise
 * chaque requête.
 */
export type MenuEntry = {
  path: string;
  label: string;
  icon: LucideIcon;
  /** Visible si l'un de ces droits est accordé ; sans droit déclaré, dès que l'espace est actif. */
  permissions?: readonly string[];
  /** Module Bancabilité : visible seulement si l'organisation l'a activé (RG-BNK-00). */
  requiresBanking?: boolean;
};

const cncga = permissionCodes.cncga;
const cga = permissionCodes.cga;
const member = permissionCodes.member;

// Le tableau de bord de chaque espace est ouvert à tous ses rôles (03-APPFLOW §3.1, §4.1).
export const cncgaMenu: MenuEntry[] = [
  { path: '/cncga/tableau-de-bord', label: fr.nav.dashboard, icon: LayoutDashboard },
  {
    path: organizationRoutes.list,
    label: fr.nav.cncgaMembers,
    icon: Building2,
    permissions: [cncga.organizations],
  },
  { path: '/cncga/cotisations', label: fr.nav.cncgaDues, icon: Wallet, permissions: [cncga.dues] },
  {
    path: '/cncga/rapports',
    label: fr.nav.cncgaReports,
    icon: FileSpreadsheet,
    permissions: [cncga.reports],
  },
  {
    path: '/cncga/preoccupations',
    label: fr.nav.concerns,
    icon: MessageSquare,
    permissions: [cncga.concerns],
  },
  {
    path: '/cncga/formations',
    label: fr.nav.cncgaTrainings,
    icon: GraduationCap,
    permissions: [cncga.trainings],
  },
  {
    path: '/cncga/communications',
    label: fr.nav.communications,
    icon: Megaphone,
    permissions: [cncga.communications],
  },
  {
    path: '/cncga/statistiques',
    label: fr.nav.statistics,
    icon: BarChart3,
    permissions: [cncga.statistics],
  },
  // Paramètres : référentiels, utilisateurs, paramètres réseau (03-APPFLOW §3.1).
  {
    path: '/cncga/parametres',
    label: fr.nav.settings,
    icon: Settings,
    permissions: [cncga.referentials, cncga.users, cncga.settings],
  },
];

export const cgaMenu: MenuEntry[] = [
  { path: '/cga/tableau-de-bord', label: fr.nav.dashboard, icon: LayoutDashboard },
  { path: memberRoutes.list, label: fr.nav.members, icon: Users, permissions: [cga.members] },
  // Échéances des obligations, et relances d'honoraires pour le chargé des cotisations (§4.1).
  {
    path: '/cga/echeances',
    label: fr.nav.deadlines,
    icon: CalendarClock,
    permissions: [cga.obligations, cga.feeReminders],
  },
  { path: '/cga/cloture', label: fr.nav.closing, icon: CalendarCheck, permissions: [cga.closing] },
  {
    path: '/cga/rapports',
    label: fr.nav.report,
    icon: FileSpreadsheet,
    permissions: [cga.reports],
  },
  {
    path: '/cga/factures',
    label: fr.nav.invoices,
    icon: Receipt,
    permissions: [cga.invoices, cga.payments],
  },
  {
    path: '/cga/preoccupations',
    label: fr.nav.concerns,
    icon: MessageSquare,
    permissions: [cga.concerns],
  },
  {
    path: '/cga/formations',
    label: fr.nav.trainings,
    icon: GraduationCap,
    permissions: [cga.trainings],
  },
  {
    path: '/cga/communications',
    label: fr.nav.communications,
    icon: Megaphone,
    permissions: [cga.communications],
  },
  // Le catalogue n'a pas encore de droit propre à la cotisation du centre (Lot 6) : l'entrée suit
  // la fiche du centre, ouverte au gérant et à l'expert-comptable, comme le veut 03-APPFLOW §4.1.
  { path: '/cga/cotisation', label: fr.nav.dues, icon: Wallet, permissions: [cga.profile] },
  {
    path: '/cga/gestion-interne',
    label: fr.nav.internal,
    icon: Building2,
    permissions: [cga.internal],
  },
  {
    path: '/cga/bancabilite',
    label: fr.nav.bankability,
    icon: Landmark,
    permissions: [cga.bankability],
    requiresBanking: true,
  },
  {
    path: '/cga/statistiques',
    label: fr.nav.statistics,
    icon: BarChart3,
    permissions: [cga.statistics],
  },
  {
    path: cgaSettingsRoutes.root,
    label: fr.nav.settings,
    icon: Settings,
    permissions: [cga.profile, cga.users],
  },
];

/*
 * Espace adhérent (03-APPFLOW §5.1) : les quatre premières entrées forment la barre basse du
 * mobile, l'entrée « Plus » ouvrant le reste ; sur ordinateur, tout est dans le menu latéral.
 */
export const memberMenu: MenuEntry[] = [
  { path: '/adherent/accueil', label: fr.nav.home, icon: LayoutDashboard },
  {
    path: '/adherent/obligations',
    label: fr.nav.obligations,
    icon: CalendarClock,
    permissions: [member.obligations],
  },
  {
    path: '/adherent/documents',
    label: fr.nav.documents,
    icon: FileText,
    permissions: [member.documents],
  },
  {
    path: '/adherent/messages',
    label: fr.nav.messages,
    icon: MessageSquare,
    permissions: [member.concerns],
  },
  {
    path: '/adherent/formations',
    label: fr.nav.trainings,
    icon: GraduationCap,
    permissions: [member.trainings],
  },
  {
    path: '/adherent/bancabilite',
    label: fr.nav.myBankability,
    icon: Landmark,
    permissions: [member.bankability],
    requiresBanking: true,
  },
];

/** Nombre d'entrées de la barre basse avant le bouton « Plus » (04-UX-UI §5.2 : 5 entrées). */
export const MEMBER_BAR_SIZE = 4;

const menus: Record<SpaceKind, MenuEntry[]> = {
  cncga: cncgaMenu,
  cga: cgaMenu,
  member: memberMenu,
  // L'espace plateforme tient dans un seul écran à onglets (03-APPFLOW §6) : pas de menu latéral.
  platform: [],
};

export function menuFor(membership: Membership): MenuEntry[] {
  const kind = spaceKindOf(membership);

  return kind === null ? [] : menus[kind];
}

/** Une entrée est visible avec l'un de ses droits effectifs et, pour la bancabilité, le module activé. */
export function isEntryVisible(
  entry: MenuEntry,
  can: (permission: string) => boolean,
  membership: Membership,
): boolean {
  return (
    (entry.permissions === undefined || entry.permissions.some((permission) => can(permission))) &&
    (entry.requiresBanking !== true || membership.organization.banking_enabled)
  );
}

/** Entrées visibles d'après les droits effectifs de l'espace actif et les modules activés. */
export function visibleEntries(
  entries: MenuEntry[],
  can: (permission: string) => boolean,
  membership: Membership,
): MenuEntry[] {
  return entries.filter((entry) => isEntryVisible(entry, can, membership));
}
