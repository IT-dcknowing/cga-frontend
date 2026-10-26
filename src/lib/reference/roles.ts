import { fr } from '@/lib/i18n/fr';

const labels: Record<string, string> = fr.roles;

/**
 * Libellé d'un rôle (01-PRD §3.1). Un rôle inconnu de cette version s'affiche tel quel plutôt que
 * de laisser un blanc : la liste des rôles est un référentiel, donc susceptible d'évoluer.
 */
export function roleLabel(role: string): string {
  return labels[role] ?? role;
}
