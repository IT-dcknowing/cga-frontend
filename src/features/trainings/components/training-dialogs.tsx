import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { FormDialog } from '@/components/shared/form-dialog';
import { StatusBadge } from '@/components/shared/status-badge';
import { Banner } from '@/components/ui/banner';
import { Checkbox } from '@/components/ui/checkbox';
import { fieldProps } from '@/components/ui/field-props';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { TextField } from '@/components/ui/text-field';
import { Textarea } from '@/components/ui/textarea';
import {
  TRAINING_PAYMENT_METHODS,
  trainingKeys,
  trainingsApi,
  type Training,
  type TrainingRegistration,
  type TrainingSpace,
} from '@/features/trainings/api/trainings-api';
import { closeOn, useTrainingSubmit } from '@/features/trainings/lib/training-helpers';
import { formatAmount, formatNumber } from '@/lib/format';
import { fr } from '@/lib/i18n/fr';

/*
 * Modales des formations (03-APPFLOW §3.2 et §4.3, étape 7.5) : inscrire des personnes ciblées (RG-FOR-03 :
 * au-delà des places, liste d'attente), refuser une inscription (RG-FOR-05), enregistrer un paiement
 * (RG-FOR-06), annuler la formation (motif), clôturer la session (attestations). Le serveur refait
 * chaque contrôle.
 */
const labels = fr.trainings;
const required = fr.members.create.errors.required;

/* ------------------------------------------------------------------ Inscrire des personnes */

/**
 * « Inscrire des personnes » (organisateur) ou « Inscrire des agents ou des adhérents » (un CGA, à une
 * formation du réseau) : recherche parmi les personnes ciblées, sélection multiple.
 */
