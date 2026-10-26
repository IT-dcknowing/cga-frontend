import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import {
  useForm,
  type FieldValues,
  type Path,
  type UseFormRegisterReturn,
  type UseFormSetError,
} from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { FormDialog } from '@/components/shared/form-dialog';
import { Checkbox, CheckboxField } from '@/components/ui/checkbox';
import { fieldProps } from '@/components/ui/field-props';
import { FormField } from '@/components/ui/form-field';
import { Radio, RadioGroupField, RadioOption } from '@/components/ui/radio';
import { TextField } from '@/components/ui/text-field';
import { Textarea } from '@/components/ui/textarea';
import { organizationsApi } from '@/features/organizations/api';
import {
  SUBSCRIPTION_STATUSES,
  type Organization,
} from '@/features/organizations/api/organizations-api';
import { useOrganizationSaved } from '@/features/organizations/api/queries';
import { emptyToNull, managerSchema, type ManagerForm } from '@/features/organizations/lib/schemas';
import { ApiBusinessError } from '@/lib/api-errors';
import { showValidationErrors } from '@/lib/form-errors';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';

/*
 * Modales de la fiche d'un CGA (03-APPFLOW §3.2) : abonnement (F-ORG-05), suspension et réactivation
 * avec motif (F-ORG-06), retrait d'agrément (F-ORG-07), invitation du gérant. Chacune envoie sa
 * requête, met la fiche à jour avec la réponse du serveur, puis affiche son toast ; un conflit 409
 * reste dans la modale avec le message de l'API (03-APPFLOW §7).
 */
const labels = fr.organization;
const errors = labels.errors;

type DialogProps = {
  organization: Organization;
  onClose: () => void;
};

/** Ferme la modale quand Radix la ferme (Échap, croix, Annuler). */
function closeWith(onClose: () => void) {
  return (open: boolean) => {
    if (!open) {
      onClose();
    }
  };
}

/** Échec d'une écriture : 409 → message dans la modale ; 422 → sous les champs ; le reste → toast. */
function handleFailure<T extends FieldValues>(
  error: unknown,
  setConflict: (message: string) => void,
  setError: UseFormSetError<T>,
  fields: Partial<Record<string, Path<T>>>,
): void {
  if (error instanceof ApiBusinessError) {
    setConflict(error.message);
  } else if (!showValidationErrors(error, setError, fields)) {
    toastUnexpectedError(error);
  }
}

/** Écriture d'une modale : fiche à jour, toast, fermeture ; un échec reste dans la modale. */
function useSaveFrom(onClose: () => void) {
  const saved = useOrganizationSaved();
  const [conflict, setConflict] = useState<string | null>(null);

  async function save<T extends FieldValues>(
    call: () => Promise<Organization>,
    done: string,
    setError: UseFormSetError<T>,
    fields: Partial<Record<string, Path<T>>>,
  ) {
    setConflict(null);

    try {
      saved(await call());
      toast.success(done);
      onClose();
    } catch (error) {
      handleFailure(error, setConflict, setError, fields);
    }
  }

  return { conflict, save };
}

function ReasonField({
  id,
  label,
  required = true,
  error,
  registration,
}: {
  id: string;
  label: string;
  required?: boolean;
  error: string | undefined;
  registration: UseFormRegisterReturn;
}) {
  return (
    <FormField id={id} label={label} required={required} error={error}>
      <Textarea
        {...fieldProps(id, error)}
        aria-required={required || undefined}
        {...registration}
      />
    </FormField>
  );
}

const subscriptionSchema = z.object({
  status: z.enum(SUBSCRIPTION_STATUSES),
  reason: z.string().trim(),
});

type SubscriptionForm = z.infer<typeof subscriptionSchema>;

