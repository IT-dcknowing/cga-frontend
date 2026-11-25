/** Adresses du rapport trimestriel du centre (03-APPFLOW §4.3). */
export const reportRoutes = {
  list: '/cga/rapports',
  detail: (id: string) => `/cga/rapports/${encodeURIComponent(id)}`,
  /** Fiche permanente du centre (étape 5.7), rappelée par les sections 1 à 3. */
  permanentProfile: '/cga/gestion-interne?onglet=fiche-permanente',
} as const;
