/** Adresses de l'espace adhérent hors accueil (03-APPFLOW §5.2). */
export const memberSpaceRoutes = {
  obligations: '/adherent/obligations',
  documents: '/adherent/documents',
  /** Depuis la carte Honoraires de l'accueil : hors du menu. */
  fees: '/adherent/honoraires',
  /** Depuis les rappels de la campagne de clôture : hors du menu. */
  closing: '/adherent/cloture',
} as const;
