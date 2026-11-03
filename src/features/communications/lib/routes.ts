/** Adresses des communications du centre (03-APPFLOW §4.3) ; l'onglet ouvert est `?onglet=`. */
export const communicationsRoutes = {
  root: '/cga/communications',
  /** Assistant « Nouvel envoi » ; préremplissage `?membres=id1,id2&modele=deadline`. */
  create: '/cga/communications/nouveau',
} as const;
