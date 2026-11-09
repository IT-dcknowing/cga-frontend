import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Plus, X } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { FormDialog } from '@/components/shared/form-dialog';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { FileField } from '@/components/ui/file-field';
import { FormField } from '@/components/ui/form-field';
import { Radio, RadioGroupField, RadioOption } from '@/components/ui/radio';
import { Select } from '@/components/ui/select';
import { TextField } from '@/components/ui/text-field';
import { Textarea } from '@/components/ui/textarea';
import {
  obligationKeys,
  obligationsApi,
  type MemberObligation,
  type ObligationInstance,
} from '@/features/obligations/api/obligations-api';
import { CatalogDialog } from '@/features/obligations/components/proposed-obligations';
import { ApiBusinessError, ApiValidationError } from '@/lib/api-errors';
import { formatAmount, formatDate, formatTimestampDate } from '@/lib/format';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';

/*
 * Modales de l'onglet Obligations du dossier (03-APPFLOW §4.3, étape 4.6, F-OBL-03, 04, RG-OBL-07,
 * 09) : « Marquer faite », « Saisir le montant dû », « Enregistrer un paiement » (preuve
 * facultative), statut d'une diligence, déclaration de l'adhérent (confirmer, corriger, rejeter),
 * « + Autre administration », « Gérer les obligations ». Statuts et restes dus viennent du serveur,
 * qui refait chaque contrôle (montant au plus le reste dû, jamais sous le déjà payé).
 */
const labels = fr.obligations.dialogs;

type Errors = Record<string, string | undefined>;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function digits(value: string): string {
  return value.replace(/\D/g, '');
}

/** Montant saisi : `null` s'il est vide. */
function amountOf(value: string): number | null {
  return value === '' ? null : Number(value);
}

function hasErrors(errors: Errors): boolean {
  return Object.values(errors).some((error) => error !== undefined);
}

