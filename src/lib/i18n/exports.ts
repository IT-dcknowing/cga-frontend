/*
 * Exports Excel des listes (PRD M17, F-EXP-01, RG-SEC-06, étape 8.6) : bouton « Exporter » des listes,
 * modale de période, suivi de l'export en tâche de fond (03-APPFLOW §7) et page « Mes exports »,
 * cible de la notification « Export prêt ». Dans `fr.exports`.
 */
export const exportsFr = {
  action: 'Exporter',
  /** `/cncga/statistiques` : à côté de « Exporter la plaquette PDF » (03-APPFLOW §3.2). */
  actionExcel: 'Exporter Excel',
  running: 'Export en cours…',
  dialog: {
    title: (list: string) => `Exporter en Excel : ${list}`,
    description:
      'Le fichier est préparé en tâche de fond et se télécharge dès qu’il est prêt. Si vous quittez la page, la cloche vous prévient.',
    filters: 'Filtres de la liste repris dans l’export',
    /** Filtres de l'écran que l'export ne sait pas appliquer (décision 0017 §2). */
    ignored: (filters: string) => `Non repris dans l’export : ${filters}.`,
    ignoredFilters: {
      search: 'la recherche',
      taxOffice: 'le CDI',
      referrer: 'l’apporteur',
      stale: 'le filtre « sans réponse depuis 15 jours »',
      obligation: 'l’obligation choisie',
    },
    period: 'Période',
    choices: { month: 'Un mois', year: 'Une année', custom: 'Période choisie' },
    month: 'Mois',
    monthInvalid: 'Choisissez un mois.',
    year: 'Année',
    yearInvalid: 'Saisissez une année sur 4 chiffres.',
    from: 'Du',
    to: 'Au',
    submit: 'Lancer l’export',
  },
  /** Par liste : libellé, date sur laquelle porte la période, choix « sans période ». */
  lists: {
    members: {
      label: 'Adhérents',
      periodOn: 'La période porte sur la date d’adhésion.',
      whole: 'Toute la liste',
    },
    concerns: {
      label: 'Préoccupations des adhérents',
      periodOn: 'La période porte sur la date de dépôt.',
      whole: 'Toute la liste',
    },
    network_concerns: {
      label: 'Demandes des CGA',
      periodOn: 'La période porte sur la date de dépôt.',
      whole: 'Toute la liste',
    },
    training_registrations: {
      label: 'Inscrits aux formations',
      periodOn: 'La période porte sur la date de la session.',
      whole: 'Toute la liste',
    },
    obligations: {
      label: 'Échéances',
      periodOn: 'La période porte sur la date d’échéance.',
      whole: 'Toute la liste',
    },
    dues: {
      label: 'Cotisations',
      periodOn: 'L’export reprend les années couvertes par la période.',
      whole: 'L’année en cours',
    },
    statistics: {
      label: 'Statistiques nationales',
      periodOn: 'Chiffres agrégés de la période, sans donnée nominative.',
      whole: 'L’année en cours',
    },
  },
  rows: (count: number, formatted: string) =>
    count > 1 ? `${formatted} lignes` : `${formatted} ligne`,
  ready: (name: string, rows: string) => `Export prêt : ${name} (${rows})`,
  download: 'Télécharger',
  failed: 'L’export a échoué. Réessayez.',
  page: {
    title: 'Mes exports',
    detail: (list: string) => `Export : ${list}`,
    history: 'Mes derniers exports',
    empty: 'Aucun export pour l’instant. Le bouton « Exporter » des listes en prépare un.',
    loadError: 'Les exports n’ont pas pu être chargés.',
    status: 'Statut',
    period: 'Période',
    noPeriod: 'Sans période',
    rows: 'Lignes',
    requestedAt: 'Demandé le',
    finishedAt: 'Terminé le',
    pending: 'Le fichier sera proposé ici dès qu’il sera prêt.',
    failed: 'L’export a échoué : relancez-le depuis la liste.',
    downloadFile: (name: string) => `Télécharger ${name}`,
  },
} as const;
