/*
 * `/cga/communications` (03-APPFLOW §4.3, F-COM-03) : onglets Annonces, Envois groupés, Historique des
 * envois ; assistant « Nouvel envoi » en 4 étapes. Les modèles de message sont des textes de départ,
 * modifiables avant l'envoi.
 */
export const communicationsFr = {
  title: 'Communications',
  tabs: { annonces: 'Annonces', envois: 'Envois groupés', historique: 'Historique des envois' },
  newCampaign: 'Nouvel envoi',
  intro: (threshold: string) =>
    `Rappels et messages à vos adhérents. Au-delà de ${threshold} destinataires, l’envoi est validé par le gérant.`,
  smsRemaining: (count: string) => `SMS restants ce mois-ci : ${count}`,
  loadError: 'L’historique des envois n’a pas pu être chargé.',
  empty: 'Aucun envoi pour l’instant.',
  caption: 'Historique des envois',
  line: (date: string, count: string) => `${date} · ${count} destinataire(s)`,
  delivery: (sent: string, failed: string) => `Délivrés : ${sent} · échecs : ${failed}`,
  rejected: (reason: string) => `Refusé : ${reason}`,
  channels: { platform: 'Plateforme', email: 'E-mail', sms: 'SMS', whatsapp: 'WhatsApp' } as Record<
    string,
    string
  >,
  approve: 'Valider',
  reject: 'Refuser',
  approved: (count: string) => `Envoi validé : en cours à ${count} destinataire(s).`,
  rejectDialog: {
    title: (subject: string) => `Refuser l’envoi « ${subject} »`,
    reason: 'Motif du refus',
    submit: 'Refuser',
    done: 'Envoi refusé : son auteur est averti.',
  },
  wizard: {
    title: 'Nouvel envoi',
    steps: ['Destinataires', 'Canaux', 'Message', 'Envoyer'],
    step: (index: string, total: string, name: string) => `Étape ${index} sur ${total} : ${name}`,
    previous: 'Précédent',
    next: 'Suivant',
    portfolio: 'Portefeuille',
    portfolios: { cga: 'Portefeuille CGA', cabinet: 'Portefeuille Cabinet', all: 'Tous' } as Record<
      string,
      string
    >,
    regimes: 'Régimes',
    sectors: 'Secteurs',
    sectorsHint: 'Aucun secteur choisi : tous les secteurs.',
    unpaidFees: 'Seulement les adhérents aux honoraires impayés',
    selected: (count: string) => `${count} dossier(s) choisi(s) depuis les échéances`,
    counter: (count: string) => `${count} destinataire(s)`,
    counting: 'Comptage des destinataires…',
    noRecipient: 'Aucun destinataire ne correspond : élargissez les filtres.',
    channelsHint:
      'La plateforme et l’e-mail sont illimités ; SMS et WhatsApp respectent le consentement de chaque adhérent.',
    smsNeeded: (needed: string, remaining: string) =>
      `SMS nécessaires : ${needed} · restants ce mois-ci : ${remaining}`,
    smsInsufficient: (remaining: string) => `Quota SMS insuffisant (reste ${remaining}).`,
    chooseChannel: 'Choisissez au moins un canal.',
    template: 'Modèle',
    free: 'Message libre',
    subject: 'Objet',
    body: 'Message',
    preview: 'Aperçu',
    required: 'Ce champ est obligatoire.',
    summary: (count: string, channels: string) => `${count} destinataire(s) · ${channels}`,
    approvalNotice: (threshold: string) =>
      `Plus de ${threshold} destinataires : l’envoi attendra la validation du gérant, qui est averti.`,
    send: 'Envoyer',
    sendForApproval: 'Envoyer pour validation',
    sent: (count: string) => `Envoi en cours à ${count} destinataire(s).`,
    pending: 'Envoi soumis à la validation du gérant.',
    back: 'Retour aux communications',
  },
  templates: {
    deadline: {
      label: 'Rappel d’échéance',
      title: 'Rappel : échéance fiscale à venir',
      body: 'Bonjour, votre prochaine échéance approche. Pensez à transmettre vos pièces et à effectuer votre déclaration dans les délais. Votre CGA reste à votre disposition.',
    },
    fees: {
      label: 'Honoraires impayés',
      title: 'Rappel : honoraires à régler',
      body: 'Bonjour, des honoraires restent à régler pour votre dossier. Merci de régulariser votre situation ou de contacter votre CGA.',
    },
    closing: {
      label: 'Pièces de clôture',
      title: 'Clôture de l’exercice : pièces attendues',
      body: 'Bonjour, la clôture de l’exercice approche. Merci de nous transmettre vos pièces comptables dès que possible.',
    },
  } as Record<string, { label: string; title: string; body: string }>,
};
