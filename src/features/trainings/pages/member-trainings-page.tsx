import { useQuery } from '@tanstack/react-query';
import { Download, GraduationCap } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { FormDialog } from '@/components/shared/form-dialog';
import { KeyValueList } from '@/components/shared/key-value-list';
import { StatusBadge } from '@/components/shared/status-badge';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fieldProps } from '@/components/ui/field-props';
import { FormField } from '@/components/ui/form-field';
import { Radio, RadioOption } from '@/components/ui/radio';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  trainingKeys,
  trainingsApi,
  type Training,
  type TrainingRegistration,
} from '@/features/trainings/api/trainings-api';
import {
  closeOn,
  placeOf,
  upcoming,
  useTrainingSubmit,
} from '@/features/trainings/lib/training-helpers';
import { formatAmount, formatNumber, formatTimestamp } from '@/lib/format';
import { fr } from '@/lib/i18n/fr';

/*
 * `/adherent/formations` (03-APPFLOW §5.2, F-FOR-02 à 04, étape 7.5) : formations ouvertes à l'adhérent
 * (son CGA et le réseau, RG-FOR-02) et « Mes inscriptions ». « S'inscrire » → récapitulatif (date, lieu,
 * prix) → inscription confirmée, liste d'attente avec sa position (RG-FOR-03) ou en attente de validation
 * (RG-FOR-05) ; « Se désinscrire » (délai J-n contrôlé par le serveur, RG-FOR-04) ; après la session,
 * « Évaluer » (note 1 à 5 et commentaire) et « Télécharger l'attestation » si présent.
 */
const labels = fr.trainings;
const text = labels.member;
const SCORES = [1, 2, 3, 4, 5] as const;
const ACTIVE = ['pending_approval', 'registered', 'waitlisted'];

function priceOf(training: { price: number }): string {
  return training.price === 0 ? labels.detail.free : formatAmount(training.price);
}

function outcome(registration: TrainingRegistration): string {
  switch (registration.status) {
    case 'waitlisted':
      return text.waitlisted(formatNumber(registration.waitlist_rank ?? 0));
    case 'pending_approval':
      return text.pending;
    default:
      return text.registered;
  }
}

function RegisterDialog({ training, onClose }: { training: Training; onClose: () => void }) {
  const { conflict, submitting, run } = useTrainingSubmit();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const registration = await run(() => trainingsApi.registerSelf(training.id));

    if (registration !== null) {
      toast.success(outcome(registration));
      onClose();
    }
  }

  return (
    <FormDialog
      open
      onOpenChange={closeOn(onClose)}
      title={text.registerTitle}
      description={training.title}
      submitLabel={text.confirm}
      submitting={submitting}
      onSubmit={(event) => void submit(event)}
      conflict={conflict}
    >
      <KeyValueList
        items={[
          {
            label: labels.detail.when,
            value: labels.detail.whenValue(
              formatTimestamp(training.starts_at),
              formatTimestamp(training.ends_at),
            ),
          },
          { label: labels.detail.place, value: placeOf(training) },
          { label: labels.detail.price, value: priceOf(training) },
        ]}
      />
    </FormDialog>
  );
}

function CancelDialog({
  registration,
  onClose,
}: {
  registration: TrainingRegistration;
  onClose: () => void;
}) {
  const { conflict, submitting, run } = useTrainingSubmit();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const done = await run(() => trainingsApi.cancelMine(registration.id));

    if (done !== null) {
      toast.success(text.cancelled);
      onClose();
    }
  }

  return (
    <ConfirmDialog
      open
      onOpenChange={closeOn(onClose)}
      title={text.cancelTitle}
      description={registration.training?.title}
      effects={text.cancelEffects}
      submitLabel={text.cancel}
      submitting={submitting}
      onSubmit={(event) => void submit(event)}
      conflict={conflict}
    >
      {null}
    </ConfirmDialog>
  );
}

function EvaluateDialog({
  registration,
  onClose,
}: {
  registration: TrainingRegistration;
  onClose: () => void;
}) {
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const { errors, setErrors, conflict, submitting, run } = useTrainingSubmit();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (score === null) {
      setErrors({ score: fr.members.create.errors.required });

      return;
    }
    const done = await run(() => trainingsApi.evaluate(registration.id, score, comment));

    if (done !== null) {
      toast.success(text.evaluated);
      onClose();
    }
  }

  return (
    <FormDialog
      open
      onOpenChange={closeOn(onClose)}
      title={text.evaluateTitle}
      description={registration.training?.title}
      submitLabel={text.evaluate}
      submitting={submitting}
      onSubmit={(event) => void submit(event)}
      conflict={conflict}
    >
      <fieldset
        className="grid gap-1"
        aria-describedby={errors.score === undefined ? undefined : 'training-score-error'}
      >
        <legend className="mb-1.5 text-label font-semibold text-muted">{text.score}</legend>
        <div className="flex flex-wrap gap-4">
          {SCORES.map((value) => (
            <RadioOption key={value} label={text.scoreValue(String(value))}>
              <Radio
                name="training-score"
                value={value}
                checked={score === value}
                onChange={() => {
                  setScore(value);
                }}
              />
            </RadioOption>
          ))}
        </div>
        {errors.score === undefined ? null : (
          <p id="training-score-error" className="text-note text-danger">
            {errors.score}
          </p>
        )}
      </fieldset>
      <FormField id="training-comment" label={text.comment} error={errors.comment}>
        <Textarea
          {...fieldProps('training-comment', errors.comment, false)}
          value={comment}
          onChange={(event) => {
            setComment(event.target.value);
          }}
        />
      </FormField>
    </FormDialog>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
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
      {text.loadError}
    </Banner>
  );
}

