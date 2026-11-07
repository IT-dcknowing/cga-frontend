import { useState, type FormEvent } from 'react';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox, CheckboxField } from '@/components/ui/checkbox';
import { fieldProps } from '@/components/ui/field-props';
import { FormField } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';
import { TextField } from '@/components/ui/text-field';
import { Textarea } from '@/components/ui/textarea';
import {
  AUDIENCE_REGIMES,
  AUDIENCE_TYPES,
  TRAINING_FORMATS,
  type Training,
  type TrainingInput,
} from '@/features/trainings/api/trainings-api';
import { ApiBusinessError, ApiValidationError } from '@/lib/api-errors';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';

/*
 * Formulaire d'une formation (F-FOR-01, 03-APPFLOW §3.2 et §4.3) : titre, description, dates et horaires,
 * format, lieu ou lien, formateur, places (vide : illimité), prix (0 : gratuite), validation des inscriptions,
 * publics cibles (un public « Adhérents d'un régime » par régime). L'organisateur et le périmètre des publics
 * viennent de l'espace actif côté serveur (RG-FOR-01), qui refait chaque contrôle.
 */
const labels = fr.trainings;
const text = labels.create;
const required = fr.members.create.errors.required;

/** Publics proposés : chaque régime ciblable est une case à part. */
type AudienceChoice = { key: string; type: string; regime: string | undefined };

const AUDIENCE_CHOICES: AudienceChoice[] = AUDIENCE_TYPES.flatMap((type): AudienceChoice[] =>
  type === 'members_by_regime'
    ? AUDIENCE_REGIMES.map((regime) => ({ key: `${type}:${regime}`, type, regime }))
    : [{ key: type, type, regime: undefined }],
);

type Errors = Record<string, string | undefined>;

/** « 2027-04-10T09:00:00+00:00 » → « 2027-04-10T09:00 » (heure d'Abidjan, UTC). */
function localValue(timestamp: string): string {
  return new Date(timestamp).toISOString().slice(0, 16);
}

function initial(training?: Training): TrainingInput {
  return training === undefined
    ? {
        title: '',
        description: '',
        format: 'in_person',
        location: '',
        online_url: '',
        trainer: '',
        starts_at: '',
        ends_at: '',
        capacity: '',
        price: '0',
        requires_approval: false,
        audiences: [],
      }
    : {
        title: training.title,
        description: training.description ?? '',
        format: training.format,
        location: training.location ?? '',
        online_url: training.online_url ?? '',
        trainer: training.trainer ?? '',
        starts_at: localValue(training.starts_at),
        ends_at: localValue(training.ends_at),
        capacity: training.capacity === null ? '' : String(training.capacity),
        price: String(training.price),
        requires_approval: training.requires_approval,
        audiences: training.audiences.map((audience) =>
          audience.regime === null
            ? { type: audience.type }
            : { type: audience.type, regime: audience.regime },
        ),
      };
}

function audienceKey(audience: { type: string; regime?: string }): string {
  return audience.regime === undefined ? audience.type : `${audience.type}:${audience.regime}`;
}

/** Erreurs du serveur ramenées aux champs du formulaire (`audiences.0.regime` → `audiences`). */
function fieldErrors(fields: Record<string, string>): Errors {
  return Object.fromEntries(
    Object.entries(fields).map(([key, message]) => [
      key.startsWith('audiences') ? 'audiences' : key,
      message,
    ]),
  );
}

type TrainingFormProps = {
  training?: Training;
  /** `publish` : « Publier » (création) ; sinon « Enregistrer en brouillon » ou « Enregistrer ». */
  onSubmit: (input: TrainingInput, publish: boolean) => Promise<void>;
  onCancel: () => void;
};

