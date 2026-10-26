import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { useWatch, type UseFormReturn } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Checkbox, CheckboxField } from '@/components/ui/checkbox';
import { fieldProps } from '@/components/ui/field-props';
import { FormField } from '@/components/ui/form-field';
import { Radio, RadioGroupField, RadioOption } from '@/components/ui/radio';
import { Select } from '@/components/ui/select';
import { TextField } from '@/components/ui/text-field';
import { Textarea } from '@/components/ui/textarea';
import {
  ENTITY_TYPES,
  FEES_PERIODICITIES,
  LEGAL_FORMS,
  REGIMES_OF,
  REVENUE_KINDS,
  type ReferenceOption,
  type Referrer,
  type Sector,
} from '@/features/members/api/members-api';
import type { MemberField, MemberForm } from '@/features/members/lib/member-form';
import { fr } from '@/lib/i18n/fr';

/*
 * Champs d'un dossier (F-ADH-02) en deux groupes : « Identification » (étape 1) et « Activité et
 * adhésion » (étape 2). L'apporteur et le contrat CGA n'existent qu'au portefeuille CGA (RG-PTF-06,
 * 08) ; les régimes proposés suivent le portefeuille (RG-PTF-01).
 */
const labels = fr.members.fields;
const sections = fr.members.create.sections;

type FieldsProps = { form: UseFormReturn<MemberForm>; disabled?: boolean };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-4 md:grid-cols-2">
      <legend className="mb-2 text-card-title font-bold text-ink">{title}</legend>
      {children}
    </fieldset>
  );
}

function useText({ form, disabled }: FieldsProps) {
  const {
    register,
    formState: { errors },
  } = form;

  return (
    field: MemberField,
    label: string,
    options: {
      required?: boolean;
      hint?: string;
      type?: string;
      inputMode?: 'numeric' | 'tel' | 'email';
      wide?: boolean;
    } = {},
  ) => (
    <TextField
      id={`member-${field}`}
      label={label}
      required={options.required}
      hint={options.hint}
      type={options.type}
      inputMode={options.inputMode}
      disabled={disabled}
      className={options.wide === true ? 'md:col-span-2' : undefined}
      error={errors[field]?.message}
      {...register(field)}
    />
  );
}

type SelectProps = FieldsProps & {
  field: MemberField;
  label: string;
  required?: boolean;
  /** Première ligne vide (« — ») pour un champ facultatif ou pas encore choisi. */
  placeholder?: string;
  options: { value: string; label: string }[];
  action?: ReactNode;
};