function OpenTrainings() {
  const [registering, setRegistering] = useState<Training | null>(null);
  const query = useQuery({ queryKey: trainingKeys.mine, queryFn: () => trainingsApi.mine() });

  if (query.isPending) {
    return <Skeleton className="h-32 w-full" />;
  }
  if (query.isError) {
    return <LoadError onRetry={() => void query.refetch()} />;
  }
  if (query.data.length === 0) {
    return <EmptyState icon={GraduationCap}>{text.empty}</EmptyState>;
  }

  return (
    <>
      <ul aria-label={text.open} className="divide-y divide-border">
        {query.data.map((training) => (
          <li key={training.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <span className="grid gap-0.5">
              <span className="font-semibold">{training.title}</span>
              <span className="text-note text-muted">
                {[
                  formatTimestamp(training.starts_at),
                  labels.formats[training.format] ?? training.format_label,
                  placeOf(training),
                  priceOf(training),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              {training.organizer === undefined ? null : (
                <span className="text-note text-muted">
                  {text.organizer(training.organizer.name)}
                </span>
              )}
            </span>
            {training.my_registration === null || training.my_registration === undefined ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setRegistering(training);
                }}
              >
                {text.register}
              </Button>
            ) : (
              <span className="flex items-center gap-2 text-note text-muted">
                {text.already}
                <StatusBadge
                  domain="trainingRegistration"
                  status={training.my_registration.status}
                />
              </span>
            )}
          </li>
        ))}
      </ul>
      {registering === null ? null : (
        <RegisterDialog
          training={registering}
          onClose={() => {
            setRegistering(null);
          }}
        />
      )}
    </>
  );
}

type RegistrationDialog =
  | { kind: 'cancel'; registration: TrainingRegistration }
  | { kind: 'evaluate'; registration: TrainingRegistration };

function MyRegistrations() {
  const [dialog, setDialog] = useState<RegistrationDialog | null>(null);
  const query = useQuery({
    queryKey: trainingKeys.myRegistrations,
    queryFn: () => trainingsApi.myRegistrations(),
  });

  if (query.isPending) {
    return <Skeleton className="h-32 w-full" />;
  }
  if (query.isError) {
    return <LoadError onRetry={() => void query.refetch()} />;
  }
  if (query.data.length === 0) {
    return <p className="text-note text-muted">{text.noRegistration}</p>;
  }

  return (
    <>
      <ul aria-label={text.mine} className="divide-y divide-border">
        {query.data.map((registration) => {
          const training = registration.training;
          const canCancel =
            training !== undefined && upcoming(training) && ACTIVE.includes(registration.status);
          const canEvaluate =
            training?.status === 'completed' &&
            registration.attendance === 'present' &&
            (registration.evaluation === null || registration.evaluation === undefined);

          return (
            <li key={registration.id} className="grid gap-2 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="grid gap-0.5">
                  <span className="font-semibold">{training?.title}</span>
                  <span className="text-note text-muted">
                    {training === undefined
                      ? null
                      : [
                          formatTimestamp(training.starts_at),
                          text.organizer(training.organizer),
                        ].join(' · ')}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <StatusBadge domain="trainingRegistration" status={registration.status} />
                  {registration.waitlist_rank === null ? null : (
                    <span className="text-note text-muted">
                      {labels.registrations.rank(formatNumber(registration.waitlist_rank))}
                    </span>
                  )}
                  {registration.payment_status === 'not_applicable' ? null : (
                    <StatusBadge domain="trainingPayment" status={registration.payment_status} />
                  )}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {registration.evaluation === null ||
                registration.evaluation === undefined ? null : (
                  <span className="text-note text-muted">
                    {text.yourScore(String(registration.evaluation.score))}
                  </span>
                )}
                {registration.certificate_url === null ? null : (
                  <Button asChild size="sm" variant="secondary">
                    <a href={registration.certificate_url}>
                      <Download aria-hidden="true" />
                      {text.certificate}
                    </a>
                  </Button>
                )}
                {registration.receipt_url === null ? null : (
                  <Button asChild size="sm" variant="secondary">
                    <a href={registration.receipt_url}>
                      <Download aria-hidden="true" />
                      {text.receipt}
                    </a>
                  </Button>
                )}
                {canEvaluate ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setDialog({ kind: 'evaluate', registration });
                    }}
                  >
                    {text.evaluate}
                  </Button>
                ) : null}
                {canCancel ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setDialog({ kind: 'cancel', registration });
                    }}
                  >
                    {text.cancel}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {dialog?.kind === 'cancel' ? (
        <CancelDialog
          registration={dialog.registration}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
      {dialog?.kind === 'evaluate' ? (
        <EvaluateDialog
          registration={dialog.registration}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
    </>
  );
}

export function MemberTrainingsPage() {
  return (
    <>
      <PageHeader title={labels.title} />
      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>{text.open}</CardTitle>
          </CardHeader>
          <CardContent>
            <OpenTrainings />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{text.mine}</CardTitle>
          </CardHeader>
          <CardContent>
            <MyRegistrations />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
