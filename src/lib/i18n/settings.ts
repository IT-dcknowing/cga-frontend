/*
 * Paramètres du réseau et de la plateforme (étapes 5.6b et 5.13, 03-APPFLOW §3.2 et §6) : éditeur
 * générique de `/cncga/parametres` (« Paramètres réseau », « Règles du rapport ») et de `/plateforme`.
 * Les libellés des clés viennent du serveur (`lang/fr/settings.php`) ; ici, ceux des champs d'une
 * valeur structurée et des listes de valeurs. Dans `fr.settings`.
 */
export const settingsFr = {
  loadError: 'Les paramètres n’ont pas pu être chargés.',
  empty: 'Aucun paramètre à afficher.',
  save: 'Enregistrer',
  saved: (label: string) => `« ${label} » enregistré`,
  reset: 'Valeur par défaut',
  resetDone: (label: string) => `« ${label} » revenu à sa valeur par défaut`,
  isDefault: 'Valeur par défaut',
  customized: 'Valeur modifiée',
  readOnly: 'Lecture seule',
  defaultValue: (value: string) => `Par défaut : ${value}`,
  listHint: 'Valeurs séparées par des virgules.',
  invalidNumber: 'Saisissez un nombre entier.',
  yes: 'Oui',
  no: 'Non',
  /** Champs d'une valeur structurée, par clé puis par champ. */
  fields: {
    'report.increase_rule': {
      basis: 'Base de comparaison',
      min_increase_pct: 'Seuil d’augmentation (%)',
      amount: 'Montant comparé',
    },
    'report.deadline_rule': {
      months_after: 'Mois après la fin du trimestre',
      day: 'Jour du mois (0 = dernier jour)',
    },
    'closing.calendar': {
      pieces: 'Pièces (MM-JJ)',
      regularisation: 'Régularisation (MM-JJ)',
      finalisation: 'Finalisation (MM-JJ)',
    },
    'concerns.target_days': {
      member_to_cga: 'Adhérent → CGA (jours)',
      cga_to_cncga: 'CGA → CNCGA (jours)',
    },
    'obligations.reminder_days': {
      first: 'Premier rappel (jours avant)',
      last: 'Dernier rappel (jours avant)',
    },
    'messaging.send_window': { from: 'Début (HH:MM)', to: 'Fin (HH:MM)' },
    'alerts.daily_thresholds': {
      login_failed: 'Échecs de connexion',
      denied: 'Accès refusés (403)',
      server_error: 'Erreurs serveur (500)',
      tenancy_bypass: 'Contournements du cloisonnement',
    },
    rateLimit: { max_attempts: 'Essais', decay_minutes: 'Fenêtre (minutes)' },
  } as Record<string, Record<string, string>>,
  /** Listes de valeurs proposées, par clé (ou clé.champ). */
  options: {
    'report.increase_rule.basis': {
      annual_due: 'Cotisation annuelle due',
      quarter_due: 'Cotisation du trimestre',
      revenue: 'Chiffre d’affaires',
    },
    'report.increase_rule.amount': { net: 'Après abattement', gross: 'Avant abattement' },
    'dues.mode': { free: 'Libre', single: 'En une fois', quarterly: 'Par trimestre' },
    'dues.prorata': { semester: 'Au semestre', none: 'Aucun' },
  } as Record<string, Record<string, string>>,
  /** `/cncga/parametres`, onglet « Règles du rapport » (RG-RPT-08). */
  reportRules: {
    intro:
      'Règle « cotisation augmentée » des feuilles du rapport trimestriel : elle s’applique à la génération suivante, sans changer les versions déjà produites (leur paramétrage est enregistré avec elles).',
  },
  /** `/plateforme`, onglet « Paramètres réseau » (03-APPFLOW §6). */
  platformNetwork: {
    intro:
      'Relances et échéance réglementaire du rapport trimestriel, export du classeur de compatibilité et calendrier de clôture par défaut, communs à tout le réseau.',
  },
};
