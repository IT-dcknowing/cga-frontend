import { ImageOff, Pencil } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { KeyValueList, type KeyValueItem } from '@/components/shared/key-value-list';
import { UnsavedChangesGuard } from '@/components/shared/unsaved-changes-guard';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fieldProps } from '@/components/ui/field-props';
import { FileField } from '@/components/ui/file-field';
import { FormField } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { TextField } from '@/components/ui/text-field';
import { Textarea } from '@/components/ui/textarea';
import {
  cgaApi,
  IMAGE_KINDS,
  type CgaProfile,
  type CgaProfileInput,
  type ImageKind,
} from '@/features/cga-settings/api/cga-api';
import { useCgaProfile, useCgaProfileSaved } from '@/features/cga-settings/api/queries';
import {
  useActiveCommunes,
  useActiveDirectorates,
  useActiveTaxOffices,
} from '@/features/referentials/api/referentials-api';
import { formatAmount, formatDate, formatTimestampDate } from '@/lib/format';
import { showValidationErrors } from '@/lib/form-errors';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';

/*
 * Onglet « Centre » de `/cga/parametres` (F-ORG-03, 03-APPFLOW §4.3) : fiche complète du centre,
 * complétée par le gérant ; logo, signature et cachet téléversés. Tant qu'un champ requis manque,
 * la production des documents est bloquée (RG-ORG-04) : le serveur donne la liste. L'abréviation de
 * numérotation se verrouille au premier numéro attribué (RG-ORG-05). Dénomination, sigle et agrément
 * restent au registre du CNCGA.
 */
const labels = fr.cgaSettings.centre;
const field = labels.fields;

type ProfileForm = Record<keyof CgaProfileInput, string>;

const TEXT_FIELDS = [
  'legal_form',
  'ncc',
  'rccm',
  'agreement_number',
  'agreement_date',
  'regional_directorate_id',
  'tax_office_id',
  'said',
  'address',
  'city',
  'commune_id',
  'phone_1',
  'phone_2',
  'email',
  'manager_name',
  'expert_name',
  'signatory_name',
  'signatory_title',
  'numbering_abbreviation',
  'history_text',
] as const;

const INTEGER_FIELDS = ['share_capital', 'previous_year_revenue'] as const;

function formOf(profile: CgaProfile): ProfileForm {
  const text = (value: string | number | null) => (value === null ? '' : String(value));

  return {
    legal_form: text(profile.legal_form),
    share_capital: text(profile.share_capital),
    ncc: text(profile.ncc),
    rccm: text(profile.rccm),
    agreement_number: text(profile.agreement_number),
    agreement_date: text(profile.agreement_date),
    regional_directorate_id: profile.regional_directorate?.id ?? '',
    tax_office_id: profile.tax_office?.id ?? '',
    said: text(profile.said),
    address: text(profile.address),
    city: profile.city,
    commune_id: profile.commune?.id ?? '',
    phone_1: profile.phone_1,
    phone_2: text(profile.phone_2),
    email: text(profile.email),
    manager_name: text(profile.manager_name),
    expert_name: text(profile.expert_name),
    signatory_name: text(profile.signatory_name),
    signatory_title: text(profile.signatory_title),
    numbering_abbreviation: text(profile.numbering_abbreviation),
    history_text: text(profile.history_text),
    previous_year_revenue: text(profile.previous_year_revenue),
  };
}

function inputOf(values: ProfileForm): CgaProfileInput {
  const text = (value: string) => (value.trim() === '' ? null : value.trim());
  const integer = (value: string) => (value.trim() === '' ? null : Number.parseInt(value, 10));

  return {
    ...(Object.fromEntries(TEXT_FIELDS.map((name) => [name, text(values[name])])) as Pick<
      CgaProfileInput,
      (typeof TEXT_FIELDS)[number]
    >),
    city: values.city.trim(),
    phone_1: values.phone_1.trim(),
    share_capital: integer(values.share_capital),
    previous_year_revenue: integer(values.previous_year_revenue),
  };
}

/** Champs du formulaire par champ de l'API (erreurs 422). */
const API_FIELDS = Object.fromEntries(
  [...TEXT_FIELDS, ...INTEGER_FIELDS].map((name) => [name, name]),
) as Record<string, keyof ProfileForm>;

