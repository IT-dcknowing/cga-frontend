import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  trainingKeys,
  trainingsApi,
  type Training,
  type TrainingRegistration,
} from '@/features/trainings/api/trainings-api';
import { RegistrationTable } from '@/features/trainings/components/registration-table';
import { RegisterPeopleDialog } from '@/features/trainings/components/training-dialogs';
import { TrainingDetails } from '@/features/trainings/components/training-details';
import { trainingRoutes } from '@/features/trainings/lib/routes';
import { upcoming } from '@/features/trainings/lib/training-helpers';
import { ApiBusinessError } from '@/lib/api-errors';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';

/*
 * Formation du réseau vue d'un CGA (03-APPFLOW §4.3, étape 7.5) : fiche de la formation du CNCGA,
 * inscriptions des agents et adhérents du centre, « Inscrire des agents ou des adhérents » (sélection
 * multiple, RG-FOR-03), « Désinscrire » une personne du centre (RG-FOR-04, délai contrôlé par le serveur).
 */
const labels = fr.trainings;

const ACTIVE = ['pending_approval', 'registered', 'waitlisted'];

function CentreRegistrations({ training }: { training: Training }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: trainingKeys.networkRegistrations(training.id),
    queryFn: () => trainingsApi.networkRegistrations(training.id),
  });

  async function cancel(registration: TrainingRegistration) {
    try {
      await trainingsApi.cancelForCentre(registration.id);
      await queryClient.invalidateQueries({ queryKey: trainingKeys.all });
      toast.success(labels.registrations.cancelled);
    } catch (error) {
      if (error instanceof ApiBusinessError) {
        toast.error(error.message);
      } else {
        toastUnexpectedError(error);
      }
    }
  }

  // Carte sans marge (tableau) : le chargement et l'erreur gardent la marge de la carte.
  if (query.isPending) {
    return <Skeleton className="m-4 h-24" />;
  }
  if (query.isError) {
    return (
      <Banner
        className="m-4 w-auto"
        tone="danger"
        role="alert"
        action={
          <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
            {fr.common.retry}
          </Button>
        }
      >
        {labels.registrations.loadError}
      </Banner>
    );
  }

  return (
    <RegistrationTable
      registrations={query.data}
      caption={labels.registrations.caption}
      paid={training.price > 0}
      actions={(registration) =>
        ACTIVE.includes(registration.status) && upcoming(training)
          ? [
              {
                label: labels.registrations.cancel,
                danger: true,
                onSelect: () => void cancel(registration),
              },
            ]
          : []
      }
    />
  );
}

export function NetworkTrainingPage() {
  const { id = '' } = useParams();
  const [registering, setRegistering] = useState(false);
  const query = useQuery({
    queryKey: trainingKeys.networkDetail(id),
    queryFn: () => trainingsApi.networkShow(id),
  });
  const back = <Link to={trainingRoutes.networkTab}>{labels.tabs.network}</Link>;

  if (query.isPending) {
    return (
      <>
        <PageHeader title={labels.title} breadcrumb={back} />
        <Skeleton className="h-48 w-full" />
      </>
    );
  }
  if (query.isError) {
    return (
      <>
        <PageHeader title={labels.title} breadcrumb={back} />
        <Banner
          tone="danger"
          role="alert"
          action={
            <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
              {fr.common.retry}
            </Button>
          }
        >
          {labels.detail.loadError}
        </Banner>
      </>
    );
  }

  const training = query.data;

  return (
    <>
      <PageHeader
        title={training.title}
        breadcrumb={back}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge domain="training" status={training.status} />
            {upcoming(training) ? (
              <Button
                onClick={() => {
                  setRegistering(true);
                }}
              >
                <UserPlus aria-hidden="true" />
                {labels.register.networkAction}
              </Button>
            ) : null}
          </div>
        }
      />
      {training.cancellation_reason === null ? null : (
        <Banner tone="danger" role="status">
          {labels.detail.cancelled(training.cancellation_reason)}
        </Banner>
      )}
      <div className="grid gap-4">
        <Card>
          <CardContent>
            <TrainingDetails training={training} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{labels.registrations.caption}</CardTitle>
          </CardHeader>
          <CardContent flush>
            <CentreRegistrations training={training} />
          </CardContent>
        </Card>
      </div>
      {registering ? (
        <RegisterPeopleDialog
          source="catalog"
          trainingId={training.id}
          onClose={() => {
            setRegistering(false);
          }}
        />
      ) : null}
    </>
  );
}