function SelectField({
  form,
  disabled,
  field,
  label,
  required,
  placeholder,
  options,
  action,
}: SelectProps) {
  const error = form.formState.errors[field]?.message;
  const id = `member-${field}`;

  return (
    <FormField id={id} label={label} required={required} error={error}>
      <div className="flex gap-2">
        <Select
          {...fieldProps(id, error)}
          aria-required={required === true || undefined}
          disabled={disabled}
          {...form.register(field)}
        >
          {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        {action}
      </div>
    </FormField>
  );
}

function optionsOf(items: ReferenceOption[] | undefined) {
  return (items ?? []).map((item) => ({ value: item.id, label: item.name }));
}

type IdentificationProps = FieldsProps & {
  taxOffices: ReferenceOption[] | undefined;
  communes: ReferenceOption[] | undefined;
  /** Apporteurs actifs, quand l'utilisateur a le droit de les voir ; sinon le champ disparaît. */
  referrers: Referrer[] | undefined;
  /** Choix du portefeuille (inscription seulement) ; en modification, il ne change pas ici. */
  portfolioChoice?: ReactNode;
  /** Sous le NCC : contrôle à la volée (doublon, autre CGA). */
  nccNotice?: ReactNode;
  onNccBlur?: () => void;
  /** Dossier validé : le régime change par « Changer de régime » (F-ADH-05), pas par la fiche. */
  regimeLocked?: boolean;
};

export function IdentificationFields(props: IdentificationProps) {
  const { form, disabled, taxOffices, communes, referrers, portfolioChoice, nccNotice } = props;
  const text = useText(props);
  const [portfolio, entityType] = useWatch({
    control: form.control,
    name: ['portfolio', 'entity_type'],
  });
  const ncc = form.register('ncc');
  const nccError = form.formState.errors.ncc?.message;

  return (
    <div className="grid gap-6">
      <Section title={sections.identity}>
        {portfolioChoice !== undefined ? (
          <div className="md:col-span-2">{portfolioChoice}</div>
        ) : null}
        <RadioGroupField id="member-entity_type" legend={labels.entityType} required>
          <div className="flex flex-wrap gap-4">
            {ENTITY_TYPES.map((type) => (
              <RadioOption key={type} label={fr.members.entityTypes[type]}>
                <Radio value={type} disabled={disabled} {...form.register('entity_type')} />
              </RadioOption>
            ))}
          </div>
        </RadioGroupField>
        {text('company_name', labels.companyName, { required: true })}
        {text('sigle', labels.sigle, { hint: labels.sigleHint })}
        <SelectField
          {...props}
          field="legal_form"
          label={labels.legalForm}
          required
          placeholder={fr.table.none}
          options={LEGAL_FORMS.map((form) => ({ value: form, label: fr.members.legalForms[form] }))}
        />
        {entityType === 'company'
          ? text('share_capital', labels.shareCapital, { inputMode: 'numeric' })
          : null}
      </Section>

      {entityType === 'individual' ? (
        <Section title={sections.owner}>
          {text('owner_last_name', labels.ownerLastName, { required: true })}
          {text('owner_first_names', labels.ownerFirstNames, { required: true })}
          {text('owner_nationality', labels.ownerNationality, { required: true })}
          {text('owner_id_document_type', labels.ownerIdDocumentType, { required: true })}
          {text('owner_id_document_number', labels.ownerIdDocumentNumber, { required: true })}
        </Section>
      ) : null}

      <Section title={sections.tax}>
        <div className="grid gap-1.5">
          <TextField
            id="member-ncc"
            label={labels.ncc}
            required
            hint={labels.nccHint}
            disabled={disabled}
            error={nccError}
            {...ncc}
            onBlur={(event) => {
              void ncc.onBlur(event);
              props.onNccBlur?.();
            }}
          />
          {nccNotice}
        </div>
        <SelectField
          {...props}
          disabled={disabled === true || props.regimeLocked === true}
          field="regime"
          label={labels.regime}
          required
          options={REGIMES_OF[portfolio].map((regime) => ({
            value: regime,
            label: fr.status.regime[regime],
          }))}
        />
        {text('rccm', labels.rccm)}
        {text('idu', labels.idu)}
        <SelectField
          {...props}
          field="tax_office_id"
          label={labels.taxOffice}
          required
          placeholder={fr.table.none}
          options={optionsOf(taxOffices)}
        />
        {text('legacy_number', labels.legacyNumber, { hint: labels.legacyNumberHint })}
        {portfolio === 'cga' && referrers !== undefined ? (
          <SelectField
            {...props}
            field="referrer_id"
            label={labels.referrer}
            placeholder={labels.noReferrer}
            options={referrers
              .filter((referrer) => referrer.active)
              .map((referrer) => ({
                value: referrer.id,
                label: `${referrer.label} · ${referrer.name}`,
              }))}
          />
        ) : null}
      </Section>

      <Section title={sections.location}>
        {text('main_activity', labels.mainActivity, { required: true, wide: true })}
        {text('activity_code_text', labels.activityCode)}
        {text('employees_count', labels.employeesCount, { inputMode: 'numeric' })}
        <FormField
          id="member-address"
          label={labels.address}
          required
          error={form.formState.errors.address?.message}
          className="md:col-span-2"
        >
          <Textarea
            {...fieldProps('member-address', form.formState.errors.address?.message)}
            aria-required
            rows={2}
            disabled={disabled}
            {...form.register('address')}
          />
        </FormField>
        <SelectField
          {...props}
          field="commune_id"
          label={labels.commune}
          required
          placeholder={fr.table.none}
          options={optionsOf(communes)}
        />
        <div className="grid grid-cols-2 gap-4">
          {text('land_section', labels.landSection)}
          {text('land_parcel', labels.landParcel)}
        </div>
        {text('phone', labels.phone, { required: true, type: 'tel', inputMode: 'tel' })}
        {text('whatsapp', labels.whatsapp, {
          type: 'tel',
          inputMode: 'tel',
          hint: labels.whatsappHint,
        })}
        {text('email', labels.email, { type: 'email', inputMode: 'email' })}
      </Section>

      <Section title={sections.signatory}>
        {text('signatory_name', labels.signatoryName, { required: true })}
        {text('signatory_title', labels.signatoryTitle, { required: true })}
      </Section>
    </div>
  );
}

type ActivityProps = FieldsProps & {
  sectors: Sector[] | undefined;
  onProposeSector?: () => void;
  /** Exemplaire signé du contrat CGA (inscription) : choisi ici, déposé après l'enregistrement. */
  contractFile?: ReactNode;
  /** Confirmation sur l'honneur de l'exclusivité (validation de l'adhésion seulement). */
  withExclusivity?: boolean;
};

export function ActivityFields(props: ActivityProps) {
  const { form, disabled, sectors, onProposeSector, contractFile, withExclusivity = false } = props;
  const text = useText(props);
  const portfolio = useWatch({ control: form.control, name: 'portfolio' });
  const errors = form.formState.errors;
  const proposed = fr.members.create.sector.proposed;

  return (
    <div className="grid gap-6">
      <Section title={sections.activity}>
        <SelectField
          {...props}
          field="sector_id"
          label={labels.sector}
          required
          placeholder={fr.table.none}
          options={(sectors ?? []).map((sector) => ({
            value: sector.id,
            label: sector.status === 'proposed' ? `${sector.name} (${proposed})` : sector.name,
          }))}
          action={
            onProposeSector !== undefined ? (
              <Button variant="secondary" onClick={onProposeSector} disabled={disabled}>
                <Plus aria-hidden="true" />
                {fr.members.create.proposeSector}
              </Button>
            ) : undefined
          }
        />
        {text('revenue_amount', labels.revenueAmount, { required: true, inputMode: 'numeric' })}
        <SelectField
          {...props}
          field="revenue_kind"
          label={labels.revenueKind}
          required
          options={REVENUE_KINDS.map((kind) => ({
            value: kind,
            label: fr.members.revenueKinds[kind],
          }))}
        />
        {text('revenue_year', labels.revenueYear, { required: true, inputMode: 'numeric' })}
      </Section>

      {portfolio === 'cga' ? (
        <Section title={sections.contract}>
          {text('cga_contract_signed_on', labels.contractSignedOn, {
            required: true,
            type: 'date',
            hint: labels.contractSignedOnHint,
          })}
          {contractFile}
          <div className="md:col-span-2">
            <CheckboxField
              id="member-cga_contract_confirmed"
              label={labels.contractConfirmed}
              error={errors.cga_contract_confirmed?.message}
            >
              <Checkbox
                {...fieldProps(
                  'member-cga_contract_confirmed',
                  errors.cga_contract_confirmed?.message,
                )}
                disabled={disabled}
                {...form.register('cga_contract_confirmed')}
              />
            </CheckboxField>
          </div>
        </Section>
      ) : null}

      <Section title={sections.fees}>
        {portfolio === 'cga'
          ? text('entry_fee_amount', labels.entryFee, { required: true, inputMode: 'numeric' })
          : null}
        {text('fees_amount', labels.feesAmount, {
          required: true,
          inputMode: 'numeric',
          hint: labels.feesHint,
        })}
        <SelectField
          {...props}
          field="fees_periodicity"
          label={labels.feesPeriodicity}
          required
          options={FEES_PERIODICITIES.map((periodicity) => ({
            value: periodicity,
            label: fr.members.periodicities[periodicity],
          }))}
        />
        {portfolio === 'cga' && withExclusivity ? (
          <div className="md:col-span-2">
            <CheckboxField
              id="member-exclusivity_confirmed"
              label={labels.exclusivityConfirmed}
              error={errors.exclusivity_confirmed?.message}
            >
              <Checkbox
                {...fieldProps(
                  'member-exclusivity_confirmed',
                  errors.exclusivity_confirmed?.message,
                )}
                disabled={disabled}
                {...form.register('exclusivity_confirmed')}
              />
            </CheckboxField>
          </div>
        ) : null}
      </Section>
    </div>
  );
}
