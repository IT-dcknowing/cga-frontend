import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Pencil, Send, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Radio } from '@/components/ui/radio';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  trainingKeys,
  trainingsApi,
  type Training,
  type TrainingRegistration,
  type TrainingSpace,
} from '@/features/trainings/api/trainings-api';
import { RegistrationTable } from '@/features/trainings/components/registration-table';
import {
  CancelTrainingDialog,
  CompleteSessionDialog,
  PaymentDialog,
  RegisterPeopleDialog,
  RejectRegistrationDialog,
} from '@/features/trainings/components/training-dialogs';
import { TrainingDetails } from '@/features/trainings/components/training-details';
import { trainingRoutes } from '@/features/trainings/lib/routes';
import { ApiBusinessError } from '@/lib/api-errors';
import { formatNumber } from '@/lib/format';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';
import { oneOf } from '@/lib/list-params';

/*
 * Formation de l'organisateur (03-APPFLOW §3.2 `/cncga/formations/:id`, §4.3 « Détail d'une formation
 * organisée », étape 7.5) : onglets Détails · Inscrits · Liste d'attente · Présence · Évaluations ;
 * « Modifier », « Publier », « Inscrire des personnes », « Annuler la formation » selon le bloc `can` du
 * serveur ; valider ou refuser une inscription (RG-FOR-05), enregistrer un paiement (RG-FOR-06) ; après la
 * date, émargement puis « Clôturer la session » (attestations pour les présents).
 */
const labels = fr.trainings;
const TABS = ['details', 'inscrits', 'attente', 'presence', 'evaluations'] as const;

type Tab = (typeof TABS)[number];

