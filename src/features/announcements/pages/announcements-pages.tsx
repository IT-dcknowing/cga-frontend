import { Plus } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/session/auth-context';
import { NewAnnouncementDialog } from '@/features/announcements/components/announcement-dialog';
import {
  AuthoredAnnouncements,
  ReceivedAnnouncements,
} from '@/features/announcements/components/announcement-lists';
import { fr } from '@/lib/i18n/fr';
import { permissionCodes } from '@/lib/reference/permissions';

/*
 * Annonces (03-APPFLOW §3.2 et §4.3, F-COM-01 et 02, étape 7.6) : `/cncga/communications` (liste des
 * annonces, « + Nouvelle annonce ») et l'onglet « Annonces » de `/cga/communications` (annonces du
 * centre si le droit le permet, annonces reçues du CNCGA).
 */
const labels = fr.announcements;

export function NewAnnouncementButton({ onClick }: { onClick: () => void }) {
  return (
    <Button onClick={onClick}>
      <Plus aria-hidden="true" />
      {labels.create.action}
    </Button>
  );
}

export function NetworkCommunicationsPage() {
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHeader
        title={fr.nav.communications}
        actions={
          <NewAnnouncementButton
            onClick={() => {
              setCreating(true);
            }}
          />
        }
      />
      <AuthoredAnnouncements space="network" />
      {creating ? (
        <NewAnnouncementDialog
          space="network"
          onClose={() => {
            setCreating(false);
          }}
        />
      ) : null}
    </>
  );
}

/** Onglet « Annonces » de `/cga/communications` ; la modale s'ouvre depuis l'en-tête de la page. */
export function CgaAnnouncementsTab({
  creating,
  onClose,
}: {
  creating: boolean;
  onClose: () => void;
}) {
  const { can } = useAuth();
  const canPublish = can(permissionCodes.cga.announcements);

  return (
    <div className="grid gap-4">
      {canPublish ? (
        <section aria-label={labels.received.published} className="grid gap-2">
          <h2 className="text-card-title font-bold">{labels.received.published}</h2>
          <AuthoredAnnouncements space="cga" />
        </section>
      ) : null}
      <ReceivedAnnouncements />
      {creating && canPublish ? <NewAnnouncementDialog space="cga" onClose={onClose} /> : null}
    </div>
  );
}