/** Abonnement (F-ORG-05) : non abonné, essai, abonné, résilié ; les dates sont posées par le serveur. */
export function SubscriptionDialog({ organization, onClose }: DialogProps) {
  const { conflict, save } = useSaveFrom(onClose);
  const current = SUBSCRIPTION_STATUSES.find(
    (status) => status === organization.subscription.status,
  );
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors: fieldErrors, isSubmitting },
  } = useForm<SubscriptionForm>({
    resolver: zodResolver(subscriptionSchema),
    defaultValues: { status: current ?? 'none', reason: '' },
  });

  const submit = handleSubmit((values) =>
    save(
      () =>
        organizationsApi.changeSubscription(organization.id, {
          status: values.status,
          reason: emptyToNull(values.reason),
        }),
      labels.subscription.done,
      setError,
      { status: 'status', reason: 'reason' },
    ),
  );

  return (
    <FormDialog
      open
      onOpenChange={closeWith(onClose)}
      title={labels.subscription.title}
      description={organization.name}
      submitLabel={labels.subscription.submit}
      submitting={isSubmitting}
      onSubmit={submit}
      conflict={conflict}
    >
      <RadioGroupField
        id="subscription-state"
        legend={labels.subscription.state}
        error={fieldErrors.status?.message}
      >
        {SUBSCRIPTION_STATUSES.map((status) => (
          <RadioOption key={status} label={fr.status.subscription[status]}>
            <Radio value={status} {...register('status')} />
          </RadioOption>
        ))}
      </RadioGroupField>
      <FormField
        id="subscription-reason"
        label={labels.subscription.reason}
        error={fieldErrors.reason?.message}
      >
        <Textarea
          {...fieldProps('subscription-reason', fieldErrors.reason?.message)}
          {...register('reason')}
        />
      </FormField>
      <p className="text-note text-muted">{labels.subscription.hint}</p>
    </FormDialog>
  );
}

const reasonField = z.string().trim().min(1, errors.reasonRequired);
const confirmedField = z.boolean().refine((value) => value, errors.confirmRequired);

const suspendSchema = z.object({ reason: reasonField, confirmed: confirmedField });

type SuspendForm = z.infer<typeof suspendSchema>;

/** Suspension : action à effet majeur, donc liste des effets et case « Je confirme » (04-UX-UI §6). */
export function SuspendDialog({ organization, onClose }: DialogProps) {
  const { conflict, save } = useSaveFrom(onClose);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors: fieldErrors, isSubmitting },
  } = useForm<SuspendForm>({
    resolver: zodResolver(suspendSchema),
    defaultValues: { reason: '', confirmed: false },
  });

  const submit = handleSubmit(({ reason }) =>
    save(() => organizationsApi.suspend(organization.id, reason), labels.suspend.done, setError, {
      reason: 'reason',
    }),
  );

  return (
    <ConfirmDialog
      open
      onOpenChange={closeWith(onClose)}
      title={labels.suspend.title}
      description={organization.name}
      effects={labels.suspend.effects}
      submitLabel={labels.suspend.submit}
      submitting={isSubmitting}
      onSubmit={submit}
      conflict={conflict}
    >
      <ReasonField
        id="suspend-reason"
        label={labels.suspend.reason}
        error={fieldErrors.reason?.message}
        registration={register('reason')}
      />
      <CheckboxField
        id="suspend-confirmed"
        label={labels.suspend.confirm(organization.name)}
        error={fieldErrors.confirmed?.message}
      >
        <Checkbox
          {...fieldProps('suspend-confirmed', fieldErrors.confirmed?.message)}
          {...register('confirmed')}
        />
      </CheckboxField>
    </ConfirmDialog>
  );
}

const reactivateSchema = z.object({ reason: reasonField });

type ReactivateForm = z.infer<typeof reactivateSchema>;

export function ReactivateDialog({ organization, onClose }: DialogProps) {
  const { conflict, save } = useSaveFrom(onClose);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors: fieldErrors, isSubmitting },
  } = useForm<ReactivateForm>({
    resolver: zodResolver(reactivateSchema),
    defaultValues: { reason: '' },
  });

  const submit = handleSubmit(({ reason }) =>
    save(
      () => organizationsApi.reactivate(organization.id, reason),
      labels.reactivate.done,
      setError,
      { reason: 'reason' },
    ),
  );

  return (
    <FormDialog
      open
      onOpenChange={closeWith(onClose)}
      title={labels.reactivate.title}
      description={organization.name}
      submitLabel={labels.reactivate.submit}
      submitting={isSubmitting}
      onSubmit={submit}
      conflict={conflict}
    >
      <ReasonField
        id="reactivate-reason"
        label={labels.reactivate.reason}
        error={fieldErrors.reason?.message}
        registration={register('reason')}
      />
    </FormDialog>
  );
}

