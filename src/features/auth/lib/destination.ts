import type { Membership, Session } from '@/features/auth/api/auth-api';

/** Écrans d'accès, publics ou communs à tous les espaces (03-APPFLOW §2, §5.2). */
export const authRoutes = {
  login: '/connexion',
  forgottenPassword: '/mot-de-passe-oublie',
  activation: '/activer/:jeton',
  chooseSpace: '/choisir-espace',
  profile: '/profil',
} as const;

/** Les quatre espaces de la plateforme (03-APPFLOW §1, §6). */
export type SpaceKind = 'platform' | 'cncga' | 'cga' | 'member';

/** Préfixe des routes et accueil de chaque espace (03-APPFLOW §1, §6). */
export const spaces: Record<SpaceKind, { prefix: string; home: string }> = {
  platform: { prefix: '/plateforme', home: '/plateforme' },
  cncga: { prefix: '/cncga', home: '/cncga/tableau-de-bord' },
  cga: { prefix: '/cga', home: '/cga/tableau-de-bord' },
  member: { prefix: '/adherent', home: '/adherent/accueil' },
};

/** Accueils des espaces (03-APPFLOW §1, §6). */
export const spaceRoutes = {
  platform: spaces.platform.home,
  cncga: spaces.cncga.home,
  cga: spaces.cga.home,
  member: spaces.member.home,
} as const;

/** Paramètre d'URL qui mémorise la page demandée après une session expirée (03-APPFLOW §7). */
export const RETURN_PARAM = 'retour';

/** Espace d'un rattachement, d'après son rôle ; `null` pour un rôle inconnu de cette version. */
export function spaceKindOf(membership: Membership): SpaceKind | null {
  const { role } = membership;

  if (role.startsWith('member_')) {
    return 'member';
  }

  if (role.startsWith('cncga_')) {
    return 'cncga';
  }

  if (role.startsWith('cga_')) {
    return 'cga';
  }

  if (role === 'platform_admin') {
    return 'platform';
  }

  return null;
}

/** Accueil de l'espace d'un rattachement, d'après son rôle (03-APPFLOW §1). */
export function spaceHomeFor(membership: Membership): string {
  const kind = spaceKindOf(membership);

  // Rôle inconnu de cette version du frontend : on ne devine pas, le sélecteur d'espace tranche.
  return kind === null ? authRoutes.chooseSpace : spaces[kind].home;
}

/**
 * Nom affiché d'un espace (F-AUTH-04 : « INC SARL — Adhérent ») : l'entreprise pour un adhérent,
 * l'organisation sinon.
 */
export function spaceNameOf(membership: Membership): string {
  return membership.member?.name ?? membership.organization.name;
}

/** Rattachement actif de la session, tel que le serveur l'a enregistré (02-TRD §6.2). */
export function activeMembershipOf(session: Session | null): Membership | null {
  if (session === null || session.active_membership_id === null) {
    return null;
  }

  return (
    session.memberships.find((membership) => membership.id === session.active_membership_id) ?? null
  );
}

/**
 * Accueil de l'espace ouvert par le serveur, ou le sélecteur tant qu'aucun espace n'est ouvert
 * (activation d'un accès invité : 03-APPFLOW §1, §2).
 */
export function resolveDestination(session: Session): string {
  const active = activeMembershipOf(session);

  return active === null ? authRoutes.chooseSpace : spaceHomeFor(active);
}

/**
 * Après la connexion (03-APPFLOW §1, F-AUTH-01) : un seul rattachement → tableau de bord de son
 * espace ; plusieurs → `/choisir-espace`, même si le serveur a déjà ouvert un espace (accès
 * principal) : le sélecteur le présélectionne.
 */
export function loginDestination(session: Session): string {
  return session.memberships.length > 1 ? authRoutes.chooseSpace : resolveDestination(session);
}

/** Lien de la page de connexion qui ramène ensuite à `path` (03-APPFLOW §7). */
export function loginReturningTo(path: string): string {
  return `${authRoutes.login}?${RETURN_PARAM}=${encodeURIComponent(path)}`;
}

/**
 * `?retour=` vient de l'URL, donc de l'extérieur : jamais de confiance (02-TRD §6.7, A01 et A03).
 * Seul un chemin interne est accepté — ni `//hote.tld`, ni schéma, ni antislash — et jamais la page
 * de connexion elle-même, qui bouclerait.
 */
export function safeReturnPath(raw: string | null): string | null {
  if (raw === null || raw === '') {
    return null;
  }

  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) {
    return null;
  }

  if (raw === authRoutes.login || raw.startsWith(`${authRoutes.login}?`)) {
    return null;
  }

  return raw;
}
