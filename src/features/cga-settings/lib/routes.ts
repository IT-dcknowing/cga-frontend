/** Adresse des paramètres du centre (03-APPFLOW §4.3) ; l'onglet ouvert est `?onglet=`. */
export const cgaSettingsRoutes = {
  root: '/cga/parametres',
} as const;

/** Interface dédiée d'un rôle du centre, et habilitations d'un agent (03-APPFLOW §4.3). */
export const cgaPermissionRoutes = {
  rolesTab: `${cgaSettingsRoutes.root}?onglet=droits`,
  role: (role: string) => `${cgaSettingsRoutes.root}/droits/${encodeURIComponent(role)}`,
  usersTab: `${cgaSettingsRoutes.root}?onglet=utilisateurs`,
  user: (id: string) => `${cgaSettingsRoutes.root}/utilisateurs/${encodeURIComponent(id)}`,
} as const;
