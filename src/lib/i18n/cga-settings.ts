/** Libellés de `/cga/parametres` (03-APPFLOW §4.3), repris dans `fr.cgaSettings`. */
export const cgaSettingsFr = {
  tabs: {
    centre: 'Centre',
    utilisateurs: 'Utilisateurs',
    droits: 'Droits par rôle',
    bareme: 'Barème',
    regles: 'Règles',
    apporteurs: 'Apporteurs d’affaires',
    campagne: 'Campagne d’attestations',
    facturation: 'Facturation FNE',
  },
  /** Onglet « Apporteurs d'affaires » (RG-PTF-06) : sous-portefeuille « Accessoires » du CGA. */
  referrers: {
    title: 'Apporteurs d’affaires',
    intro:
      'Les apporteurs rattachent des dossiers du portefeuille CGA (« Accessoire n »). Information interne au centre : elle n’apparaît sur aucun document officiel, rapport ou statistique.',
    caption: 'Apporteurs du centre',
    add: 'Ajouter',
    edit: 'Modifier',
    editLabel: (label: string) => `Modifier ${label}`,
    deleteLabel: (label: string) => `Supprimer ${label}`,
    inactive: 'Inactif',
    members: (count: string) => `${count} dossier(s) rattaché(s)`,
    empty: 'Aucun apporteur d’affaires pour l’instant.',
    loadError: 'Les apporteurs n’ont pas pu être chargés.',
    dialog: {
      createTitle: 'Nouvel apporteur',
      editTitle: 'Modifier l’apporteur',
      description:
        'Un apporteur inactif n’est plus proposé aux nouveaux dossiers ; ses dossiers le gardent.',
      label: 'Libellé',
      labelHint: 'Laissé vide : « Accessoire n » suivant.',
      name: 'Nom',
      phone: 'Téléphone',
      email: 'E-mail',
      terms: 'Conditions',
      termsHint: 'Taux ou conditions, en texte libre.',
      active: 'Actif',
      submit: 'Enregistrer',
      created: 'Apporteur ajouté',
      saved: 'Apporteur enregistré',
    },
    delete: {
      action: 'Supprimer',
      title: 'Supprimer l’apporteur',
      effects: [
        'L’apporteur disparaît de la liste.',
        'Seul un apporteur sans dossier rattaché se supprime.',
      ],
      submit: 'Supprimer',
      done: 'Apporteur supprimé',
    },
  },
} as const;