/** Envoi d'une modale : 422 sous les champs, 409 en bandeau, le reste en toast (03-APPFLOW §7). */
function useSubmission(memberId: string, onClose: () => void) {
  const queryClient = useQueryClient();
  const [errors, setErrors] = useState<Errors>({});
  const [conflict, setConflict] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function run(call: () => Promise<unknown>, done: string) {
    setConflict(null);
    setSubmitting(true);
    try {
      await call();
      await queryClient.invalidateQueries({ queryKey: obligationKeys.instances(memberId) });
      await queryClient.invalidateQueries({ queryKey: obligationKeys.ofMember(memberId) });
      toast.success(done);
      onClose();
    } catch (error) {
      if (error instanceof ApiValidationError) {
        setErrors(error.fields);
      } else if (error instanceof ApiBusinessError) {
        setConflict(error.message);
      } else {
        toastUnexpectedError(error);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return { errors, setErrors, conflict, submitting, run };
}

type InstanceDialogProps = { memberId: string; instance: ObligationInstance; onClose: () => void };

function Shell({
  title,
  description,
  submitLabel,
  variant,
  state,
  onSubmit,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  submitLabel: string;
  variant?: 'primary' | 'danger';
  state: ReturnType<typeof useSubmission>;
  onSubmit: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title={title}
      description={description}
      submitLabel={submitLabel}
      variant={variant}
      submitting={state.submitting}
      conflict={state.conflict}
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {children}
    </FormDialog>
  );
}

function AmountField({
  id,
  label,
  value,
  error,
  required = false,
  hint,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  error: string | undefined;
  required?: boolean;
  hint?: string;
  onChange: (value: string) => void;
}) {
  return (
    <TextField
      id={id}
      label={label}
      required={required}
      hint={hint}
      inputMode="numeric"
      value={value}
      error={error}
      onChange={(event) => {
        onChange(digits(event.target.value));
      }}
    />
  );
}

export function MarkDoneDialog({ memberId, instance, onClose }: InstanceDialogProps) {
  const state = useSubmission(memberId, onClose);
  const [doneOn, setDoneOn] = useState(today);
  const [amountDue, setAmountDue] = useState('');

  return (
    <Shell
      title={labels.markDone.title(instance.label)}
      submitLabel={labels.markDone.submit}
      state={state}
      onClose={onClose}
      onSubmit={() => {
        const checked = { done_on: doneOn === '' ? labels.required : undefined };

        state.setErrors(checked);
        if (!hasErrors(checked)) {
          void state.run(
            () =>
              obligationsApi.markDone(memberId, instance.id, {
                done_on: doneOn,
                amount_due: amountOf(amountDue),
                amount_gross: null,
              }),
            labels.markDone.done,
          );
        }
      }}
    >
      <TextField
        id="obligation-done-on"
        label={labels.date}
        type="date"
        required
        max={today()}
        value={doneOn}
        error={state.errors.done_on}
        onChange={(event) => {
          setDoneOn(event.target.value);
        }}
      />
      <AmountField
        id="obligation-done-amount"
        label={labels.amountToPay}
        hint={labels.amountToPayHint}
        value={amountDue}
        error={state.errors.amount_due}
        onChange={setAmountDue}
      />
    </Shell>
  );
}

export function AmountDialog({ memberId, instance, onClose }: InstanceDialogProps) {
  const state = useSubmission(memberId, onClose);
  const [due, setDue] = useState(instance.amount_due === null ? '' : String(instance.amount_due));
  const [gross, setGross] = useState(
    instance.amount_gross === null ? '' : String(instance.amount_gross),
  );

  return (
    <Shell
      title={labels.amount.title(instance.label)}
      submitLabel={labels.amount.submit}
      state={state}
      onClose={onClose}
      onSubmit={() => {
        const checked = { amount_due: due === '' ? labels.invalidAmount : undefined };

        state.setErrors(checked);
        if (!hasErrors(checked)) {
          void state.run(
            () =>
              obligationsApi.setAmount(memberId, instance.id, {
                amount_due: Number(due),
                amount_gross: amountOf(gross),
              }),
            labels.amount.done,
          );
        }
      }}
    >
      <AmountField
        id="obligation-amount-due"
        label={labels.amountDue}
        required
        value={due}
        error={state.errors.amount_due}
        onChange={setDue}
      />
      <AmountField
        id="obligation-amount-gross"
        label={labels.amountGross}
        hint={labels.amountGrossHint}
        value={gross}
        error={state.errors.amount_gross}
        onChange={setGross}
      />
    </Shell>
  );
}

export function ObligationPaymentDialog({ memberId, instance, onClose }: InstanceDialogProps) {
  const state = useSubmission(memberId, onClose);
  const [amount, setAmount] = useState(instance.balance === null ? '' : String(instance.balance));
  const [paidOn, setPaidOn] = useState(today);
  const [proof, setProof] = useState<File | null>(null);

  return (
    <Shell
      title={labels.payment.title(instance.label)}
      description={labels.payment.description(formatAmount(instance.balance ?? 0))}
      submitLabel={labels.payment.submit}
      state={state}
      onClose={onClose}
      onSubmit={() => {
        const checked = {
          amount: amount === '' || Number(amount) < 1 ? labels.invalidAmount : undefined,
          paid_on: paidOn === '' ? labels.required : undefined,
        };

        state.setErrors(checked);
        if (!hasErrors(checked)) {
          void state.run(
            () =>
              obligationsApi.recordPayment(memberId, instance.id, {
                amount: Number(amount),
                paid_on: paidOn,
                proof,
              }),
            labels.payment.done,
          );
        }
      }}
    >
      <AmountField
        id="obligation-payment-amount"
        label={labels.paidAmount}
        required
        value={amount}
        error={state.errors.amount}
        onChange={setAmount}
      />
      <TextField
        id="obligation-payment-date"
        label={labels.paidOn}
        type="date"
        required
        max={today()}
        value={paidOn}
        error={state.errors.paid_on}
        onChange={(event) => {
          setPaidOn(event.target.value);
        }}
      />
      <FileField
        id="obligation-payment-proof"
        label={labels.proof}
        error={state.errors.proof}
        onChange={setProof}
      />
    </Shell>
  );
}

const DILIGENCE_STATUSES = ['not_established', 'in_progress', 'established'] as const;

export function DiligenceDialog({ memberId, instance, onClose }: InstanceDialogProps) {
  const state = useSubmission(memberId, onClose);
  const [status, setStatus] = useState<string>(
    DILIGENCE_STATUSES.includes(instance.status as never) ? instance.status : 'not_established',
  );

  return (
    <Shell
      title={labels.diligence.title(instance.label)}
      submitLabel={labels.diligence.submit}
      state={state}
      onClose={onClose}
      onSubmit={() => {
        void state.run(
          () => obligationsApi.setDiligence(memberId, instance.id, status),
          labels.diligence.done,
        );
      }}
    >
      <FormField
        id="obligation-diligence"
        label={labels.status}
        required
        error={state.errors.status}
      >
        <Select
          id="obligation-diligence"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
          }}
        >
          {DILIGENCE_STATUSES.map((code) => (
            <option key={code} value={code}>
              {fr.status.obligation[code]}
            </option>
          ))}
        </Select>
      </FormField>
    </Shell>
  );
}

type Decision = 'confirm' | 'correct' | 'reject';

/** Déclaration de l'adhérent (RG-OBL-09) : confirmée telle quelle, corrigée, ou rejetée avec motif. */
export function DeclarationReviewDialog({ memberId, instance, onClose }: InstanceDialogProps) {
  const state = useSubmission(memberId, onClose);
  const text = labels.review;
  const pending = instance.payments.find((payment) => payment.status === 'pending_confirmation');
  const isPayment = instance.kind === 'payment';
  const [decision, setDecision] = useState<Decision>('confirm');
  const [amount, setAmount] = useState(pending === undefined ? '' : String(pending.amount));
  const [paidOn, setPaidOn] = useState(pending?.paid_on ?? today());
  const [amountDue, setAmountDue] = useState(
    instance.amount_due === null ? '' : String(instance.amount_due),
  );
  const [doneOn, setDoneOn] = useState(
    instance.member_declared_at === null ? today() : instance.member_declared_at.slice(0, 10),
  );
  const [reason, setReason] = useState('');
  const declaredOn =
    instance.member_declared_at === null ? '' : formatTimestampDate(instance.member_declared_at);

  function submit() {
    if (decision === 'reject') {
      const checked = { reason: reason.trim() === '' ? labels.required : undefined };

      state.setErrors(checked);
      if (!hasErrors(checked)) {
        void state.run(
          () => obligationsApi.rejectDeclaration(memberId, instance.id, reason.trim()),
          text.rejected,
        );
      }

      return;
    }

    if (decision === 'confirm') {
      void state.run(
        () => obligationsApi.confirmDeclaration(memberId, instance.id, {}),
        text.confirmed,
      );

      return;
    }

    const checked: Errors = isPayment
      ? {
          amount: amount === '' || Number(amount) < 1 ? labels.invalidAmount : undefined,
          paid_on: paidOn === '' ? labels.required : undefined,
        }
      : { done_on: doneOn === '' ? labels.required : undefined };

    state.setErrors(checked);
    if (!hasErrors(checked)) {
      void state.run(
        () =>
          obligationsApi.confirmDeclaration(
            memberId,
            instance.id,
            isPayment
              ? {
                  amount: Number(amount),
                  paid_on: paidOn,
                  ...(amountDue === '' ? {} : { amount_due: Number(amountDue) }),
                }
              : { done_on: doneOn },
          ),
        text.confirmed,
      );
    }
  }

  return (
    <Shell
      title={text.title(instance.label)}
      submitLabel={decision === 'reject' ? text.submitReject : text.submitConfirm}
      variant={decision === 'reject' ? 'danger' : 'primary'}
      state={state}
      onClose={onClose}
      onSubmit={submit}
    >
      <p className="text-body">
        {isPayment && pending !== undefined
          ? text.declaredPaid(formatAmount(pending.amount), formatDate(pending.paid_on))
          : text.declaredDone(declaredOn)}
      </p>
      {pending?.proof ? (
        <a
          className="font-semibold text-primary underline"
          href={pending.proof.url}
          target="_blank"
          rel="noreferrer"
        >
          {text.proof(pending.proof.name)}
        </a>
      ) : null}
      <RadioGroupField id="declaration-decision" legend={text.decision} required>
        <div className="grid gap-2">
          {(['confirm', 'correct', 'reject'] as const).map((choice) => (
            <RadioOption key={choice} label={text[choice]}>
              <Radio
                name="declaration-decision"
                value={choice}
                checked={decision === choice}
                onChange={() => {
                  setDecision(choice);
                  state.setErrors({});
                }}
              />
            </RadioOption>
          ))}
        </div>
      </RadioGroupField>
      {decision === 'correct' && isPayment ? (
        <>
          <AmountField
            id="declaration-amount"
            label={labels.paidAmount}
            required
            value={amount}
            error={state.errors.amount}
            onChange={setAmount}
          />
          <TextField
            id="declaration-paid-on"
            label={labels.paidOn}
            type="date"
            required
            max={today()}
            value={paidOn}
            error={state.errors.paid_on}
            onChange={(event) => {
              setPaidOn(event.target.value);
            }}
          />
          <AmountField
            id="declaration-amount-due"
            label={labels.amountDue}
            value={amountDue}
            error={state.errors.amount_due}
            onChange={setAmountDue}
          />
        </>
      ) : null}
      {decision === 'correct' && !isPayment ? (
        <TextField
          id="declaration-done-on"
          label={labels.date}
          type="date"
          required
          max={today()}
          value={doneOn}
          error={state.errors.done_on}
          onChange={(event) => {
            setDoneOn(event.target.value);
          }}
        />
      ) : null}
      {decision === 'reject' ? (
        <FormField id="declaration-reason" label={text.reason} required error={state.errors.reason}>
          <Textarea
            id="declaration-reason"
            aria-required
            aria-invalid={state.errors.reason !== undefined}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
            }}
          />
        </FormField>
      ) : null}
    </Shell>
  );
}

