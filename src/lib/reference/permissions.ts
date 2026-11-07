/*
 * Codes des droits lus par le frontend, ceux du catalogue du backend (`backend/config/permissions.php`,
 * 02-TRD §6.2). Le frontend ne décide d'aucun droit : il masque une entrée de menu ou un bouton
 * quand `/me` ne renvoie pas le droit correspondant (RG-ROLE-07), et le serveur autorise de nouveau
 * chaque requête.
 */
export const permissionCodes = {
  cncga: {
    organizations: 'organizations.view',
    /** Enregistrer ou modifier un CGA, inviter son gérant (01-PRD §3.3). */
    organizationsManage: 'organizations.manage',
    /** Suspendre / réactiver un CGA : verrouillé sur la Présidente (RG-ROLE-04, F-ORG-06). */
    organizationsSuspend: 'organizations.suspend',
    subscription: 'organizations.subscription.manage',
    dues: 'dues.view',
    /** Confirmer, rejeter ou saisir un paiement de cotisation (F-COT-03, 04). */
    duesPayments: 'dues.payments.manage',
    duesRemind: 'dues.remind',
    /** « Facturer » une cotisation (étape 6.9) : émission des factures au CNCGA. */
    duesInvoice: 'invoices.issue',
    /** Fiche d'identité du CNCGA, émetteur des reçus et factures de cotisation (étape 6.9). */
    profile: 'network_profile.view',
    profileManage: 'network_profile.manage',
    reports: 'reports.network.view',
    concerns: 'network_concerns.view',
    trainings: 'trainings.network.manage',
    communications: 'announcements.network.publish',
    statistics: 'statistics.national.view',
    users: 'network_users.manage',
    settings: 'network_settings.manage',
    referentials: 'referentials.manage',
  },
  cga: {
    members: 'members.view',
    membersCreate: 'members.create',
    /** Valider une radiation, et donc « Valider immédiatement » à la demande (F-ADH-06). */
    radiationValidate: 'members.radiation.validate',
    membersImport: 'members.import',
    /** Inviter l'adhérent en ligne et gérer ses accès (F-ADH-09). */
    membersAccess: 'members.access.manage',
    /** Portefeuille Cabinet, et donc le choix « Tous » de la liste (RG-PTF-02). */
    cabinet: 'members.cabinet.view',
    /** Apporteurs et étiquette « Accessoire n » (RG-PTF-06). */
    referrers: 'members.referrers.view',
    obligations: 'obligations.manage',
    feeReminders: 'fees.remind',
    closing: 'closing.view',
    /** Marquer une étape faite, livrable et agent d'un dossier, actions groupées (F-OBL-08). */
    closingManage: 'closing.manage',
    reports: 'reports.prepare',
    invoices: 'invoices.issue',
    payments: 'member_payments.manage',
    concerns: 'concerns.reply',
    trainings: 'trainings.cga.manage',
    communications: 'communications.bulk.send',
    /** Valider un envoi groupé au-delà du seuil (RG-COM-01) : le gérant. */
    communicationsApprove: 'communications.bulk.approve',
    internal: 'internal.manage',
    bankability: 'banking.manage',
    statistics: 'statistics.position.view',
    profile: 'cga.profile.view',
    /** Cotisation du centre au CNCGA (F-COT-06) et déclaration d'un paiement. */
    dues: 'dues.own.view',
    duesDeclare: 'dues.own.declare',
    /** Modifier la fiche du centre, son barème et ses apporteurs (gérant). */
    profileManage: 'cga.profile.manage',
    documentsProduce: 'documents.produce',
    /** Facturation FNE et Compta Flow (F-ADM-07). */
    integrations: 'integrations.view',
    users: 'cga_users.manage',
    /** Droits par rôle du centre (F-ADM-05), verrouillé sur le gérant. */
    permissions: 'cga_permissions.manage',
    /** Habilitations d'un agent du centre (RG-ROLE-07), verrouillé sur le gérant. */
    userPermissions: 'cga_user_permissions.manage',
  },
  member: {
    /** Honoraires de l'adhérent et déclaration d'un paiement (F-PAY-03). */
    payments: 'member.payments.declare',
    obligations: 'member.obligations.view',
    documents: 'member.documents.view',
    /** `/adherent/cloture` : étapes de l'exercice et pièces attendues (F-OBL-08). */
    closing: 'member.closing.view',
    concerns: 'member.concerns.write',
    trainings: 'member.trainings.register',
    bankability: 'member.banking.view',
  },
} as const;
