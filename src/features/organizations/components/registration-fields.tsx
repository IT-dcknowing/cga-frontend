import {
  useWatch,
  type Control,
  type FieldErrors,
  type FieldValues,
  type UseFormRegister,
  type UseFormReturn,
} from 'react-hook-form';
import { Radio, RadioGroupField, RadioOption } from '@/components/ui/radio';
import { TextField } from '@/components/ui/text-field';
import type { RegistrationForm } from '@/features/organizations/lib/schemas';
import { fr } from '@/lib/i18n/fr';

const labels = fr.organization;
const fields = labels.fields;

type RegistrationFieldsProps<T extends FieldValues & RegistrationForm> = {
  /** Formulaire qui contient les champs du registre, seuls ou avec d'autres (gérant…). */
  form: UseFormReturn<T>;
  /** Préfixe des identifiants : la modale de création et la fiche peuvent coexister. */
  idPrefix: string;
};

/**
 * Champs de la fiche du registre (F-ORG-02) : dénomination, sigle, ville, téléphone, e-mail, statut
 * d'agrément (en cours / agréé, RG-ORG-03) et, pour un CGA agréé, son numéro et sa date.
 */
export function RegistrationFields<T extends FieldValues & RegistrationForm>({
  form,
  idPrefix,
}: RegistrationFieldsProps<T>) {
  // Les champs du registre sont communs à plusieurs formulaires : leur type est celui du registre.
  const register = form.register as unknown as UseFormRegister<RegistrationForm>;
  const control = form.control as unknown as Control<RegistrationForm>;
  const errors = form.formState.errors as FieldErrors<RegistrationForm>;
  const granted = useWatch({ control, name: 'agreement_status' }) === 'granted';
  const id = (name: string) => `${idPrefix}-${name}`;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <TextField
        id={id('name')}
        label={fields.name}
        required
        className="md:col-span-2"
        error={errors.name?.message}
        {...register('name')}
      />
      <TextField
        id={id('sigle')}
        label={fields.sigle}
        error={errors.sigle?.message}
        {...register('sigle')}
      />
      <TextField
        id={id('city')}
        label={fields.city}
        required
        error={errors.city?.message}
        {...register('city')}
      />
      <TextField
        id={id('phone')}
        label={fields.phone}
        required
        type="tel"
        autoComplete="tel"
        error={errors.phone_1?.message}
        {...register('phone_1')}
      />
      <TextField
        id={id('email')}
        label={fields.email}
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register('email')}
      />

      <RadioGroupField
        id={id('agreement')}
        legend={fields.agreementStatus}
        required
        className="md:col-span-2"
        error={errors.agreement_status?.message}
      >
        <RadioOption label={labels.agreement.pending}>
          <Radio value="pending" {...register('agreement_status')} />
        </RadioOption>
        <RadioOption label={labels.agreement.granted}>
          <Radio value="granted" {...register('agreement_status')} />
        </RadioOption>
      </RadioGroupField>

      {granted ? (
        <>
          <TextField
            id={id('agreement-number')}
            label={fields.agreementNumber}
            required
            error={errors.agreement_number?.message}
            {...register('agreement_number')}
          />
          <TextField
            id={id('agreement-date')}
            label={fields.agreementDate}
            required
            type="date"
            error={errors.agreement_date?.message}
            {...register('agreement_date')}
          />
        </>
      ) : null}
    </div>
  );
}
