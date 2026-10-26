import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Wallet } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { FormDialog } from '@/components/shared/form-dialog';
import { StatusBadge } from '@/components/shared/status-badge';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fieldProps } from '@/components/ui/field-props';
import { FileField } from '@/components/ui/file-field';
import { FormField } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/features/auth/session/auth-context';
import {
  memberFinanceApi,
  memberFinanceKeys,
} from '@/features/member-space/api/member-finance-api';
import { PAYMENT_METHODS } from '@/features/members/api/members-api';
import { chargeLabel } from '@/features/members/lib/charges';
import { ApiBusinessError } from '@/lib/api-errors';
import { formatAmount, formatDate } from '@/lib/format';
import { showValidationErrors } from '@/lib/form-errors';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';
import { permissionCodes } from '@/lib/reference/permissions';

/*
 * `/adherent/honoraires` (03-APPFLOW §5.2, F-PAY-03), depuis la carte Honoraires de l'accueil :
 * échéances (période, montant, payé, reste, statut) et paiements (reçus) ; « Déclarer un paiement »
 * → montant, date, mode, référence, preuve obligatoire → « En attente de confirmation » par le CGA.
 * Aucune sanction automatique d'un impayé (RG-PAY-05) : la page informe seulement.
 */
const labels = fr.memberSpace.fees;
const required = fr.members.create.errors.required;

type DeclarationForm = { amount: string; paid_on: string; method: string; reference: string };

function DeclareDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [proof, setProof] = useState<File | null>(null);
  const [proofError, setProofError] = useState<string | undefined>();
  const [conflict, setConflict] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DeclarationForm>({
    defaultValues: { amount: '', paid_on: '', method: 'mobile_money', reference: '' },
  });
  const text = labels.declare;

  const submit = handleSubmit(async (values) => {
    let invalid = false;
    const amount = values.amount.trim();

    if (!/^\d+$/.test(amount) || Number(amount) === 0) {
      setError('amount', { message: fr.members.create.errors.number });
      invalid = true;
    }

    if (values.paid_on === '') {
      setError('paid_on', { message: required });
      invalid = true;
    }

    setProofError(proof === null ? required : undefined);

    if (invalid || proof === null) {
      return;
    }

    setConflict(null);

    try {
      await memberFinanceApi.declare({
        amount: Number.parseInt(amount, 10),
        paid_on: values.paid_on,
        method: values.method,
        reference: values.reference.trim() === '' ? null : values.reference.trim(),
        proof,
      });
      toast.success(text.done);
      await queryClient.invalidateQueries({ queryKey: memberFinanceKeys.payments });
      onClose();
    } catch (error) {
      if (error instanceof ApiBusinessError) {
        setConflict(error.message);
      } else if (
        !showValidationErrors(
          error,
          (name, fieldError) => {
            if (name === ('proof' as 'amount')) {
              setProofError(fieldError.message);
            } else {
              setError(name as keyof DeclarationForm, fieldError);
            }
          },
          {
            amount: 'amount',
            paid_on: 'paid_on',
            method: 'method',
            reference: 'reference',
            proof: 'proof' as 'amount',
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
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title={text.title}
      description={text.description}
      submitLabel={text.submit}
      submitting={isSubmitting}
      onSubmit={submit}
      conflict={conflict}
    >
      <TextField
        id="declare-amount"
        label={text.amount}
        inputMode="numeric"
        required
        error={errors.amount?.message}
        {...register('amount')}
      />
      <TextField
        id="declare-paid-on"
        type="date"
        label={text.paidOn}
        required
        error={errors.paid_on?.message}
        {...register('paid_on')}
      />
      <FormField id="declare-method" label={text.method} required error={errors.method?.message}>
        <Select {...fieldProps('declare-method', errors.method?.message)} {...register('method')}>
          {PAYMENT_METHODS.map((method) => (
            <option key={method} value={method}>
              {fr.members.detail.paymentMethods[method]}
            </option>
          ))}
        </Select>
      </FormField>
      <TextField
        id="declare-reference"
        label={text.reference}
        error={errors.reference?.message}
        {...register('reference')}
      />
      <FileField
        id="declare-proof"
        label={text.proof}
        required
        hint={text.proofHint}
        error={proofError}
        onChange={(file) => {
          setProof(file);
          setProofError(undefined);
        }}
      />
    </FormDialog>
  );
}

export function MemberFeesPage() {
  const { can } = useAuth();
  const [declaring, setDeclaring] = useState(false);
  const charges = useQuery({
    queryKey: memberFinanceKeys.charges,
    queryFn: () => memberFinanceApi.charges(),
  });
  const payments = useQuery({
    queryKey: memberFinanceKeys.payments,
    queryFn: () => memberFinanceApi.payments(),
  });
  // Accès en consultation seule après la fin de l'adhésion : sans le droit, rien ne se déclare.
  const readOnly = !can(permissionCodes.member.payments);

  if (charges.isPending || payments.isPending) {
    return <Skeleton className="h-32 w-full" />;
  }

  if (charges.isError || payments.isError) {
    return (
      <>
        <PageHeader title={labels.title} />
        <Banner
          tone="danger"
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void charges.refetch();
                void payments.refetch();
              }}
            >
              {fr.common.retry}
            </Button>
          }
        >
          {labels.loadError}
        </Banner>
      </>
    );
  }

  const due = charges.data.reduce((sum, charge) => sum + charge.balance, 0);

  return (
    <>
      <PageHeader
        title={labels.title}
        actions={
          readOnly ? null : (
            <Button
              onClick={() => {
                setDeclaring(true);
              }}
            >
              <Plus aria-hidden="true" />
              {labels.declare.action}
            </Button>
          )
        }
      />
      <div className="grid gap-4">
        <p className="text-body">
          {labels.balance} <span className="font-bold">{formatAmount(due)}</span>
        </p>

        <Card>
          <CardHeader>
            <CardTitle>{labels.charges}</CardTitle>
          </CardHeader>
          <CardContent>
            {charges.data.length === 0 ? (
              <EmptyState icon={Wallet}>{labels.noCharge}</EmptyState>
            ) : (
              <ul aria-label={labels.charges} className="divide-y divide-border">
                {charges.data.map((charge) => (
                  <li key={charge.id} className="grid gap-1 py-2.5">
                    <span className="flex items-start justify-between gap-3">
                      <span className="font-semibold">{chargeLabel(charge)}</span>
                      <StatusBadge domain="charge" status={charge.status} />
                    </span>
                    <span className="text-note text-muted">
                      {labels.chargeLine(
                        formatAmount(charge.amount),
                        formatAmount(charge.amount_paid),
                        formatAmount(charge.balance),
                        formatDate(charge.due_date),
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{labels.payments}</CardTitle>
          </CardHeader>
          <CardContent>
            {payments.data.length === 0 ? (
              <EmptyState icon={Wallet}>{labels.noPayment}</EmptyState>
            ) : (
              <ul aria-label={labels.payments} className="divide-y divide-border">
                {payments.data.map((payment) => (
                  <li key={payment.id} className="grid gap-1 py-2.5">
                    <span className="flex items-start justify-between gap-3">
                      <span className="font-semibold">
                        {formatAmount(payment.amount)} · {formatDate(payment.paid_on)}
                      </span>
                      <StatusBadge domain="payment" status={payment.status} />
                    </span>
                    <span className="text-note text-muted">
                      {[payment.method_label, payment.reference, payment.receipt_number]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    {payment.rejection_reason !== null ? (
                      <span className="text-note text-danger">
                        {fr.members.finance.payments.rejected(payment.rejection_reason)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      {declaring ? (
        <DeclareDialog
          onClose={() => {
            setDeclaring(false);
          }}
        />
      ) : null}
    </>
  );
}
