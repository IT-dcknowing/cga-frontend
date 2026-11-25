/*
 * Annonces (PRD M12, 03-APPFLOW §3.2, §4.3 et §5.2, étape 7.6) : `/cncga/communications`, onglet
 * « Annonces » de `/cga/communications`, « Message de mon CGA » sur l'accueil de l'adhérent.
 * Dans `fr.announcements`.
 */
export const announcementsFr = {
  title: 'Communications',
  create: {
    action: 'Nouvelle annonce',
    title: 'Nouvelle annonce',
    fields: {
      title: 'Titre',
      body: 'Texte',
      attachment: 'Pièce jointe',
      audience: 'Cible',
      cgas: 'CGA destinataires',
      search: 'Rechercher un CGA',
      regimes: 'Régimes (aucun coché : tous)',
      sectors: 'Secteurs (aucun coché : tous)',
      email: 'Envoyer aussi par e-mail',
    },
    audiences: {
      all_cgas: 'Tous les CGA',
      selected_cgas: 'Certains CGA',
      all_network_members: 'Tous les adhérents du réseau',
    } as Record<string, string>,
    ownMembers: 'Destinataires : les adhérents du centre (portefeuille CGA).',
    noCga: 'Choisissez au moins un CGA.',
    chosen: (count: string) => `${count} CGA choisis`,
    submit: 'Publier',
    published: (count: string) => `Annonce publiée à ${count} destinataires`,
  },
  list: {
    caption: 'Annonces publiées',
    empty: 'Aucune annonce publiée.',
    loadError: 'Les annonces n’ont pas pu être chargées.',
    columns: {
      title: 'Titre',
      published: 'Publiée le',
      audience: 'Cible',
      recipients: 'Destinataires',
      reads: 'Lectures',
    },
    email: 'avec e-mail',
  },
  detail: {
    from: (name: string, date: string) => `${name} · ${date}`,
    targets: (names: string) => `CGA destinataires : ${names}`,
    attachment: (name: string) => `Pièce jointe : ${name}`,
    close: 'Fermer',
  },
  received: {
    title: 'Reçues du CNCGA',
    published: 'Publiées par le centre',
    empty: 'Aucune annonce reçue.',
    loadError: 'Les annonces reçues n’ont pas pu être chargées.',
    unread: (count: string) => `${count} non lues`,
    markRead: 'Marquer comme lu',
    marked: 'Annonce marquée comme lue',
  },
  member: {
    title: 'Message de mon CGA',
    empty: 'Aucun message de votre CGA pour le moment.',
    loadError: 'Le message de votre CGA n’a pas pu être chargé.',
    markRead: 'J’ai lu',
  },
};