export function TrainingForm({ training, onSubmit, onCancel }: TrainingFormProps) {
  const [values, setValues] = useState<TrainingInput>(() => initial(training));
  const [errors, setErrors] = useState<Errors>({});
  const [conflict, setConflict] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<'publish' | 'save' | null>(null);
  const creating = training === undefined;
  const selected = new Set(values.audiences.map(audienceKey));

  function set<K extends keyof TrainingInput>(key: K, value: TrainingInput[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function toggle(choice: AudienceChoice, checked: boolean) {
    setValues((current) => ({
      ...current,
      audiences: checked
        ? [
            ...current.audiences,
            choice.regime === undefined
              ? { type: choice.type }
              : { type: choice.type, regime: choice.regime },
          ]
        : current.audiences.filter((audience) => audienceKey(audience) !== choice.key),
    }));
  }

  async function submit(publish: boolean) {
    const missing: Errors = {
      title: values.title.trim() === '' ? required : undefined,
      starts_at: values.starts_at === '' ? required : undefined,
      ends_at:
        values.ends_at === ''
          ? required
          : values.starts_at !== '' && values.ends_at < values.starts_at
            ? text.errors.ends
            : undefined,
      audiences: values.audiences.length === 0 ? text.errors.audiences : undefined,
    };

    setErrors(missing);
    setConflict(null);
    if (Object.values(missing).some((value) => value !== undefined)) {
      return;
    }
    setSubmitting(publish ? 'publish' : 'save');
    try {
      await onSubmit(values, publish);
    } catch (error) {
      if (error instanceof ApiValidationError) {
        setErrors(fieldErrors(error.fields));
      } else if (error instanceof ApiBusinessError) {
        setConflict(error.message);
      } else {
        toastUnexpectedError(error);
      }
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <Card>
      <CardContent>
        <form
          noValidate
          aria-label={creating ? text.title : text.editTitle}
          className="grid gap-4"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            void submit(creating);
          }}
        >
          {conflict !== null ? (
            <Banner tone="danger" role="alert">
              {conflict}
            </Banner>
          ) : null}
          <TextField
            id="training-title"
            label={text.fields.title}
            required
            value={values.title}
            error={errors.title}
            onChange={(event) => {
              set('title', event.target.value);
            }}
          />
          <FormField
            id="training-description"
            label={text.fields.description}
            error={errors.description}
          >
            <Textarea
              {...fieldProps('training-description', errors.description, false)}
              value={values.description}
              onChange={(event) => {
                set('description', event.target.value);
              }}
            />
          </FormField>
          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              id="training-starts-at"
              type="datetime-local"
              label={text.fields.startsAt}
              required
              value={values.starts_at}
              error={errors.starts_at}
              onChange={(event) => {
                set('starts_at', event.target.value);
              }}
            />
            <TextField
              id="training-ends-at"
              type="datetime-local"
              label={text.fields.endsAt}
              required
              value={values.ends_at}
              error={errors.ends_at}
              onChange={(event) => {
                set('ends_at', event.target.value);
              }}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              id="training-format"
              label={text.fields.format}
              required
              error={errors.format}
            >
              <Select
                {...fieldProps('training-format', errors.format, false)}
                value={values.format}
                onChange={(event) => {
                  set('format', event.target.value);
                }}
              >
                {TRAINING_FORMATS.map((format) => (
                  <option key={format} value={format}>
                    {labels.formats[format]}
                  </option>
                ))}
              </Select>
            </FormField>
            <TextField
              id="training-trainer"
              label={text.fields.trainer}
              value={values.trainer}
              error={errors.trainer}
              onChange={(event) => {
                set('trainer', event.target.value);
              }}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              id="training-location"
              label={text.fields.location}
              value={values.location}
              error={errors.location}
              onChange={(event) => {
                set('location', event.target.value);
              }}
            />
            <TextField
              id="training-online-url"
              type="url"
              label={text.fields.onlineUrl}
              hint={text.fields.onlineUrlHint}
              value={values.online_url}
              error={errors.online_url}
              onChange={(event) => {
                set('online_url', event.target.value);
              }}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              id="training-capacity"
              inputMode="numeric"
              label={text.fields.capacity}
              hint={text.fields.capacityHint}
              value={values.capacity}
              error={errors.capacity}
              onChange={(event) => {
                set('capacity', event.target.value);
              }}
            />
            <TextField
              id="training-price"
              inputMode="numeric"
              label={text.fields.price}
              hint={text.fields.priceHint}
              required
              value={values.price}
              error={errors.price}
              onChange={(event) => {
                set('price', event.target.value);
              }}
            />
          </div>
          <CheckboxField id="training-approval" label={text.fields.approval}>
            <Checkbox
              id="training-approval"
              checked={values.requires_approval}
              onChange={(event) => {
                set('requires_approval', event.target.checked);
              }}
            />
          </CheckboxField>
          <fieldset
            className="grid gap-1"
            aria-describedby={
              errors.audiences === undefined ? undefined : 'training-audiences-error'
            }
          >
            <legend className="mb-1 text-label font-semibold">
              {text.fields.audiences}
              <span aria-hidden="true" className="text-danger">
                {' '}
                *
              </span>
            </legend>
            {AUDIENCE_CHOICES.map((choice) => (
              <CheckboxField
                key={choice.key}
                id={`training-audience-${choice.key.replace(':', '-')}`}
                label={
                  choice.regime === undefined
                    ? labels.audiences[choice.type]
                    : labels.regime(choice.regime)
                }
              >
                <Checkbox
                  id={`training-audience-${choice.key.replace(':', '-')}`}
                  checked={selected.has(choice.key)}
                  onChange={(event) => {
                    toggle(choice, event.target.checked);
                  }}
                />
              </CheckboxField>
            ))}
            {errors.audiences === undefined ? null : (
              <p id="training-audiences-error" className="text-note text-danger">
                {errors.audiences}
              </p>
            )}
          </fieldset>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={submitting !== null}
              onClick={onCancel}
            >
              {fr.common.cancel}
            </Button>
            {creating ? (
              <Button
                type="button"
                variant="secondary"
                loading={submitting === 'save'}
                disabled={submitting !== null}
                onClick={() => void submit(false)}
              >
                {text.draft}
              </Button>
            ) : null}
            <Button
              type="submit"
              loading={submitting === 'publish' || (!creating && submitting === 'save')}
              disabled={submitting !== null}
            >
              {creating ? text.publish : text.save}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
