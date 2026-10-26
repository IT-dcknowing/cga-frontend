import { Link } from 'react-router';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/session/auth-context';
import { useCgaProfile } from '@/features/cga-settings/api/queries';
import { cgaSettingsRoutes } from '@/features/cga-settings/lib/routes';
import { fr } from '@/lib/i18n/fr';
import { permissionCodes } from '@/lib/reference/permissions';

/*
 * Bandeaux de l'espace CGA (03-APPFLOW §4.2) : centre suspendu (consultation seule, RG-ORG-08), fiche
 * incomplète (documents bloqués, RG-ORG-04), agrément en cours (inscriptions bloquées, RG-ORG-03).
 * Lus dans la fiche du centre, pour les agents qui ont le droit de la voir ; le serveur refuse de
 * lui-même toute écriture interdite.
 */
const labels = fr.cgaSettings.banners;

export function CgaBanners() {
  const { can } = useAuth();
  const profile = useCgaProfile(can(permissionCodes.cga.profile));

  if (profile.data === undefined) {
    return null;
  }

  const { status, missing_fields: missing, agreement_status: agreement } = profile.data;
  const banners = [];

  if (status === 'suspended') {
    banners.push(
      <Banner key="suspended" tone="danger">
        {labels.suspended}
      </Banner>,
    );
  }

  if (missing.length > 0) {
    banners.push(
      <Banner
        key="incomplete"
        tone="warning"
        action={
          <Button variant="secondary" size="sm" asChild>
            <Link to={`${cgaSettingsRoutes.root}?onglet=centre`}>{labels.complete}</Link>
          </Button>
        }
      >
        {labels.incomplete}
      </Banner>,
    );
  }

  if (agreement === 'pending') {
    banners.push(
      <Banner key="agreement" tone="warning">
        {labels.agreementPending}
      </Banner>,
    );
  }

  return banners.length === 0 ? null : <div className="mb-4 grid gap-2">{banners}</div>;
}
