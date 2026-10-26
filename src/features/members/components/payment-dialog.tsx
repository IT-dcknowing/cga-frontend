import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { FormDialog } from '@/components/shared/form-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { fieldProps } from '@/components/ui/field-props';
import { FileField } from '@/components/ui/file-field';
import { FormField } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';
import { TextField } from '@/components/ui/text-field';
import { dossierApi, type Charge, type Payment } from '@/features/members/api/dossier-api';
import { PAYMENT_METHODS } from '@/features/members/api/members-api';
import { dossierKeys } from '@/features/members/api/queries';
import { chargeLabel } from '@/features/members/lib/charges';
import { ApiBusinessError } from '@/lib/api-errors';
import { formatAmount } from '@/lib/format';
import { showValidationErrors } from '@/lib/form-errors';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';

/*
 * « Enregistrer un paiement » (F-PAY-02, 03-APPFLOW §4.3) : échéances cochées, montant pré-rempli
 * par leur reste dû (TTC, donné par le serveur), date, mode, référence, preuve facultative. Le
 * paiement saisi par le CGA est confirmé d'office ; le reçu numéroté suit (RG-PAY-02).
 * `only` : la modale du droit d'adhésion à la validation, réduite à cette échéance.
 */
const labels = fr.members.finance.paymentDialog;

type PaymentForm = {
  charge_ids: string[];
  amount: string;
  paid_on: string;
  method: string;
  reference: string;
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function dueOf(charges: Charge[], ids: string[]): number {
  return charges
    .filter((charge) => ids.includes(charge.id))
    .reduce((sum, charge) => sum + charge.balance, 0);
}

export function PaymentDialog({
  memberId,
  title = labels.title,
  submitLabel = labels.submit,
  only,
  onClose,
  onRecorded,
}: {
  memberId: string;
  title?: string;
  submitLabel?: string;
  /** Genre d'échéance seul proposé (droit d'adhésion à la validation). */
  only?: string;
  onClose: () => void;
  onRecorded: (payment: Payment) => Promise<void> | void;
}) {
  const charges = useQuery({
    queryKey: dossierKeys.charges(memberId),
    queryFn: () => dossierApi.charges(memberId),
  });
  const open = (charges.data ?? []).filter(
    (charge) =>
      charge.balance > 0 &&
      charge.status !== 'cancelled' &&
      (only === undefined || charge.kind === only),
  );
  const [proof, setProof] = useState<File | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    getFieldState,
    control,
    formState: { errors, isSubmitting },
  } = useForm<PaymentForm>({
    defaultValues: {
      charge_ids: [],
      amount: '',
      paid_on: today(),
      method: 'mobile_money',
      reference: '',
    },
  });
  const selected = useWatch({ control, name: 'charge_ids' });
  const required = fr.members.create.errors.required;
  const loaded = charges.data !== undefined;

  // Échéances ouvertes cochées d'office, montant égal à leur reste dû (TTC).
  useEffect(() => {
    if (loaded) {
      const ids = (charges.data ?? [])
        .filter(
          (charge) =>
            charge.balance > 0 &&
            charge.status !== 'cancelled' &&
            (only === undefined || charge.kind === only),
        )
        .map((charge) => charge.id);

      setValue('charge_ids', ids);
      setValue('amount', String(dueOf(charges.data ?? [], ids)));
    }
  }, [loaded, charges.data, only, setValue]);

  function toggle(chargeId: string, checked: boolean) {
    const next = checked ? [...selected, chargeId] : selected.filter((id) => id !== chargeId);

    setValue('charge_ids', next);

    // Un montant saisi à la main l'emporte sur le reste dû des échéances cochées.
    if (!getFieldState('amount').isDirty) {
      setValue('amount', String(dueOf(open, next)));
    }
  }

  const submit = handleSubmit(async (values) => {
    const amount = values.amount.trim();

    if (!/^\d+$/.test(amount) || Number(amount) === 0) {
      setError('amount', { message: fr.members.create.errors.number });

      return;
    }

    if (values.paid_on === '') {
      setError('paid_on', { message: required });

      return;
    }

    setConflict(null);

    try {
      const payment = await dossierApi.recordPayment(memberId, {
        amount: Number.parseInt(amount, 10),
        paid_on: values.paid_on,
        method: values.method,
        reference: values.reference.trim() || null,
        charge_ids: values.charge_ids,
        proof,
      });

      await onRecorded(payment);
    } catch (error) {
      if (error instanceof ApiBusinessError) {
        setConflict(error.message);
      } else if (
        !showValidationErrors(error, setError, {
          amount: 'amount',
          paid_on: 'paid_on',
          method: 'method',
          reference: 'reference',
        })
      ) {
        toastUnexpectedError(error);
      }
    }
  });

  return (
    <FormDialog
      open
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
      title={title}
      submitLabel={submitLabel}
      submitting={isSubmitting}
      onSubmit={submit}
      conflict={conflict}
    >
      {open.length > 0 ? (
        <fieldset className="grid gap-2">
          <legend className="mb-1.5 text-label font-semibold text-muted">{labels.charges}</legend>
          {open.map((charge) => (
            <label key={charge.id} className="flex items-start justify-between gap-3 text-body">
              <span className="flex items-start gap-2">
                <Checkbox
                  checked={selected.includes(charge.id)}
                  onChange={(event) => {
                    toggle(charge.id, event.target.checked);
                  }}
                />
                {chargeLabel(charge)}
              </span>
              <span className="font-semibold">{formatAmount(charge.balance)}</span>
            </label>
          ))}
        </fieldset>
      ) : loaded ? (
        <p className="text-note text-muted">{labels.noCharge}</p>
      ) : null}
      <TextField
        id="payment-amount"
        label={labels.amount}
        required
        inputMode="numeric"
        error={errors.amount?.message}
        {...register('amount')}
      />
      <TextField
        id="payment-paid-on"
        type="date"
        label={labels.paidOn}
        required
        error={errors.paid_on?.message}
        {...register('paid_on')}
      />
      <FormField id="payment-method" label={labels.method} required error={errors.method?.message}>
        <Select {...fieldProps('payment-method', errors.method?.message)} {...register('method')}>
          {PAYMENT_METHODS.map((method) => (
            <option key={method} value={method}>
              {fr.members.detail.paymentMethods[method]}
            </option>
          ))}
        </Select>
      </FormField>
      <TextField
        id="payment-reference"
        label={labels.reference}
        error={errors.reference?.message}
        {...register('reference')}
      />
      <FileField id="payment-proof" label={labels.proof} onChange={setProof} />
    </FormDialog>
  );
}
