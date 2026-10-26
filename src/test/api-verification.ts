import { notFound, ok, type ApiReply } from './api-replies';

/*
 * Vérification publique simulée, d'après `VerificationController` (`VerificationResource`), sans
 * session : un code connu renvoie l'état du document, un code inconnu 404 comme le vrai serveur.
 */
const DOCUMENTS: Record<string, unknown> = {
  'valide-0123456789': {
    status: 'valid',
    status_label: 'Valide',
    cancelled_on: null,
    type: 'membership_certificate',
    type_label: 'Attestation d’adhésion',
    issued_on: '2026-01-12',
    issuer: 'DC-KNOWING CGA',
    member_name: 'BOULANGERIE ADJOUA',
    membership_number: '2026-DCK-0001',
  },
  'annule-0123456789': {
    status: 'cancelled',
    status_label: 'Annulé',
    cancelled_on: '2026-02-01',
    type: 'membership_contract',
    type_label: 'Contrat d’adhésion',
    issued_on: '2026-01-10',
    issuer: 'DC-KNOWING CGA',
    member_name: 'BOULANGERIE ADJOUA',
    membership_number: '2026-DCK-0001',
  },
};

/** `GET /public/verify/{code}` ; `undefined` pour une autre route. */
export function verificationRoute(method: string, path: string): ApiReply | undefined {
  const match = /^\/public\/verify\/([^/]+)$/.exec(path);

  if (method !== 'GET' || match === null) {
    return undefined;
  }

  const document = DOCUMENTS[decodeURIComponent(match[1])];

  return document === undefined ? notFound : ok(document);
}