export function RegisterPeopleDialog({
  source,
  trainingId,
  onClose,
}: {
  source: TrainingSpace | 'catalog';
  trainingId: string;
  onClose: () => void;
}) {
  const text = labels.register;
  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const { errors, setErrors, conflict, submitting, run } = useTrainingSubmit();
  const query = useQuery({
    queryKey: trainingKeys.candidates(source, trainingId, search),
    queryFn: () =>
      source === 'catalog'
        ? trainingsApi.networkCandidates(trainingId, search)
        : trainingsApi.candidates(source, trainingId, search),
  });

  function toggle(id: string, checked: boolean) {
    setChosen((current) => {
      const next = new Set(current);

      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }

      return next;
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (chosen.size === 0) {
      setErrors({ membership_ids: text.none });

      return;
    }
    const ids = [...chosen];
    const counts = await run(() =>
      source === 'catalog'
        ? trainingsApi.networkRegister(trainingId, ids)
        : trainingsApi.register(source, trainingId, ids),
    );

    if (counts !== null) {
      toast.success(
        text.done(
          formatNumber(counts.registered + counts.waitlisted + counts.pending),
          formatNumber(counts.waitlisted),
        ),
      );
      onClose();
    }
  }

  const people = query.data ?? [];

  return (
    <FormDialog
      open
      onOpenChange={closeOn(onClose)}
      title={source === 'catalog' ? text.networkAction : text.title}
      submitLabel={text.submit}
      submitting={submitting}
      onSubmit={(event) => void submit(event)}
      conflict={conflict}
    >
      <FormField id="training-candidates-search" label={text.search}>
        <Input
          id="training-candidates-search"
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
        />
      </FormField>
      {errors.membership_ids === undefined ? null : (
        <Banner tone="danger" role="alert">
          {errors.membership_ids}
        </Banner>
      )}
      {query.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : query.isError ? (
        <Banner tone="danger" role="alert">
          {text.loadError}
        </Banner>
      ) : people.length === 0 ? (
        <p className="text-note text-muted">{text.empty}</p>
      ) : (
        <ul aria-label={text.caption} className="divide-y divide-border">
          {people.map((person) => {
            const id = `training-candidate-${person.membership_id}`;
            const already = person.registration_status !== null;

            return (
              <li
                key={person.membership_id}
                className="flex items-center justify-between gap-3 py-2"
              >
                <label htmlFor={id} className="flex items-start gap-2">
                  <Checkbox
                    id={id}
                    disabled={already}
                    checked={chosen.has(person.membership_id)}
                    onChange={(event) => {
                      toggle(person.membership_id, event.target.checked);
                    }}
                  />
                  <span className="grid">
                    <span className="font-semibold">{person.name}</span>
                    <span className="text-note text-muted">
                      {[
                        person.kind === 'agent'
                          ? labels.registrations.agent
                          : labels.registrations.member,
                        person.role,
                        person.company_name,
                        person.organization.name,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                </label>
                {person.registration_status === null ? null : (
                  <StatusBadge domain="trainingRegistration" status={person.registration_status} />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </FormDialog>
  );
}

/* --------------------------------------------------------------------- Refuser (RG-FOR-05) */

export function RejectRegistrationDialog({
  space,
  trainingId,
  registration,
  onClose,
}: {
  space: TrainingSpace;
  trainingId: string;
  registration: TrainingRegistration;
  onClose: () => void;
}) {
  const text = labels.reject;
  const [reason, setReason] = useState('');
  const { errors, conflict, submitting, run } = useTrainingSubmit();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const done = await run(() => trainingsApi.reject(space, trainingId, registration.id, reason));

    if (done !== null) {
      toast.success(text.done);
      onClose();
    }
  }

  return (
    <FormDialog
      open
      onOpenChange={closeOn(onClose)}
      title={text.title}
      description={registration.person.name}
      submitLabel={text.submit}
      submitting={submitting}
      onSubmit={(event) => void submit(event)}
      conflict={conflict}
      variant="danger"
    >
      <FormField id="training-reject-reason" label={text.reason} error={errors.reason}>
        <Textarea
          {...fieldProps('training-reject-reason', errors.reason, false)}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
          }}
        />
      </FormField>
    </FormDialog>
  );
}

/* ---------------------------------------------------------------------- Paiement (RG-FOR-06) */

export function PaymentDialog({
  space,
  training,
  registration,
  today,
  onClose,
}: {
  space: TrainingSpace;
  training: Training;
  registration: TrainingRegistration;
  /** Date du jour (aaaa-mm-jj), valeur par défaut du paiement. */
  today: string;
  onClose: () => void;
}) {
  const text = labels.payment;
  const [paidOn, setPaidOn] = useState(today);
  const [method, setMethod] = useState<string>(TRAINING_PAYMENT_METHODS[0]);
  const [reference, setReference] = useState('');
  const { errors, setErrors, conflict, submitting, run } = useTrainingSubmit();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (paidOn === '') {
      setErrors({ paid_on: required });

      return;
    }
    const updated = await run(() =>
      trainingsApi.payment(space, training.id, registration.id, {
        paid_on: paidOn,
        method,
        reference,
      }),
    );

    if (updated !== null) {
      toast.success(text.done(updated.receipt_number ?? ''));
      onClose();
    }
  }

  return (
    <FormDialog
      open
      onOpenChange={closeOn(onClose)}
      title={text.title}
      description={text.description(formatAmount(training.price))}
      submitLabel={text.submit}
      submitting={submitting}
      onSubmit={(event) => void submit(event)}
      conflict={conflict}
    >
      <p className="font-semibold">{registration.person.name}</p>
      <TextField
        id="training-paid-on"
        type="date"
        label={text.paidOn}
        required
        value={paidOn}
        error={errors.paid_on}
        onChange={(event) => {
          setPaidOn(event.target.value);
        }}
      />
      <FormField id="training-payment-method" label={text.method} required error={errors.method}>
        <Select
          {...fieldProps('training-payment-method', errors.method, false)}
          value={method}
          onChange={(event) => {
            setMethod(event.target.value);
          }}
        >
          {TRAINING_PAYMENT_METHODS.map((value) => (
            <option key={value} value={value}>
              {text.methods[value]}
            </option>
          ))}
        </Select>
      </FormField>
      <TextField
        id="training-payment-reference"
        label={text.reference}
        value={reference}
        error={errors.reference}
        onChange={(event) => {
          setReference(event.target.value);
        }}
      />
    </FormDialog>
  );
}

/* ------------------------------------------------------------------- Annuler la formation */

export function CancelTrainingDialog({
  space,
  training,
  onClose,
}: {
  space: TrainingSpace;
  training: Training;
  onClose: () => void;
}) {
  const text = labels.cancel;
  const [reason, setReason] = useState('');
  const { errors, setErrors, conflict, submitting, run } = useTrainingSubmit();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reason.trim() === '') {
      setErrors({ reason: required });

      return;
    }
    const done = await run(() => trainingsApi.cancel(space, training.id, reason.trim()));

    if (done !== null) {
      toast.success(text.done);
      onClose();
    }
  }

  return (
    <ConfirmDialog
      open
      onOpenChange={closeOn(onClose)}
      title={text.title}
      effects={[text.description]}
      submitLabel={text.submit}
      submitting={submitting}
      onSubmit={(event) => void submit(event)}
      conflict={conflict}
    >
      <FormField id="training-cancel-reason" label={text.reason} required error={errors.reason}>
        <Textarea
          {...fieldProps('training-cancel-reason', errors.reason, false)}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
          }}
        />
      </FormField>
    </ConfirmDialog>
  );
}

/* ------------------------------------------------------------------- Clôturer la session */

export function CompleteSessionDialog({
  space,
  training,
  onClose,
}: {
  space: TrainingSpace;
  training: Training;
  onClose: () => void;
}) {
  const text = labels.attendance;
  const { conflict, submitting, run } = useTrainingSubmit();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const done = await run(() => trainingsApi.complete(space, training.id));

    if (done !== null) {
      toast.success(text.completed(formatNumber(done.certificates)));
      onClose();
    }
  }

  return (
    <ConfirmDialog
      open
      onOpenChange={closeOn(onClose)}
      title={text.completeTitle}
      effects={text.completeEffects}
      submitLabel={text.complete}
      submitting={submitting}
      onSubmit={(event) => void submit(event)}
      conflict={conflict}
    >
      {null}
    </ConfirmDialog>
  );
}