/** Date du jour à Abidjan (UTC), valeur par défaut d'un paiement. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function useRegistrations(space: TrainingSpace, id: string) {
  return useQuery({
    queryKey: trainingKeys.registrations(space, id),
    queryFn: () => trainingsApi.registrations(space, id),
  });
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Banner
      tone="danger"
      role="alert"
      action={
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {fr.common.retry}
        </Button>
      }
    >
      {message}
    </Banner>
  );
}

type RowDialog =
  | { kind: 'reject'; registration: TrainingRegistration }
  | { kind: 'payment'; registration: TrainingRegistration };

function RegistrationsTab({
  space,
  training,
  waitlist,
}: {
  space: TrainingSpace;
  training: Training;
  waitlist: boolean;
}) {
  const queryClient = useQueryClient();
  const query = useRegistrations(space, training.id);
  const [dialog, setDialog] = useState<RowDialog | null>(null);

  async function approve(registration: TrainingRegistration) {
    try {
      await trainingsApi.approve(space, training.id, registration.id);
      await queryClient.invalidateQueries({ queryKey: trainingKeys.all });
      toast.success(labels.registrations.approved);
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
      <div className="p-4">
        <LoadError message={labels.registrations.loadError} onRetry={() => void query.refetch()} />
      </div>
    );
  }

  const rows = query.data
    .filter((registration) => (registration.status === 'waitlisted') === waitlist)
    .sort((a, b) => (a.waitlist_rank ?? 0) - (b.waitlist_rank ?? 0));

  return (
    <>
      <RegistrationTable
        registrations={rows}
        caption={waitlist ? labels.tabs.waitlist : labels.tabs.registered}
        paid={training.price > 0}
        actions={(registration) => [
          ...(registration.status === 'pending_approval'
            ? [
                {
                  label: labels.registrations.approve,
                  onSelect: () => void approve(registration),
                },
                {
                  label: labels.registrations.reject,
                  danger: true,
                  onSelect: () => {
                    setDialog({ kind: 'reject', registration });
                  },
                },
              ]
            : []),
          ...(registration.payment_status === 'to_pay' &&
          ['registered', 'pending_approval'].includes(registration.status)
            ? [
                {
                  label: labels.payment.action,
                  onSelect: () => {
                    setDialog({ kind: 'payment', registration });
                  },
                },
              ]
            : []),
        ]}
      />
      {dialog?.kind === 'reject' ? (
        <RejectRegistrationDialog
          space={space}
          trainingId={training.id}
          registration={dialog.registration}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
      {dialog?.kind === 'payment' ? (
        <PaymentDialog
          space={space}
          training={training}
          registration={dialog.registration}
          today={today()}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
    </>
  );
}

function AttendanceTab({ space, training }: { space: TrainingSpace; training: Training }) {
  const queryClient = useQueryClient();
  const query = useRegistrations(space, training.id);
  const [marks, setMarks] = useState<Record<string, 'present' | 'absent'>>({});
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const text = labels.attendance;
  const editable = training.can?.attendance === true;

  if (training.status === 'completed') {
    return <Banner tone="success">{labels.detail.completed}</Banner>;
  }
  if (!editable) {
    return <Banner tone="warning">{text.notYet}</Banner>;
  }
  if (query.isPending) {
    return <Skeleton className="h-24 w-full" />;
  }
  if (query.isError) {
    return (
      <LoadError message={labels.registrations.loadError} onRetry={() => void query.refetch()} />
    );
  }

  const attendees = query.data.filter((registration) => registration.status === 'registered');

  function value(registration: TrainingRegistration): 'present' | 'absent' | null {
    return marks[registration.id] ?? registration.attendance;
  }

  async function save() {
    const rows = attendees.flatMap((registration) => {
      const status = value(registration);

      return status === null ? [] : [{ registration_id: registration.id, status }];
    });

    if (rows.length === 0) {
      return;
    }
    setSaving(true);
    try {
      const marked = await trainingsApi.attendance(space, training.id, rows);

      await queryClient.invalidateQueries({
        queryKey: trainingKeys.registrations(space, training.id),
      });
      setMarks({});
      toast.success(text.saved(formatNumber(marked)));
    } catch (error) {
      if (error instanceof ApiBusinessError) {
        toast.error(error.message);
      } else {
        toastUnexpectedError(error);
      }
    } finally {
      setSaving(false);
    }
  }

  if (attendees.length === 0) {
    return <p className="text-note text-muted">{text.empty}</p>;
  }

  return (
    <div className="grid gap-4">
      <ul aria-label={text.caption} className="divide-y divide-border">
        {attendees.map((registration) => (
          <li
            key={registration.id}
            className="flex flex-wrap items-center justify-between gap-3 py-2"
          >
            <span className="font-semibold">{registration.person.name}</span>
            <fieldset className="flex gap-4">
              <legend className="sr-only">{text.mark(registration.person.name)}</legend>
              {(['present', 'absent'] as const).map((status) => (
                <label key={status} className="flex items-center gap-2">
                  <Radio
                    name={`attendance-${registration.id}`}
                    value={status}
                    checked={value(registration) === status}
                    onChange={() => {
                      setMarks((current) => ({ ...current, [registration.id]: status }));
                    }}
                  />
                  {status === 'present' ? text.present : text.absent}
                </label>
              ))}
            </fieldset>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" loading={saving} onClick={() => void save()}>
          {text.save}
        </Button>
        {training.can?.complete === true ? (
          <Button
            onClick={() => {
              setCompleting(true);
            }}
          >
            {text.complete}
          </Button>
        ) : null}
      </div>
      {completing ? (
        <CompleteSessionDialog
          space={space}
          training={training}
          onClose={() => {
            setCompleting(false);
          }}
        />
      ) : null}
    </div>
  );
}

function EvaluationsTab({ space, training }: { space: TrainingSpace; training: Training }) {
  const text = labels.evaluations;
  const query = useQuery({
    queryKey: trainingKeys.evaluations(space, training.id),
    queryFn: () => trainingsApi.evaluations(space, training.id),
  });

  if (query.isPending) {
    return <Skeleton className="h-24 w-full" />;
  }
  if (query.isError) {
    return <LoadError message={text.loadError} onRetry={() => void query.refetch()} />;
  }

  const data = query.data;

  return (
    <div className="grid gap-4">
      <dl className="grid grid-cols-3 gap-3">
        {(
          [
            [text.present, formatNumber(data.present)],
            [text.answers, formatNumber(data.answers)],
            [
              text.average,
              data.average === null
                ? text.none
                : text.averageValue(data.average.toLocaleString('fr-FR')),
            ],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="grid gap-0.5">
            <dt className="text-note text-muted">{label}</dt>
            <dd className="font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      <div>
        <p className="text-label font-semibold">{text.distribution}</p>
        <ul aria-label={text.distribution} className="mt-1 grid gap-1">
          {Object.entries(data.distribution).map(([score, count]) => (
            <li key={score} className="flex justify-between gap-4 text-note">
              <span>{text.score(score)}</span>
              <span className="font-semibold">{formatNumber(count)}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-label font-semibold">{text.comments}</p>
        {data.comments.length === 0 ? (
          <p className="text-note text-muted">{text.noComment}</p>
        ) : (
          <ul aria-label={text.comments} className="mt-1 grid gap-2">
            {data.comments.map((comment, index) => (
              <li key={index} className="rounded-card border border-border p-3">
                <p className="text-note text-muted">{text.score(String(comment.score))}</p>
                <p>{comment.comment}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

type PageDialog = 'register' | 'cancel' | null;

function TrainingView({ space, training }: { space: TrainingSpace; training: Training }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab: Tab = oneOf(TABS, params.get('onglet')) ?? 'details';
  const [dialog, setDialog] = useState<PageDialog>(null);
  const [publishing, setPublishing] = useState(false);
  const can = training.can;

  async function publish() {
    setPublishing(true);
    try {
      const { notified } = await trainingsApi.publish(space, training.id);

      await queryClient.invalidateQueries({ queryKey: trainingKeys.all });
      toast.success(labels.detail.published(formatNumber(notified ?? 0)));
    } catch (error) {
      if (error instanceof ApiBusinessError) {
        toast.error(error.message);
      } else {
        toastUnexpectedError(error);
      }
    } finally {
      setPublishing(false);
    }
  }

  return (
    <>
      <PageHeader
        title={training.title}
        breadcrumb={<Link to={trainingRoutes.list(space)}>{labels.create.back}</Link>}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge domain="training" status={training.status} />
            {can?.update === true ? (
              <Button
                variant="secondary"
                onClick={() => void navigate(trainingRoutes.edit(space, training.id))}
              >
                <Pencil aria-hidden="true" />
                {labels.detail.edit}
              </Button>
            ) : null}
            {can?.register === true ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setDialog('register');
                }}
              >
                <UserPlus aria-hidden="true" />
                {labels.register.action}
              </Button>
            ) : null}
            {can?.cancel === true ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setDialog('cancel');
                }}
              >
                <Ban aria-hidden="true" />
                {labels.cancel.action}
              </Button>
            ) : null}
            {can?.publish === true ? (
              <Button loading={publishing} onClick={() => void publish()}>
                <Send aria-hidden="true" />
                {labels.detail.publish}
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
      <Tabs
        value={tab}
        onValueChange={(value) => {
          setParams(value === 'details' ? {} : { onglet: value }, { replace: true });
        }}
      >
        <TabsList>
          <TabsTrigger value="details">{labels.tabs.details}</TabsTrigger>
          <TabsTrigger value="inscrits">{labels.tabs.registered}</TabsTrigger>
          <TabsTrigger value="attente">{labels.tabs.waitlist}</TabsTrigger>
          <TabsTrigger value="presence">{labels.tabs.attendance}</TabsTrigger>
          <TabsTrigger value="evaluations">{labels.tabs.evaluations}</TabsTrigger>
        </TabsList>
        <TabsContent value="details">
          <Card>
            <CardContent>
              <TrainingDetails training={training} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="inscrits">
          <Card>
            <CardContent flush>
              <RegistrationsTab space={space} training={training} waitlist={false} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="attente">
          <Card>
            <CardContent flush>
              <RegistrationsTab space={space} training={training} waitlist />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="presence">
          <Card>
            <CardContent>
              <AttendanceTab space={space} training={training} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="evaluations">
          <Card>
            <CardContent>
              <EvaluationsTab space={space} training={training} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      {dialog === 'register' ? (
        <RegisterPeopleDialog
          source={space}
          trainingId={training.id}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
      {dialog === 'cancel' ? (
        <CancelTrainingDialog
          space={space}
          training={training}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
    </>
  );
}

export function TrainingPage({ space }: { space: TrainingSpace }) {
  const { id = '' } = useParams();
  const query = useQuery({
    queryKey: trainingKeys.detail(space, id),
    queryFn: () => trainingsApi.show(space, id),
  });

  if (query.isPending) {
    return (
      <>
        <PageHeader title={labels.title} />
        <Skeleton className="h-48 w-full" />
      </>
    );
  }
  if (query.isError) {
    return (
      <>
        <PageHeader
          title={labels.title}
          breadcrumb={<Link to={trainingRoutes.list(space)}>{labels.create.back}</Link>}
        />
        <LoadError message={labels.detail.loadError} onRetry={() => void query.refetch()} />
      </>
    );
  }

  return <TrainingView space={space} training={query.data} />;
}
