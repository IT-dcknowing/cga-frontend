import { fr } from '@/lib/i18n/fr';

/**
 * Tons des statuts (04-UX-UI §2.1) : vert favorable, orange à traiter, rouge bloquant,
 * gris neutre, bleu référence externe. Aucun composant ne choisit sa couleur lui-même.
 */
export type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

const TONES = {
  member: {
    draft: 'warning',
    active: 'success',
    radiation_pending: 'warning',
    radiated: 'danger',
    closed: 'neutral',
  },
  pieces: {
    pending: 'warning',
    complete: 'success',
  },
  regime: {
    RME: 'neutral',
    TEE: 'neutral',
    RSI: 'neutral',
    RNI: 'neutral',
  },
  /** CGA du registre (`organizations.status`) : un CGA résilié est clos, en gris. */
  organization: {
    active: 'success',
    suspended: 'danger',
    terminated: 'neutral',
  },
  /** F-ORG-05 : « Non abonné » et « Essai » en gris (§2.1). */
  subscription: {
    none: 'neutral',
    trial: 'neutral',
    active: 'success',
    terminated: 'neutral',
  },
  /** L'agrément en cours reste à traiter (RG-ORG-03) ; retiré, il bloque (F-ORG-07). */
  agreement: {
    pending: 'warning',
    granted: 'success',
    withdrawn: 'danger',
  },
} as const satisfies Record<keyof typeof fr.status, Record<string, Tone>>;

export type StatusDomain = keyof typeof TONES;
export type StatusCode<D extends StatusDomain> = keyof (typeof TONES)[D] & string;

/** Ton et libellé d'un statut ; un code inconnu (nouveau côté API) reste lisible, en gris. */
export function describeStatus(domain: StatusDomain, code: string): { tone: Tone; label: string } {
  const tones: Record<string, Tone> = TONES[domain];
  const labels: Record<string, string> = fr.status[domain];

  return code in tones
    ? { tone: tones[code], label: labels[code] }
    : { tone: 'neutral', label: code };
}
