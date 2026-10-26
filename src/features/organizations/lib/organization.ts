import type { Organization } from '@/features/organizations/api/organizations-api';

/** Adresses des écrans du registre (03-APPFLOW §3.2). */
export const organizationRoutes = {
  list: '/cncga/membres',
  detail: (id: string) => `/cncga/membres/${encodeURIComponent(id)}`,
} as const;

/** F-ORG-07 : un agrément retiré ne repasse pas « en cours » ou « agréé » par la fiche. */
export function isAgreementWithdrawn(organization: Organization): boolean {
  return organization.agreement_status === 'withdrawn';
}

/** Un CGA résilié n'est plus modifiable (RG-ORG-07). */
export function isTerminated(organization: Organization): boolean {
  return organization.status === 'terminated';
}
