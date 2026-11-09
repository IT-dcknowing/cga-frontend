import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { FormDialog } from '@/components/shared/form-dialog';
import { Button } from '@/components/ui/button';
import { FileField } from '@/components/ui/file-field';
import { FormField } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';
import { TextField } from '@/components/ui/text-field';
import { Textarea } from '@/components/ui/textarea';
import {
  duesApi,
  duesKeys,
  PAYMENT_METHODS,
  type DuesPayment,
  type NetworkDue,
  type PaymentInput,
} from '@/features/dues/api/dues-api';
import { ApiBusinessError, ApiValidationError } from '@/lib/api-errors';
import { formatAmount, formatDate } from '@/lib/format';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';

/*
 * Modales de la cotisation (03-APPFLOW §3.2, §4.3) : « Examiner » un paiement déclaré (Confirmer, ou
 * Rejeter avec motif), « Enregistrer un paiement » reçu par le CNCGA, « Relancer » (aperçu du
 * message), « Facturer » (étape 6.9), « Déclarer un paiement » par le centre (preuve obligatoire).
 * Montants, numéros et statuts viennent du serveur, qui refait chaque contrôle.
 */
const labels = fr.dues;

type Errors = Record<string, string | undefined>;

function cgaName(due: NetworkDue): string {
  return due.cga?.name ?? '';
}

async function refresh(queryClient: ReturnType<typeof useQueryClient>) {
  await queryClient.invalidateQueries({ queryKey: duesKeys.all });
}

