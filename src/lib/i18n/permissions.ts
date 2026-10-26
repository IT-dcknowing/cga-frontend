/** Libellés des droits par rôle et des habilitations par utilisateur (03-APPFLOW §4.3, §6), dans `fr.permissions`. */
export const permissionsFr = {
  cgaTitle: 'Droits par rôle',
  networkTitle: 'Droits du réseau',
  cgaIntro:
    'Les droits de chaque rôle du centre suivent ceux du réseau ; un rôle personnalisé ne vaut que pour votre centre.',
  networkIntro:
    'Les droits du réseau s’appliquent à tous les CGA, qui peuvent ensuite les ajuster pour leur centre.',
  rolesCaption: 'Rôles',
  noRoles: 'Aucun rôle à paramétrer.',
  loadError: 'Les droits n’ont pas pu être chargés.',
  usersCount: (count: string) => `${count} utilisateur(s)`,
  grantedCount: (granted: string, total: string) => `${granted} droit(s) sur ${total}`,
  customized: 'personnalisé',
  locked: 'verrouillé',
  grantAll: (module: string) => `Tout accorder : ${module}`,
  revokeAll: (module: string) => `Tout retirer : ${module}`,
  back: 'Tous les rôles',
  referenceCga: 'Les cases différentes des droits du réseau sont marquées « personnalisé ».',
  referenceNetwork: 'Les cases différentes des valeurs par défaut sont marquées « personnalisé ».',
  save: 'Enregistrer',
  saved: 'Droits du rôle enregistrés',
  holders: 'Utilisateurs ayant ce rôle',
  noHolders: 'Aucun utilisateur n’a ce rôle.',
  resetCga: 'Revenir aux droits du réseau',
  resetNetwork: 'Revenir aux valeurs par défaut',
  resetSubmit: 'Confirmer',
  resetDone: 'Personnalisation retirée',
  resetCgaEffects: [
    'Le rôle reprend les droits définis pour tout le réseau.',
    'Les ajustements individuels des utilisateurs sont conservés.',
  ],
  resetNetworkEffects: [
    'Le rôle reprend les droits par défaut de la plateforme dans tout le réseau.',
    'Les personnalisations des CGA sont conservées.',
  ],
  impact: {
    title: 'Confirmer les nouveaux droits',
    summary: (users: string, added: string, removed: string) =>
      `Ce changement concerne ${users} utilisateur(s) : +${added} droit(s), −${removed} droit(s).`,
    added: (label: string) => `Accordé : ${label}`,
    removed: (label: string) => `Retiré : ${label}`,
    submit: 'Enregistrer',
  },
  /** Habilitations d'un utilisateur, le « nuage » (RG-ROLE-07). */
  user: {
    title: (name: string) => `Habilitations de ${name}`,
    intro:
      'Cases pré-cochées selon le profil ; une case modifiée ne vaut que pour cet utilisateur.',
    profiles: (roles: string) => `Profil(s) : ${roles}`,
    adjusted: 'ajusté pour cet utilisateur',
    adjustedCount: (count: string) => `${count} droit(s) ajusté(s)`,
    backToProfile: 'Revenir au profil',
    backToProfileLabel: (label: string) => `Revenir au profil : ${label}`,
    reason: 'Motif (facultatif)',
    save: 'Enregistrer',
    saved: (name: string) => `Habilitations de ${name} mises à jour`,
    resetAll: 'Revenir au profil pour tous les droits',
    resetDone: 'Ajustements retirés',
    resetEffects: [
      'L’utilisateur reprend exactement les droits de son profil.',
      'L’historique des ajustements reste dans le journal.',
    ],
    back: 'Retour',
    action: 'Habilitations',
  },
} as const;
