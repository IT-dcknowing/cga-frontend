import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  trainingKeys,
  trainingsApi,
  type TrainingInput,
  type TrainingSpace,
} from '@/features/trainings/api/trainings-api';
import { TrainingForm } from '@/features/trainings/components/training-form';
import { TrainingList } from '@/features/trainings/components/training-list';
import { trainingRoutes } from '@/features/trainings/lib/routes';
import { formatNumber } from '@/lib/format';
import { fr } from '@/lib/i18n/fr';
import { oneOf } from '@/lib/list-params';

/*
 * Formations de l'organisateur (03-APPFLOW §3.2 et §4.3, étape 7.5) : `/cncga/formations` (à venir,
 * passées, « + Créer une formation »), `/cga/formations` (onglets « Mes formations » · « Formations du
 * réseau »), création (`…/nouvelle` : « Publier » ou « Enregistrer en brouillon ») et modification
 * (`…/:id/modifier`).
 */
const labels = fr.trainings;

function CreateButton({ space }: { space: TrainingSpace }) {
  const navigate = useNavigate();

  return (
    <Button onClick={() => void navigate(trainingRoutes.create(space))}>
      <Plus aria-hidden="true" />
      {labels.create.action}
    </Button>
  );
}

export function NetworkTrainingsPage() {
  return (
    <>
      <PageHeader title={labels.networkTitle} actions={<CreateButton space="network" />} />
      <Card>
        <CardContent>
          <TrainingList source="network" />
        </CardContent>
      </Card>
    </>
  );
}

const CGA_TABS = ['mes-formations', 'reseau'] as const;

export function CgaTrainingsPage() {
  const [params, setParams] = useSearchParams();
  const tab = oneOf(CGA_TABS, params.get('onglet')) ?? 'mes-formations';

  return (
    <>
      <PageHeader title={labels.title} actions={<CreateButton space="cga" />} />
      <Tabs
        value={tab}
        onValueChange={(value) => {
          setParams(value === 'mes-formations' ? {} : { onglet: value }, { replace: true });
        }}
      >
        <TabsList>
          <TabsTrigger value="mes-formations">{labels.tabs.mine}</TabsTrigger>
          <TabsTrigger value="reseau">{labels.tabs.network}</TabsTrigger>
        </TabsList>
        <TabsContent value="mes-formations">
          <Card>
            <CardContent>
              <TrainingList source="cga" />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="reseau">
          <Card>
            <CardContent>
              <TrainingList source="catalog" />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

export function NewTrainingPage({ space }: { space: TrainingSpace }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function submit(input: TrainingInput, publish: boolean) {
    const { training, notified } = await trainingsApi.create(space, input, publish);

    await queryClient.invalidateQueries({ queryKey: trainingKeys.all });
    toast.success(
      publish ? labels.create.published(formatNumber(notified ?? 0)) : labels.create.drafted,
    );
    void navigate(trainingRoutes.detail(space, training.id));
  }

  return (
    <>
      <PageHeader
        title={labels.create.title}
        breadcrumb={<Link to={trainingRoutes.list(space)}>{labels.create.back}</Link>}
      />
      <TrainingForm onSubmit={submit} onCancel={() => void navigate(trainingRoutes.list(space))} />
    </>
  );
}

export function EditTrainingPage({ space }: { space: TrainingSpace }) {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: trainingKeys.detail(space, id),
    queryFn: () => trainingsApi.show(space, id),
  });

  async function submit(input: TrainingInput) {
    await trainingsApi.update(space, id, input);
    await queryClient.invalidateQueries({ queryKey: trainingKeys.all });
    toast.success(labels.create.saved);
    void navigate(trainingRoutes.detail(space, id));
  }

  return (
    <>
      <PageHeader
        title={labels.create.editTitle}
        breadcrumb={
          <Link to={trainingRoutes.detail(space, id)}>{query.data?.title ?? labels.title}</Link>
        }
      />
      {query.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : query.isError ? (
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
      ) : (
        <TrainingForm
          training={query.data}
          onSubmit={submit}
          onCancel={() => void navigate(trainingRoutes.detail(space, id))}
        />
      )}
    </>
  );
}