const withdrawSchema = z.object({
  withdrawn_at: z.string().min(1, errors.dateRequired),
  reason: reasonField,
  confirmed: confirmedField,
});

type WithdrawForm = z.infer<typeof withdrawSchema>;

/**
 * Retrait d'agrément (F-ORG-07, Présidente) : le CGA est suspendu et l'état des résiliations de ses
 * adhérents est préparé ; aucune radiation n'est faite d'office (RG-ADH-18).
 */
export function WithdrawAgreementDialog({ organization, onClose }: DialogProps) {
  const { conflict, save } = useSaveFrom(onClose);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors: fieldErrors, isSubmitting },
  } = useForm<WithdrawForm>({
    resolver: zodResolver(withdrawSchema),
    defaultValues: { withdrawn_at: '', reason: '', confirmed: false },
  });

  const submit = handleSubmit(({ withdrawn_at: withdrawnAt, reason }) =>
    save(
      () =>
        organizationsApi.withdrawAgreement(organization.id, { withdrawn_at: withdrawnAt, reason }),
      labels.withdraw.done,
      setError,
      { withdrawn_at: 'withdrawn_at', reason: 'reason' },
    ),
  );

  return (
    <ConfirmDialog
      open
      onOpenChange={closeWith(onClose)}
      title={labels.withdraw.title}
      description={organization.name}
      effects={labels.withdraw.effects}
      submitLabel={labels.withdraw.submit}
      submitting={isSubmitting}
      onSubmit={submit}
      conflict={conflict}
    >
      <TextField
        id="withdraw-date"
        label={labels.withdraw.date}
        required
        type="date"
        error={fieldErrors.withdrawn_at?.message}
        {...register('withdrawn_at')}
      />
      <ReasonField
        id="withdraw-reason"
        label={labels.withdraw.reason}
        error={fieldErrors.reason?.message}
        registration={register('reason')}
      />
      <CheckboxField
        id="withdraw-confirmed"
        label={labels.withdraw.confirm(organization.name)}
        error={fieldErrors.confirmed?.message}
      >
        <Checkbox
          {...fieldProps('withdraw-confirmed', fieldErrors.confirmed?.message)}
          {...register('confirmed')}
        />
      </CheckboxField>
    </ConfirmDialog>
  );
}

/** Invitation du gérant (F-ORG-02, « Ouvrir l'accès ») ; 409 si le CGA a déjà un gérant. */
export function InviteManagerDialog({ organization, onClose }: DialogProps) {
  const { conflict, save } = useSaveFrom(onClose);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors: fieldErrors, isSubmitting },
  } = useForm<ManagerForm>({
    resolver: zodResolver(managerSchema),
    defaultValues: { first_name: '', last_name: '', phone: '' },
  });

  const submit = handleSubmit((values) =>
    save(
      () => organizationsApi.inviteManager(organization.id, values),
      labels.invite.done,
      setError,
      { first_name: 'first_name', last_name: 'last_name', phone: 'phone' },
    ),
  );

  return (
    <FormDialog
      open
      onOpenChange={closeWith(onClose)}
      title={labels.invite.title}
      description={organization.name}
      submitLabel={labels.invite.submit}
      submitting={isSubmitting}
      onSubmit={submit}
      conflict={conflict}
    >
      <p className="text-note text-muted">{labels.invite.hint}</p>
      <div className="grid gap-4 md:grid-cols-2">
        <TextField
          id="invite-first-name"
          label={labels.invite.firstName}
          required
          autoComplete="off"
          error={fieldErrors.first_name?.message}
          {...register('first_name')}
        />
        <TextField
          id="invite-last-name"
          label={labels.invite.lastName}
          required
          autoComplete="off"
          error={fieldErrors.last_name?.message}
          {...register('last_name')}
        />
        <TextField
          id="invite-phone"
          label={labels.invite.phone}
          required
          type="tel"
          autoComplete="off"
          className="md:col-span-2"
          error={fieldErrors.phone?.message}
          {...register('phone')}
        />
      </div>
    </FormDialog>
  );
}