function items(profile: CgaProfile): KeyValueItem[] {
  const amount = (value: number | null) => (value === null ? null : formatAmount(value));

  return [
    { label: field.name, value: profile.name },
    { label: field.sigle, value: profile.sigle },
    { label: field.agreement_status, value: profile.agreement_status_label },
    { label: field.legal_form, value: profile.legal_form },
    { label: field.share_capital, value: amount(profile.share_capital) },
    { label: field.ncc, value: profile.ncc },
    { label: field.rccm, value: profile.rccm },
    { label: field.agreement_number, value: profile.agreement_number },
    {
      label: field.agreement_date,
      value: profile.agreement_date === null ? null : formatDate(profile.agreement_date),
    },
    { label: field.regional_directorate_id, value: profile.regional_directorate?.name ?? null },
    { label: field.tax_office_id, value: profile.tax_office?.name ?? null },
    { label: field.said, value: profile.said },
    { label: field.address, value: profile.address },
    { label: field.city, value: profile.city },
    { label: field.commune_id, value: profile.commune?.name ?? null },
    { label: field.phone_1, value: profile.phone_1 },
    { label: field.phone_2, value: profile.phone_2 },
    { label: field.email, value: profile.email },
    { label: field.manager_name, value: profile.manager_name },
    { label: field.expert_name, value: profile.expert_name },
    { label: field.signatory_name, value: profile.signatory_name },
    { label: field.signatory_title, value: profile.signatory_title },
    { label: field.numbering_abbreviation, value: profile.numbering_abbreviation },
    { label: field.previous_year_revenue, value: amount(profile.previous_year_revenue) },
    { label: field.history_text, value: profile.history_text },
  ];
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-4 md:grid-cols-2">
      <legend className="mb-2 text-label font-semibold text-muted md:col-span-2">{title}</legend>
      {children}
    </fieldset>
  );
}

