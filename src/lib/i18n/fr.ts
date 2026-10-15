/** Libellés de l'interface (02-TRD §5.2) : aucun texte affiché n'est écrit dans un composant. */
export const fr = {
  common: {
    loading: 'Chargement…',
  },
  table: {
    empty: 'Aucun résultat.',
    previous: 'Précédent',
    next: 'Suivant',
    range: (from: string, to: string, total: string) => `${from}–${to} sur ${total}`,
    sortBy: (column: string) => `Trier par ${column}`,
  },
  status: {
    member: {
      draft: 'Brouillon',
      active: 'Actif',
      radiation_pending: 'Radiation en cours',
      radiated: 'Radié',
      closed: 'Clos',
    },
    pieces: {
      pending: 'Pièces en attente',
      complete: 'Complet',
    },
    regime: {
      RME: 'RME',
      TEE: 'TEE',
      RSI: 'RSI',
      RNI: 'RNI',
    },
  },
  demo: {
    title: 'Composants de base',
    intro:
      'Page de démonstration de l’étape 0.4 : boutons, cartes, statuts et tableau conformes à la charte. Elle sera remplacée par l’écran de connexion.',
    buttons: 'Boutons',
    buttonPrimary: 'Valider l’adhésion',
    buttonSecondary: 'Enregistrer comme brouillon',
    buttonDanger: 'Valider la radiation',
    buttonLink: 'Voir le dossier',
    buttonSmall: 'Exporter',
    buttonLoading: 'Enregistrement',
    buttonDisabled: 'Indisponible',
    toast: 'Afficher un message',
    toastMessage: 'Adhésion validée — n° 2026-DEMO-0143',
    cards: 'Cartes',
    cardTitle: 'Dossier adhérent',
    cardBody: 'Une carte : titre, zone d’actions à droite, corps avec une marge de 16 px.',
    cardAction: 'Modifier',
    statuses: 'Statuts',
    table: 'Tableau des adhérents',
    columns: {
      companyName: 'Raison sociale',
      number: 'N° d’adhésion',
      adhesionDate: 'Date d’adhésion',
      regime: 'Régime',
      status: 'Statut',
      fees: 'Honoraires',
      pieces: 'Pièces',
    },
    selected: (name: string) => `Dossier ouvert : ${name}`,
  },
} as const;
