import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { KeyValueList } from '@/components/shared/key-value-list';
import { UnsavedChangesGuard } from '@/components/shared/unsaved-changes-guard';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fieldProps } from '@/components/ui/field-props';
import { FormField } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { TextField } from '@/components/ui/text-field';
import {
  FEE_REGIMES,
  feesApi,
  PERIODICITIES,
  type FeeScheduleView,
} from '@/features/cga-settings/api/fees-api';
import { memberKeys } from '@/features/members/api/queries';
import { formatAmount, formatDate } from '@/lib/format';
import { showValidationErrors } from '@/lib/form-errors';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';

/*
 * Onglet « Barème » de `/cga/parametres` (F-PAY-01, 03-APPFLOW §4.3) : droit d'adhésion et
 * honoraires par régime du portefeuille CGA (montant hors taxes, périodicité), pré-remplis ensuite à
 * l'inscription d'un adhérent. Modifiable par le gérant ; le serveur date la nouvelle valeur.
 */
const labels = fr.cgaSettings.fees;
const periodicities = fr.members.periodicities;

type FeesForm = {
  entry_fee: string;
  RME_amount: string;
  RME_periodicity: string;
  TEE_amount: string;
  TEE_periodicity: string;
};

function formOf(schedule: FeeScheduleView): FeesForm {
  return {
    entry_fee: String(schedule.entry_fee.amount),
    RME_amount: String(schedule.fees.RME?.amount ?? 0),
    RME_periodicity: schedule.fees.RME?.periodicity ?? 'monthly',
    TEE_amount: String(schedule.fees.TEE?.amount ?? 0),
    TEE_periodicity: schedule.fees.TEE?.periodicity ?? 'monthly',
  };
}

function ScheduleForm({ schedule, onDone }: { schedule: FeeScheduleView; onDone: () => void }) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<FeesForm>({ defaultValues: formOf(schedule) });

  const submit = handleSubmit(async (values) => {
    let invalid = false;

    for (const name of ['entry_fee', 'RME_amount', 'TEE_amount'] as const) {
      if (!/^\d+$/.test(values[name].trim())) {
        setError(name, { message: fr.cgaSettings.centre.integer });
        invalid = true;
      }
    }

    if (invalid) {
      return;
    }

    const amount = (value: string) => Number.parseInt(value.trim(), 10);

    try {
      const saved = await feesApi.saveSchedule({
        entry_fee: amount(values.entry_fee),
        fees: {
          RME: { amount: amount(values.RME_amount), periodicity: values.RME_periodicity },
          TEE: { amount: amount(values.TEE_amount), periodicity: values.TEE_periodicity },
        },
      });

      queryClient.setQueryData(memberKeys.feeSchedule, saved);
      toast.success(labels.saved);
      onDone();
    } catch (error) {
      if (
        !showValidationErrors(error, setError, {
          entry_fee: 'entry_fee',
          'fees.RME.amount': 'RME_amount',
          'fees.RME.periodicity': 'RME_periodicity',
          'fees.TEE.amount': 'TEE_amount',
          'fees.TEE.periodicity': 'TEE_periodicity',
        })
      ) {
        toastUnexpectedError(error);
      }
    }
  });

  return (
    <form noValidate onSubmit={submit} className="grid gap-4">
      <UnsavedChangesGuard when={isDirty && !isSubmitting} />
      <TextField
        id="fees-entry"
        label={labels.entryFee}
        inputMode="numeric"
        required
        error={errors.entry_fee?.message}
        {...register('entry_fee')}
      />
      {FEE_REGIMES.map((regime) => (
        <fieldset key={regime} className="grid gap-4 md:grid-cols-2">
          <legend className="mb-2 text-label font-semibold text-muted md:col-span-2">
            {labels.regime(regime)}
          </legend>
          <TextField
            id={`fees-${regime}-amount`}
            label={labels.amount}
            inputMode="numeric"
            required
            error={errors[`${regime}_amount`]?.message}
            {...register(`${regime}_amount`)}
          />
          <FormField
            id={`fees-${regime}-periodicity`}
            label={labels.periodicity}
            required
            error={errors[`${regime}_periodicity`]?.message}
          >
            <Select
              {...fieldProps(
                `fees-${regime}-periodicity`,
                errors[`${regime}_periodicity`]?.message,
              )}
              {...register(`${regime}_periodicity`)}
            >
              {PERIODICITIES.map((periodicity) => (
                <option key={periodicity} value={periodicity}>
                  {periodicities[periodicity]}
                </option>
              ))}
            </Select>
          </FormField>
        </fieldset>
      ))}
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

export function FeeScheduleTab() {
  const [editing, setEditing] = useState(false);
  const query = useQuery({ queryKey: memberKeys.feeSchedule, queryFn: () => feesApi.schedule() });

  if (query.isPending) {
    return <Skeleton className="h-32 w-full" />;
  }

  if (query.isError) {
    return (
      <Banner
        tone="danger"
        action={
          <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
            {fr.common.retry}
          </Button>
        }
      >
        {labels.loadError}
      </Banner>
    );
  }

  const schedule = query.data as FeeScheduleView;
  const since = (date: string | null) => (date === null ? '' : labels.since(formatDate(date)));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{fr.cgaSettings.tabs.bareme}</CardTitle>
        {schedule.can.update && !editing ? (
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
      <CardContent className="grid gap-3">
        <p className="text-note text-muted">{labels.intro}</p>
        {editing ? (
          <ScheduleForm
            schedule={schedule}
            onDone={() => {
              setEditing(false);
            }}
          />
        ) : (
          <KeyValueList
            items={[
              {
                label: labels.entryFee,
                value: `${formatAmount(schedule.entry_fee.amount)}${since(schedule.entry_fee.valid_from)}`,
              },
              ...FEE_REGIMES.map((regime) => {
                const fees = schedule.fees[regime];

                return {
                  label: labels.regime(regime),
                  value:
                    fees === undefined
                      ? null
                      : `${formatAmount(fees.amount)} · ${periodicities[fees.periodicity as 'monthly'] ?? fees.periodicity}${since(fees.valid_from)}`,
                };
              }),
            ]}
          />
        )}
      </CardContent>
    </Card>
  );
}
