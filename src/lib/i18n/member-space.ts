/** Libellés de l'espace adhérent (03-APPFLOW §5), repris dans `fr.memberSpace`. */
export const memberSpaceFr = {
  home: {
    greeting: (firstName: string) => `Bonjour ${firstName}`,
    welcome: (organization: string) =>
      `Bienvenue dans votre espace CGA Connect. ${organization} vous accompagne : retrouvez ici vos documents, vos honoraires et vos échéances.`,
    loadError: 'Votre espace n’a pas pu être chargé.',
    myFile: 'Mon dossier',
    myCga: 'Mon CGA',
    fields: {
      number: 'N° d’adhérent',
      portfolio: 'Portefeuille',
      regime: 'Régime',
      adhesionDate: 'Adhérent depuis le',
      status: 'Statut',
      access: 'Mon accès',
      address: 'Adresse',
      phone: 'Téléphone',
      email: 'E-mail',
    },
    // 03-APPFLOW §5.2 : adhérent radié.
    ended: (date: string) => `Votre adhésion a pris fin le ${date}.`,
    endedUntil: (date: string, until: string) =>
      `Votre adhésion a pris fin le ${date}. Vos documents restent consultables jusqu’au ${until}.`,
  },
} as const;
