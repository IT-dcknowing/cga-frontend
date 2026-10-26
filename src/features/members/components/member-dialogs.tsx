import { useState, type FormEvent } from 'react';
import {
  useForm,
  useWatch,
  type FieldValues,
  type Path,
  type UseFormRegisterReturn,
  type UseFormSetError,
} from 'react-hook-form';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { FormDialog } from '@/components/shared/form-dialog';
import { Banner } from '@/components/ui/banner';
import { Checkbox, CheckboxField } from '@/components/ui/checkbox';
import { fieldProps } from '@/components/ui/field-props';
import { FileField } from '@/components/ui/file-field';
import { FormField } from '@/components/ui/form-field';
import { Radio, RadioGroupField, RadioOption } from '@/components/ui/radio';
import { Select } from '@/components/ui/select';
import { TextField } from '@/components/ui/text-field';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/features/auth/session/auth-context';
import {
  httpMembersApi as membersApi,
  PAYMENT_METHODS,
  REGIMES,
  type Member,
} from '@/features/members/api/members-api';
import {
  useCommunes,
  useMemberSaved,
  useRadiationOptions,
  useReferrers,
  useSectors,
  useTaxOffices,
} from '@/features/members/api/queries';
import { ActivityFields, IdentificationFields } from '@/features/members/components/member-fields';
import { PaymentDialog } from '@/features/members/components/payment-dialog';
import { memberNumber } from '@/features/members/lib/member';
import {
  checkMember,
  formFieldOf,
  memberFormOf,
  memberInput,
  type MemberField,
  type MemberForm,
} from '@/features/members/lib/member-form';
import { normalizedNcc } from '@/features/members/lib/ncc';
import { ApiBusinessError } from '@/lib/api-errors';
import { formatAmount } from '@/lib/format';
import { showValidationErrors } from '@/lib/form-errors';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';
import { permissionCodes } from '@/lib/reference/permissions';

/*
 * Modales du dossier d'un adhérent (03-APPFLOW §4.3) : modifier (justificatif, RG-ADH-06b), valider
 * l'adhésion d'un brouillon (RG-ADH-02), changer de régime (F-ADH-05), demander, valider et annuler
 * une radiation (F-ADH-06, RG-ADH-11, 17), basculer vers le portefeuille CGA (RG-PTF-03), supprimer un
 * brouillon (RG-ADH-01). Aucune radiation n'est jamais faite par la plateforme (RG-ADH-18) : chaque
 * modale part d'une décision de l'utilisateur. Le serveur refait chaque contrôle.
 */
const labels = fr.members.detail;
const required = fr.members.create.errors.required;

export type MemberDialogProps = { member: Member; onClose: () => void };

