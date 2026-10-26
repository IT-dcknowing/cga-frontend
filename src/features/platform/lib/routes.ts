/** Adresses de l'espace plateforme (03-APPFLOW §6) ; l'onglet ouvert est `?onglet=`. */
export const platformRoutes = {
  root: '/plateforme',
  /** Interface dédiée d'un rôle du réseau. */
  role: (role: string) => `/plateforme/droits/${encodeURIComponent(role)}`,
  /** Habilitations d'un utilisateur du CNCGA. */
  user: (id: string) => `/plateforme/utilisateurs/${encodeURIComponent(id)}`,
  rolesTab: '/plateforme?onglet=droits',
  usersTab: '/plateforme?onglet=utilisateurs',
} as const;