function ProfileFormCard({ profile, onDone }: { profile: CgaProfile; onDone: () => void }) {
  const saved = useCgaProfileSaved();
  const directorates = useActiveDirectorates();
  const offices = useActiveTaxOffices();
  const communes = useActiveCommunes();
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    control,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<ProfileForm>({ defaultValues: formOf(profile) });
  const directorate = useWatch({ control, name: 'regional_directorate_id' });
  const officesOfDirectorate = (offices.data ?? []).filter(
    (office) => office.regional_directorate.id === directorate,
  );
  const required = fr.members.create.errors.required;

  function text(name: keyof ProfileForm, options: { required?: boolean; hint?: string } = {}) {
    return (
      <TextField
        id={`centre-${name}`}
        label={field[name]}
        required={options.required}
        hint={options.hint}
        error={errors[name]?.message}
        {...register(name)}
      />
    );
  }

  const submit = handleSubmit(async (values) => {
    let invalid = false;

    for (const name of ['city', 'phone_1'] as const) {
      if (values[name].trim() === '') {
        setError(name, { message: required });
        invalid = true;
      }
    }

    for (const name of INTEGER_FIELDS) {
      if (values[name].trim() !== '' && !/^\d+$/.test(values[name].trim())) {
        setError(name, { message: labels.integer });
        invalid = true;
      }
    }

    const abbreviation = values.numbering_abbreviation.trim();

    if (abbreviation !== '' && !/^[A-Z]{2,6}$/.test(abbreviation)) {
      setError('numbering_abbreviation', { message: labels.abbreviation });
      invalid = true;
    }

    if (invalid) {
      return;
    }

    try {
      saved(await cgaApi.updateProfile(inputOf(values)));
      toast.success(labels.saved);
      onDone();
    } catch (error) {
      if (!showValidationErrors(error, setError, API_FIELDS)) {
        toastUnexpectedError(error);
      }
    }
  });

  return (
    <form noValidate onSubmit={submit} className="grid gap-6">
      <UnsavedChangesGuard when={isDirty && !isSubmitting} />
      <p className="text-note text-muted">{labels.registryHint}</p>

      <Section title={labels.sections.identity}>
        {text('legal_form')}
        {text('share_capital')}
        {text('ncc')}
        {text('rccm')}
        {text('agreement_number')}
        <TextField
          id="centre-agreement_date"
          type="date"
          label={field.agreement_date}
          error={errors.agreement_date?.message}
          {...register('agreement_date')}
        />
      </Section>

      <Section title={labels.sections.attachment}>
        <FormField
          id="centre-regional_directorate_id"
          label={field.regional_directorate_id}
          error={errors.regional_directorate_id?.message}
        >
          <Select
            {...fieldProps(
              'centre-regional_directorate_id',
              errors.regional_directorate_id?.message,
            )}
            {...register('regional_directorate_id', {
              onChange: () => {
                // Le CDI appartient à la DR choisie (TaxOfficeOfDirectorate).
                setValue('tax_office_id', '');
              },
            })}
          >
            <option value="">{labels.none}</option>
            {(directorates.data ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField
          id="centre-tax_office_id"
          label={field.tax_office_id}
          hint={directorate === '' ? labels.chooseDirectorate : undefined}
          error={errors.tax_office_id?.message}
        >
          <Select
            {...fieldProps(
              'centre-tax_office_id',
              errors.tax_office_id?.message,
              directorate === '',
            )}
            disabled={directorate === ''}
            {...register('tax_office_id')}
          >
            <option value="">{labels.none}</option>
            {officesOfDirectorate.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </FormField>
        {text('said')}
        {text('address')}
        {text('city', { required: true })}
        <FormField
          id="centre-commune_id"
          label={field.commune_id}
          error={errors.commune_id?.message}
        >
          <Select
            {...fieldProps('centre-commune_id', errors.commune_id?.message)}
            {...register('commune_id')}
          >
            <option value="">{labels.none}</option>
            {(communes.data ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </FormField>
      </Section>

      <Section title={labels.sections.contact}>
        {text('phone_1', { required: true })}
        {text('phone_2')}
        {text('email')}
      </Section>

      <Section title={labels.sections.people}>
        {text('manager_name')}
        {text('expert_name')}
        {text('signatory_name')}
        {text('signatory_title')}
      </Section>

      <Section title={labels.sections.numbering}>
        <TextField
          id="centre-numbering_abbreviation"
          label={field.numbering_abbreviation}
          hint={profile.abbreviation_locked ? labels.abbreviationLocked : labels.abbreviationHint}
          disabled={profile.abbreviation_locked}
          error={errors.numbering_abbreviation?.message}
          {...register('numbering_abbreviation')}
        />
      </Section>

      <Section title={labels.sections.presentation}>
        {text('previous_year_revenue')}
        <FormField
          id="centre-history_text"
          label={field.history_text}
          error={errors.history_text?.message}
          className="md:col-span-2"
        >
          <Textarea
            {...fieldProps('centre-history_text', errors.history_text?.message)}
            {...register('history_text')}
          />
        </FormField>
      </Section>

      <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
        <Button variant="secondary" onClick={onDone} disabled={isSubmitting}>
          {fr.common.cancel}
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {labels.save}
        </Button>
      </div>
    </form>
  );
}

function ImageCard({ profile, kind }: { profile: CgaProfile; kind: ImageKind }) {
  const saved = useCgaProfileSaved();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const image = profile.images[kind];
  const name = labels.images.kinds[kind];

  async function upload(file: File | null) {
    if (file === null) {
      return;
    }

    setBusy(true);
    setError(undefined);

    try {
      saved(await cgaApi.uploadImage(kind, file));
      toast.success(labels.images.uploaded(name));
    } catch (failure) {
      if (
        !showValidationErrors(
          failure,
          (_field, fieldError) => {
            setError(fieldError.message);
          },
          { image: 'image' },
        )
      ) {
        toastUnexpectedError(failure);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid content-start gap-2" aria-busy={busy || undefined}>
      <p className="text-label font-semibold">{name}</p>
      <div className="flex h-28 items-center justify-center rounded-control border border-border bg-surface">
        {image === null ? (
          <span className="flex items-center gap-1.5 text-note text-muted">
            <ImageOff className="size-4" aria-hidden="true" />
            {labels.images.missing}
          </span>
        ) : (
          <img
            src={image.url}
            alt={labels.images.alt(name)}
            className="max-h-24 max-w-full object-contain"
          />
        )}
      </div>
      {profile.can.update ? (
        <FileField
          id={`centre-image-${kind}`}
          label={labels.images.choose(name)}
          accept="image/png,image/jpeg"
          disabled={busy}
          error={error}
          onChange={(file) => void upload(file)}
        />
      ) : null}
    </div>
  );
}

export function CentreTab() {
  const profile = useCgaProfile();
  const [editing, setEditing] = useState(false);

  if (profile.isPending) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (profile.isError) {
    return (
      <Banner
        tone="danger"
        action={
          <Button variant="secondary" size="sm" onClick={() => void profile.refetch()}>
            {fr.common.retry}
          </Button>
        }
      >
        {labels.loadError}
      </Banner>
    );
  }

  const data = profile.data;
  const missing = data.missing_fields.map((name) => field[name] ?? name);

  return (
    <div className="grid gap-4">
      {missing.length > 0 ? (
        <Banner tone="warning">{labels.incomplete(missing.join(', '))}</Banner>
      ) : data.profile_completed_at !== null ? (
        <Banner tone="success">
          {labels.complete(formatTimestampDate(data.profile_completed_at))}
        </Banner>
      ) : null}
      {!data.can.update ? <p className="text-note text-muted">{labels.readOnly}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>{fr.cgaSettings.tabs.centre}</CardTitle>
          {data.can.update && !editing ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setEditing(true);
              }}
            >
              <Pencil aria-hidden="true" />
              {fr.organization.edit}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {editing ? (
            <ProfileFormCard
              profile={data}
              onDone={() => {
                setEditing(false);
              }}
            />
          ) : (
            <KeyValueList items={items(data)} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{labels.images.title}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          <p className="text-note text-muted">{labels.images.hint}</p>
          <div className="grid gap-4 md:grid-cols-3">
            {IMAGE_KINDS.map((kind) => (
              <ImageCard key={kind} profile={data} kind={kind} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