function closeWith(onClose: () => void) {
  return (open: boolean) => {
    if (!open) {
      onClose();
    }
  };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Écriture d'une modale : dossier à jour, toast, fermeture ; 409 dans la modale, 422 sous les champs. */
function useMemberWrite(onClose: () => void) {
  const saved = useMemberSaved();
  const [conflict, setConflict] = useState<string | null>(null);

  async function run<T extends FieldValues>(
    call: () => Promise<Member>,
    done: (member: Member) => string,
    setError: UseFormSetError<T>,
    fields: Partial<Record<string, Path<T>>>,
    onBusiness?: (error: ApiBusinessError) => boolean,
  ): Promise<Member | null> {
    setConflict(null);

    try {
      const member = await call();

      saved(member);
      toast.success(done(member));
      onClose();

      return member;
    } catch (error) {
      if (error instanceof ApiBusinessError) {
        if (onBusiness?.(error) !== true) {
          setConflict(error.message);
        }
      } else if (!showValidationErrors(error, setError, fields)) {
        toastUnexpectedError(error);
      }

      return null;
    }
  }

  return { conflict, run };
}

function TextArea({
  id,
  label,
  error,
  registration,
  requiredField = true,
}: {
  id: string;
  label: string;
  error: string | undefined;
  registration: UseFormRegisterReturn;
  requiredField?: boolean;
}) {
  return (
    <FormField id={id} label={label} required={requiredField} error={error}>
      <Textarea
        {...fieldProps(id, error)}
        aria-required={requiredField || undefined}
        {...registration}
      />
    </FormField>
  );
}

/* ---------------------------------------------------------------- Modifier (F-ADH-04) */

export function EditMemberDialog({
  member,
  onClose,
  onSaved,
}: MemberDialogProps & {
  /** Dossier enregistré : la page compare avant / après (régénération des documents, RG-ADH-07). */
  onSaved?: (before: Member, after: Member) => void;
}) {
  const { can } = useAuth();
  const { conflict, run } = useMemberWrite(onClose);
  const seesReferrers = can(permissionCodes.cga.referrers);
  const taxOffices = useTaxOffices();
  const communes = useCommunes();
  const sectors = useSectors();
  const referrers = useReferrers(seesReferrers);
  const form = useForm<MemberForm>({ defaultValues: memberFormOf(member) });
  const { handleSubmit, setError, clearErrors, getValues } = form;
  const [justification, setJustification] = useState<File | null>(null);
  const [justificationError, setJustificationError] = useState<string | undefined>();
  const draft = member.status === 'draft';

  const submit = handleSubmit(async () => {
    const values = getValues();
    const found = checkMember('draft', values);

    clearErrors();
    setJustificationError(undefined);

    for (const [field, message] of found) {
      setError(field, { type: 'required', message });
    }

    // RG-ADH-06b : raison sociale ou NCC d'un dossier validé, justificatif joint.
    const identityChanged =
      values.company_name.trim().toUpperCase() !== member.company_name.toUpperCase() ||
      normalizedNcc(values.ncc) !== member.ncc;

    if (!draft && identityChanged && justification === null) {
      setJustificationError(labels.editDialog.justificationRequired);

      return;
    }

    if (found.size > 0) {
      return;
    }

    const updated = await run(
      () => membersApi.update(member.id, memberInput(values), justification),
      () => labels.saved,
      (field, error) => {
        if (field === ('justification' as MemberField)) {
          setJustificationError(error.message);
        } else {
          setError(field as MemberField, error);
        }
      },
      Object.fromEntries(
        [
          ...Object.keys(values),
          'justification',
          'reference_revenue.amount',
          'reference_revenue.year',
        ]
          .map((apiField) => [
            apiField,
            apiField === 'justification' ? 'justification' : formFieldOf(apiField),
          ])
          .filter(([, field]) => field !== undefined),
      ) as Partial<Record<string, Path<MemberForm>>>,
    );

    if (updated !== null) {
      onSaved?.(member, updated);
    }
  });

  return (
    <FormDialog
      open
      onOpenChange={closeWith(onClose)}
      title={labels.editDialog.title}
      description={member.company_name}
      submitLabel={labels.editDialog.submit}
      submitting={form.formState.isSubmitting}
      onSubmit={submit}
      conflict={conflict}
      size="preview"
    >
      {draft ? null : <p className="text-note text-muted">{labels.editDialog.regimeLocked}</p>}
      <IdentificationFields
        form={form}
        taxOffices={taxOffices.data}
        communes={communes.data}
        referrers={seesReferrers ? (referrers.data ?? []) : undefined}
        regimeLocked={!draft}
      />
      <ActivityFields form={form} sectors={sectors.data} />
      {draft ? null : (
        <FileField
          id="member-justification"
          label={labels.editDialog.justification}
          hint={labels.editDialog.justificationHint}
          error={justificationError}
          onChange={setJustification}
        />
      )}
    </FormDialog>
  );
}

/* ---------------------------------------------------------------- Valider l'adhésion (RG-ADH-02) */

export function ValidateMembershipDialog({
  member,
  onClose,
  onValidated,
}: MemberDialogProps & {
  /** Adhésion validée : la page affiche son bandeau vert et ses suites (03-APPFLOW §4.3). */
  onValidated?: (member: Member) => void;
}) {
  const { can } = useAuth();
  const saved = useMemberSaved();
  const [conflict, setConflict] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>(member.missing_for_validation);
  const [paying, setPaying] = useState(false);
  const cga = member.portfolio === 'cga';
  const form = useForm<{ exclusivity_confirmed: boolean }>({
    defaultValues: { exclusivity_confirmed: false },
  });
  const {
    register,
    handleSubmit,
    setError,
    getValues,
    formState: { errors, isSubmitting },
  } = form;
  const items = fr.members.create.missing.items;
  const shownMissing = missing.filter((code) => code !== 'exclusivity_confirmed');
  // Le droit d'adhésion se paie dans la foulée quand il est seul à manquer (RG-ADH-02).
  const payFirst =
    can(permissionCodes.cga.payments) &&
    shownMissing.length > 0 &&
    shownMissing.every((code) => code === 'entry_fee_payment');

  /** Validation ; `false` si le serveur la refuse (la liste de ce qui manque est alors montrée). */
  async function validate(exclusivityConfirmed: boolean): Promise<boolean> {
    setConflict(null);

    try {
      const validated = await membersApi.validate(member.id, exclusivityConfirmed);
      const number = memberNumber(validated) ?? '';

      saved(validated);
      toast.success(
        cga ? fr.members.create.validated(number) : fr.members.create.clientCreated(number),
      );
      onClose();
      onValidated?.(validated);

      return true;
    } catch (error) {
      if (error instanceof ApiBusinessError && error.code === 'membership_incomplete') {
        const list = Array.isArray(error.details.missing) ? error.details.missing : [];

        setMissing(list.filter((item): item is string => typeof item === 'string'));
      } else if (error instanceof ApiBusinessError) {
        setConflict(error.message);
      } else {
        toastUnexpectedError(error);
      }

      return false;
    }
  }

  const submit = handleSubmit(async ({ exclusivity_confirmed }) => {
    if (cga && !exclusivity_confirmed) {
      setError('exclusivity_confirmed', { message: fr.members.create.errors.confirm });

      return;
    }

    if (payFirst) {
      setPaying(true);

      return;
    }

    await validate(exclusivity_confirmed);
  });

  if (paying) {
    return (
      <PaymentDialog
        memberId={member.id}
        only="entry_fee"
        title={fr.members.finance.entryFee.title}
        submitLabel={fr.members.finance.entryFee.submit}
        onClose={onClose}
        onRecorded={async () => {
          if (!(await validate(getValues('exclusivity_confirmed')))) {
            setPaying(false);
          }
        }}
      />
    );
  }

  return (
    <FormDialog
      open
      onOpenChange={closeWith(onClose)}
      title={labels.validateDialog.title}
      description={cga ? labels.validateDialog.cga : labels.validateDialog.cabinet}
      submitLabel={labels.validateDialog.submit}
      submitting={isSubmitting}
      onSubmit={submit}
      conflict={conflict}
    >
      {shownMissing.length > 0 && !payFirst ? (
        <div role="alert" className="grid gap-1.5">
          <p className="text-label font-semibold text-muted">
            {labels.validateDialog.missingIntro}
          </p>
          <ul className="list-disc space-y-1 pl-5 text-body">
            {shownMissing.map((code) => (
              <li key={code}>{items[code] ?? code}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {payFirst ? (
        <p className="text-note text-muted">{labels.validateDialog.entryFeeNext}</p>
      ) : null}
      {cga ? (
        <CheckboxField
          id="validate-exclusivity"
          label={fr.members.fields.exclusivityConfirmed}
          error={errors.exclusivity_confirmed?.message}
        >
          <Checkbox
            {...fieldProps('validate-exclusivity', errors.exclusivity_confirmed?.message)}
            {...register('exclusivity_confirmed')}
          />
        </CheckboxField>
      ) : null}
    </FormDialog>
  );
}

/* ---------------------------------------------------------------- Changer de régime (F-ADH-05) */

type RegimeForm = { regime: string; effective_date: string; reason: string };

export function ChangeRegimeDialog({ member, onClose }: MemberDialogProps) {
  const { conflict, run } = useMemberWrite(onClose);
  const choices = REGIMES.filter((regime) => regime !== member.regime);
  const [justification, setJustification] = useState<File | null>(null);
  const [justificationError, setJustificationError] = useState<string | undefined>();
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<RegimeForm>({
    defaultValues: { regime: choices[0], effective_date: today(), reason: '' },
  });
  const regime = useWatch({ control, name: 'regime' });
  const text = labels.regimeDialog;

  const submit = handleSubmit(async (values) => {
    let invalid = false;

    if (values.reason.trim() === '') {
      setError('reason', { message: required });
      invalid = true;
    }

    if (values.effective_date === '') {
      setError('effective_date', { message: required });
      invalid = true;
    }

    setJustificationError(justification === null ? required : undefined);

    if (invalid || justification === null) {
      return;
    }

    await run(
      () =>
        membersApi.changeRegime(member.id, {
          regime: values.regime,
          effective_date: values.effective_date,
          reason: values.reason.trim(),
          justification,
        }),
      () => text.done,
      (field, error) => {
        if (field === ('justification' as keyof RegimeForm)) {
          setJustificationError(error.message);
        } else {
          setError(field as keyof RegimeForm, error);
        }
      },
      {
        regime: 'regime',
        effective_date: 'effective_date',
        reason: 'reason',
        justification: 'justification' as Path<RegimeForm>,
      },
    );
  });

  return (
    <FormDialog
      open
      onOpenChange={closeWith(onClose)}
      title={text.title}
      description={member.company_name}
      submitLabel={text.submit}
      submitting={isSubmitting}
      onSubmit={submit}
      conflict={conflict}
    >
      <FormField id="regime-regime" label={text.regime} required error={errors.regime?.message}>
        <Select {...fieldProps('regime-regime', errors.regime?.message)} {...register('regime')}>
          {choices.map((choice) => (
            <option key={choice} value={choice}>
              {fr.status.regime[choice]}
            </option>
          ))}
        </Select>
      </FormField>
      {member.portfolio === 'cga' && (regime === 'RSI' || regime === 'RNI') ? (
        <Banner tone="warning">{text.realWarning}</Banner>
      ) : null}
      <TextField
        id="regime-effective-date"
        type="date"
        label={text.effectiveDate}
        required
        error={errors.effective_date?.message}
        {...register('effective_date')}
      />
      <TextArea
        id="regime-reason"
        label={text.reason}
        error={errors.reason?.message}
        registration={register('reason')}
      />
      <FileField
        id="regime-justification"
        label={text.justification}
        required
        error={justificationError}
        onChange={setJustification}
      />
    </FormDialog>
  );
}

/* ---------------------------------------------------------------- Demander la radiation (F-ADH-06) */

type RadiationForm = {
  initiator: string;
  reason: string;
  reason_other: string;
  effective_date: string;
  observation: string;
  sp_request_reference: string;
  validate_now: boolean;
  outcome: string;
  validation_reference: string;
};

/**
 * « Demander la radiation » : initiateur, puis ses motifs ; pièce exigée selon le motif ; référence
 * au SP-CGA pour une radiation du centre. `toCabinet` : la bascule vers le portefeuille Cabinet, qui
 * passe par la même radiation (RG-PTF-04), avec ses rappels. `preset` : motif proposé par une alerte.
 */
export function RequestRadiationDialog({
  member,
  onClose,
  toCabinet = false,
  preset,
  onRequested,
}: MemberDialogProps & {
  toCabinet?: boolean;
  preset?: { initiator: string; reason: string };
  /** Demande enregistrée sans validation immédiate : la page peut enchaîner la validation. */
  onRequested?: (member: Member) => void;
}) {
  const { can } = useAuth();
  const options = useRadiationOptions(true);
  const [conflict, setConflict] = useState<string | null>(null);
  const saved = useMemberSaved();
  const [proof, setProof] = useState<File | null>(null);
  const [proofError, setProofError] = useState<string | undefined>();
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<RadiationForm>({
    defaultValues: {
      initiator: preset?.initiator ?? 'cga',
      reason: preset?.reason ?? '',
      reason_other: '',
      effective_date: today(),
      observation: '',
      sp_request_reference: '',
      validate_now: false,
      outcome: toCabinet ? 'moved_to_cabinet' : 'closed',
      validation_reference: '',
    },
  });
  const [initiatorValue, reasonValue, validateNow] = useWatch({
    control,
    name: ['initiator', 'reason', 'validate_now'],
  });
  const text = labels.radiationDialog;
  const initiator = options.data?.initiators.find((item) => item.value === initiatorValue);
  const reason = initiator?.reasons.find((item) => item.value === reasonValue);
  const canValidateNow = reason?.immediate === true && can(permissionCodes.cga.radiationValidate);

  const submit = handleSubmit(async (values) => {
    let invalid = false;

    for (const field of ['reason', 'effective_date', 'observation'] as const) {
      if (values[field].trim() === '') {
        setError(field, { message: required });
        invalid = true;
      }
    }

    if (values.reason === 'other' && values.reason_other.trim() === '') {
      setError('reason_other', { message: required });
      invalid = true;
    }

    const proofRequired = reason?.proof !== null && reason?.proof !== undefined;

    setProofError(proofRequired && proof === null ? required : undefined);

    if (invalid || (proofRequired && proof === null)) {
      return;
    }

    setConflict(null);

    const immediate = canValidateNow && values.validate_now;

    try {
      const updated = await membersApi.requestRadiation(member.id, {
        initiator: values.initiator,
        reason: values.reason,
        reason_other: values.reason === 'other' ? values.reason_other.trim() : null,
        effective_date: values.effective_date,
        observation: values.observation.trim(),
        proof,
        sp_request_reference:
          initiator?.sp_request_reference === true
            ? values.sp_request_reference.trim() || null
            : null,
        validate_now: immediate,
        outcome: immediate ? values.outcome : null,
        validation_reference: immediate ? values.validation_reference.trim() || null : null,
      });

      saved(updated);
      toast.success(immediate ? labels.validateRadiationDialog.done : text.done);
      onClose();

      if (!immediate) {
        onRequested?.(updated);
      }
    } catch (error) {
      if (error instanceof ApiBusinessError) {
        setConflict(error.message);
      } else if (
        !showValidationErrors(
          error,
          (field, fieldError) => {
            if (field === ('proof' as keyof RadiationForm)) {
              setProofError(fieldError.message);
            } else {
              setError(field as keyof RadiationForm, fieldError);
            }
          },
          {
            initiator: 'initiator',
            reason: 'reason',
            reason_other: 'reason_other',
            effective_date: 'effective_date',
            observation: 'observation',
            sp_request_reference: 'sp_request_reference',
            outcome: 'outcome',
            validation_reference: 'validation_reference',
            proof: 'proof' as Path<RadiationForm>,
          },
        )
      ) {
        toastUnexpectedError(error);
      }
    }
  });

  return (
    <FormDialog
      open
      onOpenChange={closeWith(onClose)}
      title={toCabinet ? text.toCabinetTitle : text.title}
      description={member.company_name}
      submitLabel={text.submit}
      submitting={isSubmitting}
      onSubmit={submit}
      conflict={conflict}
    >
      <p className="text-note text-muted">{text.manual}</p>
      {toCabinet ? <Banner tone="warning">{text.cabinetReminder}</Banner> : null}
      {toCabinet && member.referrer ? <Banner tone="warning">{text.referrerWarning}</Banner> : null}

      <RadioGroupField id="radiation-initiator" legend={text.initiator} required>
        <div className="flex flex-wrap gap-4">
          {(options.data?.initiators ?? []).map((item) => (
            <RadioOption key={item.value} label={item.label}>
              <Radio
                value={item.value}
                {...register('initiator', {
                  onChange: () => {
                    // Les motifs suivent l'initiateur.
                    setValue('reason', '');
                  },
                })}
              />
            </RadioOption>
          ))}
        </div>
      </RadioGroupField>

      <FormField id="radiation-reason" label={text.reason} required error={errors.reason?.message}>
        <Select
          {...fieldProps('radiation-reason', errors.reason?.message)}
          aria-required
          disabled={initiator === undefined}
          {...register('reason')}
        >
          <option value="">{fr.table.none}</option>
          {(initiator?.reasons ?? []).map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </Select>
      </FormField>
      {reasonValue === 'other' ? (
        <TextField
          id="radiation-reason-other"
          label={text.reasonOther}
          required
          error={errors.reason_other?.message}
          {...register('reason_other')}
        />
      ) : null}
      <TextField
        id="radiation-effective-date"
        type="date"
        label={text.effectiveDate}
        required
        error={errors.effective_date?.message}
        {...register('effective_date')}
      />
      <TextArea
        id="radiation-observation"
        label={text.observation}
        error={errors.observation?.message}
        registration={register('observation')}
      />
      <FileField
        id="radiation-proof"
        label={reason?.proof ? text.proof(reason.proof.label) : text.proofOptional}
        required={reason?.proof !== null && reason?.proof !== undefined}
        error={proofError}
        onChange={setProof}
      />
      {initiator?.sp_request_reference === true ? (
        <TextField
          id="radiation-sp-reference"
          label={text.spReference}
          error={errors.sp_request_reference?.message}
          {...register('sp_request_reference')}
        />
      ) : null}

      {canValidateNow ? (
        <CheckboxField id="radiation-validate-now" label={text.validateNow}>
          <Checkbox id="radiation-validate-now" {...register('validate_now')} />
        </CheckboxField>
      ) : null}
      {canValidateNow && validateNow ? (
        <>
          <OutcomeChoice
            id="radiation-outcome"
            legend={text.outcome}
            outcomes={options.data?.outcomes ?? []}
            registration={register('outcome')}
          />
          <TextField
            id="radiation-validation-reference"
            label={text.validationReference}
            error={errors.validation_reference?.message}
            {...register('validation_reference')}
          />
        </>
      ) : null}
    </FormDialog>
  );
}

function OutcomeChoice({
  id,
  legend,
  outcomes,
  registration,
}: {
  id: string;
  legend: string;
  outcomes: { value: string; label: string }[];
  registration: UseFormRegisterReturn;
}) {
  return (
    <RadioGroupField id={id} legend={legend} required>
      <div className="grid gap-2">
        {outcomes.map((outcome) => (
          <RadioOption key={outcome.value} label={outcome.label}>
            <Radio value={outcome.value} {...registration} />
          </RadioOption>
        ))}
      </div>
    </RadioGroupField>
  );
}

/* ---------------------------------------------------------------- Valider la radiation */

export function ValidateRadiationDialog({
  member,
  onClose,
  defaultOutcome = 'closed',
}: MemberDialogProps & { defaultOutcome?: string }) {
  const { conflict, run } = useMemberWrite(onClose);
  const options = useRadiationOptions(true);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<{ outcome: string; validation_reference: string }>({
    defaultValues: { outcome: defaultOutcome, validation_reference: '' },
  });
  const text = labels.validateRadiationDialog;

  const submit = handleSubmit(async (values) => {
    await run(
      () =>
        membersApi.validateRadiation(member.id, {
          outcome: values.outcome,
          validation_reference: values.validation_reference.trim() || null,
        }),
      () => text.done,
      setError,
      { outcome: 'outcome', validation_reference: 'validation_reference' },
    );
  });

  return (
    <ConfirmDialog
      open
      onOpenChange={closeWith(onClose)}
      title={text.title}
      description={member.company_name}
      submitLabel={text.submit}
      submitting={isSubmitting}
      onSubmit={submit}
      conflict={conflict}
      effects={text.effects}
    >
      <OutcomeChoice
        id="validate-radiation-outcome"
        legend={text.outcome}
        outcomes={options.data?.outcomes ?? []}
        registration={register('outcome')}
      />
      <TextField
        id="validate-radiation-reference"
        label={text.reference}
        error={errors.validation_reference?.message}
        {...register('validation_reference')}
      />
    </ConfirmDialog>
  );
}

/* ---------------------------------------------------------------- Annuler la radiation (RG-ADH-11) */

export function CancelRadiationDialog({ member, onClose }: MemberDialogProps) {
  const { conflict, run } = useMemberWrite(onClose);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<{ reason: string }>({ defaultValues: { reason: '' } });
  const text = labels.cancelRadiationDialog;

  const submit = handleSubmit(async ({ reason }) => {
    if (reason.trim() === '') {
      setError('reason', { message: required });

      return;
    }

    await run(
      () => membersApi.cancelRadiation(member.id, reason.trim()),
      () => text.done,
      setError,
      {
        reason: 'reason',
      },
    );
  });

  return (
    <ConfirmDialog
      open
      onOpenChange={closeWith(onClose)}
      title={text.title}
      description={member.company_name}
      submitLabel={text.submit}
      submitting={isSubmitting}
      onSubmit={submit}
      conflict={conflict}
      effects={text.effects}
    >
      <TextArea
        id="cancel-radiation-reason"
        label={text.reason}
        error={errors.reason?.message}
        registration={register('reason')}
      />
    </ConfirmDialog>
  );
}

/* ---------------------------------------------------------------- Basculer vers le portefeuille CGA */

type MoveForm = {
  cga_contract_signed_on: string;
  cga_contract_confirmed: boolean;
  referrer_id: string;
  amount: string;
  paid_on: string;
  method: string;
  reference: string;
};

/**
 * Bascule d'un dossier Cabinet (TEE / RME) vers le portefeuille CGA (RG-PTF-03) : contrat signé et
 * confirmé, exemplaire facultatif, apporteur facultatif, droit d'adhésion payé (RG-PTF-03, 3.15). Le
 * montant dû vient du serveur (TTC) : sa première réponse l'annonce, puis le paiement part avec la
 * bascule. Exclusivité refusée : message sans nom de CGA (RG-ADH-05).
 */
export function MoveToCgaDialog({ member, onClose }: MemberDialogProps) {
  const { can } = useAuth();
  const { conflict, run } = useMemberWrite(onClose);
  const seesReferrers = can(permissionCodes.cga.referrers);
  const referrers = useReferrers(seesReferrers);
  const [contract, setContract] = useState<File | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<MoveForm>({
    defaultValues: {
      cga_contract_signed_on: '',
      cga_contract_confirmed: false,
      referrer_id: '',
      amount: '',
      paid_on: today(),
      method: 'mobile_money',
      reference: '',
    },
  });
  const text = labels.moveDialog;
  const fields = fr.members.fields;

  const submit = handleSubmit(async (values) => {
    let invalid = false;

    if (values.cga_contract_signed_on === '') {
      setError('cga_contract_signed_on', { message: required });
      invalid = true;
    }

    if (!values.cga_contract_confirmed) {
      setError('cga_contract_confirmed', { message: fr.members.create.errors.confirm });
      invalid = true;
    }

    if (balance !== null && !/^\d+$/.test(values.amount.trim())) {
      setError('amount', { message: fr.members.create.errors.number });
      invalid = true;
    }

    if (invalid) {
      return;
    }

    await run(
      () =>
        membersApi.moveToCga(member.id, {
          cga_contract_signed_on: values.cga_contract_signed_on,
          cga_contract_confirmed: true,
          contract,
          referrer_id: values.referrer_id === '' ? null : values.referrer_id,
          entry_fee_payment:
            balance === null
              ? null
              : {
                  amount: Number.parseInt(values.amount, 10),
                  paid_on: values.paid_on,
                  method: values.method,
                  reference: values.reference.trim() || null,
                },
        }),
      (moved) => text.done(memberNumber(moved) ?? ''),
      setError,
      {
        cga_contract_signed_on: 'cga_contract_signed_on',
        cga_contract_confirmed: 'cga_contract_confirmed',
        referrer_id: 'referrer_id',
        'entry_fee_payment.amount': 'amount',
        'entry_fee_payment.paid_on': 'paid_on',
        'entry_fee_payment.method': 'method',
        'entry_fee_payment.reference': 'reference',
      },
      (error) => {
        // Droit d'adhésion à payer : le montant dû (TTC) vient du serveur.
        const due = error.details.balance;

        if (error.code !== 'membership_incomplete' || typeof due !== 'number') {
          return false;
        }

        setBalance(due);
        setValue('amount', String(due));

        return true;
      },
    );
  });

  return (
    <FormDialog
      open
      onOpenChange={closeWith(onClose)}
      title={text.title}
      description={text.description}
      submitLabel={text.submit}
      submitting={isSubmitting}
      onSubmit={submit}
      conflict={conflict}
    >
      <TextField
        id="move-contract-signed-on"
        type="date"
        label={fields.contractSignedOn}
        required
        hint={fields.contractSignedOnHint}
        error={errors.cga_contract_signed_on?.message}
        {...register('cga_contract_signed_on')}
      />
      <CheckboxField
        id="move-contract-confirmed"
        label={fields.contractConfirmed}
        error={errors.cga_contract_confirmed?.message}
      >
        <Checkbox
          {...fieldProps('move-contract-confirmed', errors.cga_contract_confirmed?.message)}
          {...register('cga_contract_confirmed')}
        />
      </CheckboxField>
      <FileField
        id="move-contract-file"
        label={fields.contractFile}
        hint={fields.contractFileHint}
        onChange={setContract}
      />
      {seesReferrers ? (
        <FormField id="move-referrer" label={fields.referrer} error={errors.referrer_id?.message}>
          <Select
            {...fieldProps('move-referrer', errors.referrer_id?.message)}
            {...register('referrer_id')}
          >
            <option value="">{fields.noReferrer}</option>
            {(referrers.data ?? [])
              .filter((referrer) => referrer.active)
              .map((referrer) => (
                <option key={referrer.id} value={referrer.id}>
                  {`${referrer.label} · ${referrer.name}`}
                </option>
              ))}
          </Select>
        </FormField>
      ) : null}

      {balance !== null ? (
        <fieldset className="grid gap-4">
          <legend className="mb-2 text-card-title font-bold text-ink">{text.payment}</legend>
          <Banner tone="warning" role="status">
            {text.paymentDue(formatAmount(balance))}
          </Banner>
          <TextField
            id="move-amount"
            label={text.amount}
            required
            inputMode="numeric"
            error={errors.amount?.message}
            {...register('amount')}
          />
          <TextField
            id="move-paid-on"
            type="date"
            label={text.paidOn}
            required
            error={errors.paid_on?.message}
            {...register('paid_on')}
          />
          <FormField id="move-method" label={text.method} required error={errors.method?.message}>
            <Select {...fieldProps('move-method', errors.method?.message)} {...register('method')}>
              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {labels.paymentMethods[method]}
                </option>
              ))}
            </Select>
          </FormField>
          <TextField
            id="move-reference"
            label={text.reference}
            error={errors.reference?.message}
            {...register('reference')}
          />
        </fieldset>
      ) : null}
    </FormDialog>
  );
}

/* ---------------------------------------------------------------- Supprimer le brouillon (RG-ADH-01) */

export function DeleteDraftDialog({
  member,
  onClose,
  onDeleted,
}: MemberDialogProps & { onDeleted: () => void }) {
  const [conflict, setConflict] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const text = labels.deleteDialog;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setConflict(null);
    setSubmitting(true);

    try {
      await membersApi.remove(member.id);
      toast.success(text.done);
      onDeleted();
    } catch (error) {
      setSubmitting(false);

      if (error instanceof ApiBusinessError) {
        setConflict(error.message);
      } else {
        toastUnexpectedError(error);
      }
    }
  }

  return (
    <ConfirmDialog
      open
      onOpenChange={closeWith(onClose)}
      title={text.title}
      description={member.company_name}
      submitLabel={text.submit}
      submitting={submitting}
      onSubmit={(event) => void submit(event)}
      conflict={conflict}
      effects={text.effects}
    >
      {null}
    </ConfirmDialog>
  );
}