export function OtherAuthorityDialog({
  memberId,
  onClose,
}: {
  memberId: string;
  onClose: () => void;
}) {
  const state = useSubmission(memberId, onClose);
  const text = labels.other;
  const [authority, setAuthority] = useState('');
  const [label, setLabel] = useState('');
  const [amountDue, setAmountDue] = useState('');
  const [dueDate, setDueDate] = useState('');

  return (
    <Shell
      title={text.title}
      description={text.description}
      submitLabel={text.submit}
      state={state}
      onClose={onClose}
      onSubmit={() => {
        const checked = {
          authority: authority.trim() === '' ? labels.required : undefined,
          amount_due: amountDue === '' ? labels.invalidAmount : undefined,
          due_date: dueDate === '' ? labels.required : undefined,
        };

        state.setErrors(checked);
        if (!hasErrors(checked)) {
          void state.run(
            () =>
              obligationsApi.addOtherAuthority(memberId, {
                authority: authority.trim(),
                label,
                amount_due: Number(amountDue),
                due_date: dueDate,
              }),
            text.done,
          );
        }
      }}
    >
      <TextField
        id="other-authority"
        label={text.authority}
        required
        value={authority}
        error={state.errors.authority}
        onChange={(event) => {
          setAuthority(event.target.value);
        }}
      />
      <TextField
        id="other-label"
        label={text.label}
        value={label}
        error={state.errors.label}
        onChange={(event) => {
          setLabel(event.target.value);
        }}
      />
      <AmountField
        id="other-amount"
        label={labels.amountDue}
        required
        value={amountDue}
        error={state.errors.amount_due}
        onChange={setAmountDue}
      />
      <TextField
        id="other-due-date"
        label={text.dueDate}
        type="date"
        required
        value={dueDate}
        error={state.errors.due_date}
        onChange={(event) => {
          setDueDate(event.target.value);
        }}
      />
    </Shell>
  );
}

