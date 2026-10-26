import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Wallet } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { EmptyState } from '@/components/shared/empty-state';
import { FormDialog } from '@/components/shared/form-dialog';
import { StatusBadge } from '@/components/shared/status-badge';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fieldProps } from '@/components/ui/field-props';
import { FormField } from '@/components/ui/form-field';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/features/auth/session/auth-context';
import { dossierApi, type Payment } from '@/features/members/api/dossier-api';
import type { Member } from '@/features/members/api/members-api';
import { dossierKeys, memberKeys } from '@/features/members/api/queries';
import { PaymentDialog } from '@/features/members/components/payment-dialog';
import { chargeLabel } from '@/features/members/lib/charges';
import { ApiBusinessError } from '@/lib/api-errors';
import { formatAmount, formatDate } from '@/lib/format';
import { showValidationErrors } from '@/lib/form-errors';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';
import { permissionCodes } from '@/lib/reference/permissions';

/*
 * Onglet « Honoraires et paiements » du dossier (F-PAY-01 à 03, 03-APPFLOW §4.3) : échéances
 * (période, montant TTC, payé, reste dû, statut), paiements (date, montant, mode, statut, reçu) ;
 * « Enregistrer un paiement » ; un paiement déclaré par l'adhérent s'examine : confirmer ou rejeter
 * avec motif (F-PAY-03). Les impayés n'entraînent aucune sanction automatique (RG-PAY-05).
 */
const labels = fr.members.finance;

function ReviewDialog({
  member,
  payment,
  onClose,
}: {
  member: Member;
  payment: Payment;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [conflict, setConflict] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<{ reason: string }>({ defaultValues: { reason: '' } });
  const text = labels.review;

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: dossierKeys.all(member.id) });
    await queryClient.invalidateQueries({ queryKey: memberKeys.detail(member.id) });
  }

  const submit = handleSubmit(async ({ reason }) => {
    if (rejecting && reason.trim() === '') {
      setError('reason', { message: fr.members.create.errors.required });

      return;
    }

    setConflict(null);

    try {
      if (rejecting) {
        await dossierApi.rejectPayment(member.id, payment.id, reason.trim());
        toast.success(text.rejected);
      } else {
        await dossierApi.confirmPayment(member.id, payment.id);
        toast.success(text.confirmed);
      }

      await refresh();
      onClose();
    } catch (error) {
      if (error instanceof ApiBusinessError) {
        setConflict(error.message);
      } else if (!showValidationErrors(error, setError, { reason: 'reason' })) {
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
      description={text.description(formatAmount(payment.amount), formatDate(payment.paid_on))}
      submitLabel={rejecting ? text.reject : text.confirm}
      variant={rejecting ? 'danger' : 'primary'}
      submitting={isSubmitting}
      onSubmit={submit}
      conflict={conflict}
    >
      <dl className="grid gap-1 text-table">
        <div>
          <dt className="inline text-muted">{text.method} : </dt>
          <dd className="inline font-semibold">{payment.method_label}</dd>
        </div>
        <div>
          <dt className="inline text-muted">{text.reference} : </dt>
          <dd className="inline font-semibold">{payment.reference ?? fr.table.none}</dd>
        </div>
      </dl>
      {payment.proof ? (
        <a
          className="font-semibold text-primary underline"
          href={payment.proof.url}
          target="_blank"
          rel="noreferrer"
        >
          {text.proof(payment.proof.name)}
        </a>
      ) : null}
      <label className="flex items-center gap-2 text-body">
        <input
          type="checkbox"
          checked={rejecting}
          onChange={(event) => {
            setRejecting(event.target.checked);
          }}
        />
        {text.toReject}
      </label>
      {rejecting ? (
        <FormField id="review-reason" label={text.reason} required error={errors.reason?.message}>
          <Textarea
            {...fieldProps('review-reason', errors.reason?.message)}
            aria-required
            {...register('reason')}
          />
        </FormField>
      ) : null}
    </FormDialog>
  );
}

export function FinanceTab({ member }: { member: Member }) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const charges = useQuery({
    queryKey: dossierKeys.charges(member.id),
    queryFn: () => dossierApi.charges(member.id),
  });
  const payments = useQuery({
    queryKey: dossierKeys.payments(member.id),
    queryFn: () => dossierApi.payments(member.id),
  });
  const [recording, setRecording] = useState(false);
  const [reviewing, setReviewing] = useState<Payment | null>(null);
  const manages =
    can(permissionCodes.cga.payments) && member.status !== 'radiated' && member.status !== 'closed';
  const failed = charges.isError || payments.isError;

  if (charges.isPending || payments.isPending) {
    return <Skeleton className="h-24 w-full" />;
  }

  if (failed) {
    return (
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
    );
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{labels.charges.title}</CardTitle>
          {manages ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setRecording(true);
              }}
            >
              <Plus aria-hidden="true" />
              {labels.record}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {charges.data.length === 0 ? (
            <EmptyState icon={Wallet}>{labels.charges.empty}</EmptyState>
          ) : (
            <ul aria-label={labels.charges.title} className="divide-y divide-border">
              {charges.data.map((charge) => (
                <li
                  key={charge.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-2.5"
                >
                  <span className="grid gap-0.5">
                    <span className="font-semibold">{chargeLabel(charge)}</span>
                    <span className="text-note text-muted">
                      {labels.charges.due(formatDate(charge.due_date))}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-3 text-table">
                    <span>{labels.charges.amount(formatAmount(charge.amount))}</span>
                    <span>{labels.charges.paid(formatAmount(charge.amount_paid))}</span>
                    <span className="font-semibold">
                      {labels.charges.balance(formatAmount(charge.balance))}
                    </span>
                    <StatusBadge domain="charge" status={charge.status} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{labels.payments.title}</CardTitle>
        </CardHeader>
        <CardContent>
          {payments.data.length === 0 ? (
            <EmptyState icon={Wallet}>{labels.payments.empty}</EmptyState>
          ) : (
            <ul aria-label={labels.payments.title} className="divide-y divide-border">
              {payments.data.map((payment) => (
                <li
                  key={payment.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-2.5"
                >
                  <span className="grid gap-0.5">
                    <span className="font-semibold">
                      {formatAmount(payment.amount)} · {formatDate(payment.paid_on)}
                    </span>
                    <span className="text-note text-muted">
                      {[payment.method_label, payment.reference, payment.source_label]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    {payment.rejection_reason !== null ? (
                      <span className="text-note text-danger">
                        {labels.payments.rejected(payment.rejection_reason)}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    {payment.receipt_number !== null ? (
                      <span className="font-mono text-note">{payment.receipt_number}</span>
                    ) : null}
                    <StatusBadge domain="payment" status={payment.status} />
                    {payment.can.confirm || payment.can.reject ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setReviewing(payment);
                        }}
                      >
                        {labels.examine}
                      </Button>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {recording ? (
        <PaymentDialog
          memberId={member.id}
          onClose={() => {
            setRecording(false);
          }}
          onRecorded={async (payment) => {
            toast.success(
              payment.receipt_number === null
                ? labels.recorded
                : labels.recordedWithReceipt(payment.receipt_number),
            );
            await queryClient.invalidateQueries({ queryKey: dossierKeys.all(member.id) });
            await queryClient.invalidateQueries({ queryKey: memberKeys.detail(member.id) });
            setRecording(false);
          }}
        />
      ) : null}
      {reviewing !== null ? (
        <ReviewDialog
          member={member}
          payment={reviewing}
          onClose={() => {
            setReviewing(null);
          }}
        />
      ) : null}
    </div>
  );
}
