import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PlugZap } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox, CheckboxField } from '@/components/ui/checkbox';
import { fieldProps } from '@/components/ui/field-props';
import { FormField } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { TextField } from '@/components/ui/text-field';
import { Textarea } from '@/components/ui/textarea';
import {
  invoiceKeys,
  invoicesApi,
  type InvoicingProvider,
} from '@/features/invoices/api/invoices-api';
import { ApiBusinessError } from '@/lib/api-errors';
import { formatTimestamp } from '@/lib/format';
import { showValidationErrors } from '@/lib/form-errors';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';

/*
 * Onglet « Facturation FNE » de `/cga/parametres` (F-ADM-07, RG-FNE-03) : mode de certification
 * (manuel, API DGI, Sell Flow selon ceux disponibles), adresse et identifiants du fournisseur (jamais
 * renvoyés en clair : « •••• 4F2A » ; laissés vides, ils sont conservés), format du numéro FNE,
 * interrupteur Actif ; « Tester la connexion ». Les identifiants ne sont jamais dans le code ni `.env`.
 */
const labels = fr.invoices.provider;

type ProviderForm = {
  mode: string;
  base_url: string;
  credentials: string;
  fne_number_pattern: string;
  active: boolean;
};

function ProviderEditor({ provider }: { provider: InvoicingProvider }) {
  const queryClient = useQueryClient();
  const [testing, setTesting] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    control,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProviderForm>({
    defaultValues: {
      mode: provider.mode,
      base_url: provider.base_url ?? '',
      credentials: '',
      fne_number_pattern: provider.fne_number_pattern ?? '',
      active: provider.active,
    },
  });
  const mode = useWatch({ control, name: 'mode' });
  const manual = mode === 'manual';
  const readOnly = !provider.can.update;

  const submit = handleSubmit(async (values) => {
    if (!manual && values.base_url.trim() === '') {
      setError('base_url', { message: fr.members.create.errors.required });

      return;
    }

    try {
      const saved = await invoicesApi.saveProvider({
        mode: values.mode,
        base_url: values.base_url.trim() === '' ? null : values.base_url.trim(),
        // Laissés vides, les identifiants enregistrés sont conservés.
        ...(values.credentials.trim() === '' ? {} : { credentials: values.credentials.trim() }),
        fne_number_pattern:
          values.fne_number_pattern.trim() === '' ? null : values.fne_number_pattern.trim(),
        active: values.active,
      });

      queryClient.setQueryData(invoiceKeys.provider, saved);
      reset({ ...values, credentials: '' });
      toast.success(labels.saved);
    } catch (error) {
      if (
        !showValidationErrors(error, setError, {
          mode: 'mode',
          base_url: 'base_url',
          credentials: 'credentials',
          fne_number_pattern: 'fne_number_pattern',
          active: 'active',
        })
      ) {
        toastUnexpectedError(error);
      }
    }
  });

  async function test() {
    setTesting(true);

    try {
      const tested = await invoicesApi.testProvider();

      queryClient.setQueryData(invoiceKeys.provider, tested);
      if (tested.last_test_ok === true) {
        toast.success(labels.testOk);
      } else {
        toast.error(labels.testFailed);
      }
    } catch (error) {
      if (error instanceof ApiBusinessError) {
        toast.error(error.message);
      } else {
        toastUnexpectedError(error);
      }
    } finally {
      setTesting(false);
    }
  }

  return (
    <form noValidate onSubmit={submit} className="grid gap-4">
      <FormField id="provider-mode" label={labels.mode} required error={errors.mode?.message}>
        <Select
          {...fieldProps('provider-mode', errors.mode?.message)}
          disabled={readOnly}
          {...register('mode')}
        >
          {provider.modes.map((option) => (
            <option key={option.value} value={option.value} disabled={!option.available}>
              {option.available ? option.label : labels.unavailable(option.label)}
            </option>
          ))}
        </Select>
      </FormField>
      {manual ? <p className="text-note text-muted">{labels.manualHint}</p> : null}
      <TextField
        id="provider-url"
        label={labels.baseUrl}
        required={!manual}
        disabled={readOnly}
        error={errors.base_url?.message}
        {...register('base_url')}
      />
      <FormField
        id="provider-credentials"
        label={labels.credentials}
        hint={
          provider.credentials_hint === null
            ? labels.credentialsNone
            : labels.credentialsHint(provider.credentials_hint)
        }
        error={errors.credentials?.message}
      >
        <Textarea
          {...fieldProps('provider-credentials', errors.credentials?.message, true)}
          autoComplete="off"
          disabled={readOnly}
          {...register('credentials')}
        />
      </FormField>
      <TextField
        id="provider-pattern"
        label={labels.pattern}
        hint={labels.patternHint}
        disabled={readOnly}
        error={errors.fne_number_pattern?.message}
        {...register('fne_number_pattern')}
      />
      <CheckboxField id="provider-active" label={labels.active}>
        <Checkbox id="provider-active" disabled={readOnly} {...register('active')} />
      </CheckboxField>
      {provider.last_test_at !== null ? (
        <p className="text-note text-muted">
          {provider.last_test_ok === true
            ? labels.lastTestOk(formatTimestamp(provider.last_test_at))
            : labels.lastTestFailed(formatTimestamp(provider.last_test_at))}
        </p>
      ) : null}
      {readOnly ? null : (
        <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
          {provider.can.test ? (
            <Button
              variant="secondary"
              loading={testing}
              disabled={isDirty}
              onClick={() => void test()}
            >
              <PlugZap aria-hidden="true" />
              {labels.test}
            </Button>
          ) : null}
          <Button type="submit" loading={isSubmitting}>
            {labels.save}
          </Button>
        </div>
      )}
    </form>
  );
}

export function ProviderTab() {
  const query = useQuery({ queryKey: invoiceKeys.provider, queryFn: () => invoicesApi.provider() });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{fr.cgaSettings.tabs.facturation}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="text-note text-muted">{labels.intro}</p>
        {query.isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : query.isError ? (
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
        ) : (
          <ProviderEditor provider={query.data} />
        )}
      </CardContent>
    </Card>
  );
}
