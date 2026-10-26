import type { Member, MemberStatus, PortfolioChoice } from '@/features/members/api/members-api';

/** Adresses des écrans des adhérents (03-APPFLOW §4.3). */
export const memberRoutes = {
  list: '/cga/adherents',
  create: '/cga/adherents/nouveau',
  detail: (id: string) => `/cga/adherents/${encodeURIComponent(id)}`,
  import: '/cga/imports/adherents',
} as const;

/**
 * Onglets de la liste (F-ADH-01) et statuts qu'ils montrent ; la clé est le paramètre `?tab=` des
 * liens du tableau de bord (03-APPFLOW §4.3 : `?tab=brouillons`, `?tab=radiations-en-cours`).
 */
export const MEMBER_TABS = {
  actifs: ['active'],
  brouillons: ['draft'],
  'radiations-en-cours': ['radiation_pending'],
  radies: ['radiated', 'closed'],
} as const satisfies Record<string, readonly MemberStatus[]>;

export type MemberTab = keyof typeof MEMBER_TABS;

export const MEMBER_TAB_KEYS = Object.keys(MEMBER_TABS) as MemberTab[];

/** Numéro du dossier : d'adhésion au portefeuille CGA, client au Cabinet (RG-PTF-04). */
export function memberNumber(member: Pick<Member, 'membership_number' | 'client_number'>) {
  return member.membership_number ?? member.client_number;
}

/** Choix du portefeuille mémorisé par accès (04-UX-UI §2.2 : stockage local, sans donnée sensible). */
const STORAGE_PREFIX = 'cga-connect.members.portfolio.';

export function rememberedPortfolio(membershipId: string | null): PortfolioChoice | null {
  try {
    const value = window.localStorage.getItem(`${STORAGE_PREFIX}${membershipId ?? ''}`);

    return value === 'cga' || value === 'cabinet' || value === 'all' ? value : null;
  } catch (error) {
    // Stockage indisponible (navigation privée, données bloquées) : le choix par défaut s'applique.
    console.warn('Choix du portefeuille illisible dans le stockage local.', error);

    return null;
  }
}

export function rememberPortfolio(membershipId: string | null, portfolio: PortfolioChoice): void {
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${membershipId ?? ''}`, portfolio);
  } catch (error) {
    // Mémoriser n'est qu'un confort : sans stockage, le sélecteur garde le choix de l'adresse.
    console.warn('Choix du portefeuille non mémorisé dans le stockage local.', error);
  }
}
