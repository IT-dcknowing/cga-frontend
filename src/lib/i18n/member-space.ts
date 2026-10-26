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
    feesCard: 'Mes honoraires',
    feesIntro: 'Vos échéances, vos paiements et vos reçus ; déclarez ici un paiement fait au CGA.',
    feesLink: 'Voir mes honoraires',
    documentsLink: 'Voir mes documents',
  },
  /** `/adherent/documents` (RG-DOC-04 : PDF seulement). */
  documents: {
    title: 'Mes documents',
    caption: 'Mes documents',
    empty: 'Aucun document pour l’instant.',
    loadError: 'Vos documents n’ont pas pu être chargés.',
    download: (title: string) => `Télécharger le PDF : ${title}`,
  },
  /** `/adherent/honoraires` (F-PAY-03). */
  fees: {
    title: 'Mes honoraires',
    loadError: 'Vos honoraires n’ont pas pu être chargés.',
    balance: 'Reste à payer :',
    charges: 'Échéances',
    payments: 'Paiements',
    noCharge: 'Aucune échéance.',
    noPayment: 'Aucun paiement.',
    chargeLine: (amount: string, paid: string, balance: string, due: string) =>
      `Montant ${amount} · payé ${paid} · reste ${balance} · échéance du ${due}`,
    declare: {
      action: 'Déclarer un paiement',
      title: 'Déclarer un paiement',
      description:
        'Votre CGA confirme le paiement à réception ; il reste « À confirmer » jusque-là.',
      amount: 'Montant payé (F CFA)',
      paidOn: 'Date du paiement',
      method: 'Mode de paiement',
      reference: 'Référence (facultative)',
      proof: 'Preuve du paiement',
      proofHint: 'Reçu, capture du paiement mobile ou bordereau (PDF, JPEG ou PNG).',
      submit: 'Déclarer',
      done: 'Paiement déclaré : en attente de confirmation par votre CGA',
    },
  },
} as const;