/** « Gérer les obligations » : propositions à confirmer ou retirer, obligations à retirer ou ajouter. */
export function ManageObligationsDialog({
  memberId,
  onClose,
}: {
  memberId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const text = labels.manage;
  const assigned = useQuery({
    queryKey: obligationKeys.ofMember(memberId),
    queryFn: () => obligationsApi.ofMember(memberId),
  });
  const [conflict, setConflict] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const open = (assigned.data ?? []).filter((item) => item.status !== 'removed');

  async function act(call: () => Promise<unknown>, done: string) {
    setConflict(null);
    setBusy(true);
    try {
      await call();
      await queryClient.invalidateQueries({ queryKey: obligationKeys.ofMember(memberId) });
      await queryClient.invalidateQueries({ queryKey: obligationKeys.instances(memberId) });
      toast.success(done);
    } catch (error) {
      if (error instanceof ApiBusinessError) {
        setConflict(error.message);
      } else {
        toastUnexpectedError(error);
      }
    } finally {
      setBusy(false);
    }
  }

  function line(item: MemberObligation) {
    return (
      <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
        <span className="grid">
          <span className="text-body">
            {item.type.label}
            {item.status === 'suggested' ? ` (${text.suggested})` : ''}
          </span>
          <span className="text-note text-muted">
            {fr.obligations.proposed.line(
              fr.obligations.categories[item.type.category] ?? item.type.category_label,
              item.type.periodicity_label,
            )}
          </span>
        </span>
        <span className="flex gap-2">
          {item.can.confirm ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              aria-label={text.confirm(item.type.label)}
              onClick={() =>
                void act(
                  () => obligationsApi.review(memberId, { confirm: [item.id], remove: [] }),
                  text.confirmed,
                )
              }
            >
              <Check aria-hidden="true" />
            </Button>
          ) : null}
          {item.can.remove ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              aria-label={text.remove(item.type.label)}
              onClick={() =>
                void act(
                  () => obligationsApi.review(memberId, { confirm: [], remove: [item.id] }),
                  text.removed,
                )
              }
            >
              <X aria-hidden="true" />
            </Button>
          ) : null}
        </span>
      </li>
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !busy) {
          onClose();
        }
      }}
    >
      <DialogContent title={text.title} description={text.description}>
        <DialogBody>
          {conflict !== null ? (
            <Banner tone="danger" role="alert">
              {conflict}
            </Banner>
          ) : null}
          {assigned.isPending ? (
            <p className="text-note text-muted" role="status">
              {fr.common.loading}
            </p>
          ) : assigned.isError ? (
            <Banner tone="danger" role="alert">
              {fr.obligations.tab.loadError}
            </Banner>
          ) : open.length === 0 ? (
            <p className="text-note text-muted">{text.empty}</p>
          ) : (
            <ul aria-label={text.title} className="divide-y divide-border">
              {open.map(line)}
            </ul>
          )}
          <div>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setSearching(true);
              }}
            >
              <Plus aria-hidden="true" />
              {fr.obligations.proposed.add}
            </Button>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            {fr.common.close}
          </Button>
        </DialogFooter>
      </DialogContent>
      {searching ? (
        <CatalogDialog
          excluded={new Set(open.map((item) => item.type.id))}
          onClose={() => {
            setSearching(false);
          }}
          onChoose={(type) => {
            setSearching(false);
            void act(() => obligationsApi.add(memberId, type.id), text.added);
          }}
        />
      ) : null}
    </Dialog>
  );
}