/** Erreurs 422 sous les champs, 409 en bandeau ; le reste en toast (03-APPFLOW §7). */
function handleError(
  error: unknown,
  setErrors: (errors: Errors) => void,
  setConflict: (message: string | null) => void,
) {
  if (error instanceof ApiValidationError) {
    setErrors(error.fields);
  } else if (error instanceof ApiBusinessError) {
    setConflict(error.message);
  } else {
    toastUnexpectedError(error);
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Champs communs d'un paiement : montant, date, mode, référence. */
function PaymentFields({
  value,
  errors,
  onChange,
}: {
  value: PaymentInput;
  errors: Errors;
  onChange: (value: PaymentInput) => void;
}) {
  const text = labels.payment;

  return (
    <>
      <TextField
        id="dues-amount"
        label={text.amount}
        required
        inputMode="numeric"
        value={value.amount === 0 ? '' : String(value.amount)}
        error={errors.amount}
        onChange={(event) => {
          onChange({ ...value, amount: Number(event.target.value.replace(/\D/g, '')) });
        }}
      />
      <TextField
        id="dues-paid-on"
        label={text.paidOn}
        type="date"
        required
        max={today()}
        value={value.paid_on}
        error={errors.paid_on}
        onChange={(event) => {
          onChange({ ...value, paid_on: event.target.value });
        }}
      />
      <FormField id="dues-method" label={text.method} required error={errors.method}>
        <Select
          id="dues-method"
          value={value.method}
          onChange={(event) => {
            onChange({ ...value, method: event.target.value });
          }}
        >
          {PAYMENT_METHODS.map((method) => (
            <option key={method} value={method}>
              {text.methods[method]}
            </option>
          ))}
        </Select>
      </FormField>
      <TextField
        id="dues-reference"
        label={text.reference}
        value={value.reference}
        error={errors.reference}
        onChange={(event) => {
          onChange({ ...value, reference: event.target.value });
        }}
      />
    </>
  );
}

function emptyPayment(): PaymentInput {
  return { amount: 0, paid_on: today(), method: 'transfer', reference: '' };
}

/** Contrôles de confort ; le serveur refait tout (montant au plus le reste dû). */
function checkPayment(value: PaymentInput): Errors {
  return {
    amount: value.amount > 0 ? undefined : labels.payment.amountInvalid,
    paid_on: value.paid_on === '' ? labels.payment.required : undefined,
  };
}

function hasErrors(errors: Errors): boolean {
  return Object.values(errors).some((error) => error !== undefined);
}

export function RecordPaymentDialog({ due, onClose }: { due: NetworkDue; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(emptyPayment);
  const [errors, setErrors] = useState<Errors>({});
  const [conflict, setConflict] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const checked = checkPayment(value);

    setErrors(checked);
    setConflict(null);
    if (hasErrors(checked)) {
      return;
    }

    setSubmitting(true);
    try {
      const updated = await duesApi.record(due.id, value);
      const receipt = updated.payments?.find((payment) => payment.receipt_number !== null);

      await refresh(queryClient);
      toast.success(labels.record.done(receipt?.receipt_number ?? ''));
      onClose();
    } catch (error) {
      handleError(error, setErrors, setConflict);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title={labels.record.title(cgaName(due))}
      submitLabel={labels.record.submit}
      submitting={submitting}
      conflict={conflict}
      onSubmit={(event) => void submit(event)}
    >
      <PaymentFields value={value} errors={errors} onChange={setValue} />
    </FormDialog>
  );
}

export function DeclarePaymentDialog({ due, onClose }: { due: NetworkDue; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(emptyPayment);
  const [proof, setProof] = useState<File | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [conflict, setConflict] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const checked = {
      ...checkPayment(value),
      proof: proof === null ? labels.payment.required : undefined,
    };

    setErrors(checked);
    setConflict(null);
    if (hasErrors(checked) || proof === null) {
      return;
    }

    setSubmitting(true);
    try {
      await duesApi.declare(due.id, { ...value, proof });
      await refresh(queryClient);
      toast.success(labels.declare.done);
      onClose();
    } catch (error) {
      handleError(error, setErrors, setConflict);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title={labels.declare.title(String(due.year))}
      submitLabel={labels.declare.submit}
      submitting={submitting}
      conflict={conflict}
      onSubmit={(event) => void submit(event)}
    >
      <PaymentFields value={value} errors={errors} onChange={setValue} />
      <FileField
        id="dues-proof"
        label={labels.payment.proof}
        hint={labels.payment.proofHint}
        required
        error={errors.proof}
        onChange={setProof}
      />
    </FormDialog>
  );
}

/** Paiement déclaré : montant, date, mode, référence, preuve consultable ; Confirmer ou Rejeter. */
export function ReviewPaymentDialog({ due, onClose }: { due: NetworkDue; onClose: () => void }) {
  const queryClient = useQueryClient();
  const pending = due.payments?.find((payment) => payment.status === 'pending_confirmation');
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [conflict, setConflict] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function decide(payment: DuesPayment) {
    if (rejecting && reason.trim() === '') {
      setErrors({ reason: labels.payment.required });

      return;
    }

    setSubmitting(true);
    setConflict(null);
    try {
      const updated = await duesApi.review(
        payment.id,
        rejecting ? { confirm: false, reason: reason.trim() } : { confirm: true },
      );
      const reviewed = updated.payments?.find((item) => item.id === payment.id);

      await refresh(queryClient);
      toast.success(
        rejecting
          ? labels.review.rejectedToast
          : labels.review.confirmed(reviewed?.receipt_number ?? ''),
      );
      onClose();
    } catch (error) {
      handleError(error, setErrors, setConflict);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title={labels.review.title(cgaName(due))}
      submitLabel={rejecting ? labels.review.reject : labels.review.confirm}
      variant={rejecting ? 'danger' : 'primary'}
      submitting={submitting}
      conflict={conflict}
      onSubmit={(event) => {
        event.preventDefault();
        if (pending !== undefined) {
          void decide(pending);
        }
      }}
    >
      {pending === undefined ? (
        <p>{labels.review.nothing}</p>
      ) : (
        <>
          <p className="text-body">
            {labels.payment.line(
              formatAmount(pending.amount),
              formatDate(pending.paid_on),
              labels.payment.methods[pending.method] ?? pending.method_label,
            )}
            {pending.reference === null ? null : ` · ${pending.reference}`}
          </p>
          {pending.proof_url === null ? null : (
            <a
              className="text-primary underline"
              href={pending.proof_url}
              target="_blank"
              rel="noreferrer"
            >
              {labels.actions.proof}
            </a>
          )}
          {rejecting ? (
            <FormField
              id="dues-reject-reason"
              label={labels.review.reason}
              required
              error={errors.reason}
            >
              <Textarea
                id="dues-reject-reason"
                rows={3}
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                }}
              />
            </FormField>
          ) : (
            <Button
              type="button"
              variant="link"
              className="justify-self-start text-danger"
              onClick={() => {
                setRejecting(true);
              }}
            >
              {labels.review.reject}
            </Button>
          )}
        </>
      )}
    </FormDialog>
  );
}

export function RemindDialog({ due, onClose }: { due: NetworkDue; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [conflict, setConflict] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await duesApi.remind(due.id);
      await refresh(queryClient);
      toast.success(labels.remind.sent);
      onClose();
    } catch (error) {
      handleError(error, () => undefined, setConflict);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title={labels.remind.title(cgaName(due))}
      submitLabel={labels.remind.send}
      submitting={submitting}
      conflict={conflict}
      onSubmit={(event) => void submit(event)}
    >
      <p className="text-body">
        {labels.remind.preview(
          String(due.year),
          formatAmount(due.balance),
          formatDate(due.deadline),
        )}
      </p>
      <p className="text-note text-muted">{labels.remind.noSanction}</p>
    </FormDialog>
  );
}

export function InvoiceDuesDialog({ due, onClose }: { due: NetworkDue; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [conflict, setConflict] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const updated = await duesApi.invoice(due.id);

      await refresh(queryClient);
      toast.success(labels.invoice.done(updated.invoice?.number ?? ''));
      onClose();
    } catch (error) {
      handleError(error, () => undefined, setConflict);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title={labels.invoice.title(cgaName(due))}
      effects={labels.invoice.effects(formatAmount(due.amount_due))}
      submitLabel={labels.invoice.submit}
      submitting={submitting}
      conflict={conflict}
      onSubmit={(event) => void submit(event)}
    >
      {null}
    </ConfirmDialog>
  );
}
