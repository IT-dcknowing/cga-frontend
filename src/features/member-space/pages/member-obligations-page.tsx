import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { FormDialog } from '@/components/shared/form-dialog';
import { StatusBadge } from '@/components/shared/status-badge';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { FileField } from '@/components/ui/file-field';
import { Skeleton } from '@/components/ui/skeleton';
import { TextField } from '@/components/ui/text-field';
import {
  memberObligationKeys,
  memberObligationsApi,
} from '@/features/obligations/api/member-obligations-api';
import {
  OBLIGATION_CATEGORIES,
  type ObligationInstance,
} from '@/features/obligations/api/obligations-api';
import { ApiBusinessError, ApiValidationError } from '@/lib/api-errors';
import { formatAmount, formatDate } from '@/lib/format';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';
import { cn } from '@/lib/utils';

/*
 * `/adherent/obligations` (F-OBL-05, 03-APPFLOW §5.2, étape 4.8) : mobile d'abord, quatre blocs
 * repliables avec leur « Total dû » ; sur une ligne à faire ou à payer, « Signaler comme fait /
 * payé » (montant, date, preuve facultative pour un paiement) → « Déclaré — en attente de
 * confirmation par votre CGA » (RG-OBL-09). Le CGA confirme ou corrige : le serveur fait foi.
 */
const labels = fr.obligations.member;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function DeclareDialog({
  instance,
  onClose,
}: {
  instance: ObligationInstance;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const isPayment = instance.kind === 'payment';
  const [amount, setAmount] = useState(
    instance.balance === null || instance.balance === 0 ? '' : String(instance.balance),
  );
  const [paidOn, setPaidOn] = useState(today);
  const [proof, setProof] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [conflict, setConflict] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const required = fr.obligations.dialogs.required;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const checked = isPayment
      ? {
          amount:
            amount === '' || Number(amount) < 1 ? fr.obligations.dialogs.invalidAmount : undefined,
          paid_on: paidOn === '' ? required : undefined,
        }
      : {};

    setErrors(checked);
    setConflict(null);
    if (Object.values(checked).some((error) => error !== undefined)) {
      return;
    }

    setSubmitting(true);
    try {
      await memberObligationsApi.declare(
        instance,
        isPayment ? { amount: Number(amount), paid_on: paidOn, proof } : null,
      );
      await queryClient.invalidateQueries({ queryKey: memberObligationKeys.all });
      toast.success(labels.declared);
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

  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title={isPayment ? labels.payTitle(instance.label) : labels.doneTitle(instance.label)}
      description={labels.dialogIntro}
      submitLabel={labels.submit}
      submitting={submitting}
      conflict={conflict}
      onSubmit={(event) => void submit(event)}
    >
      {isPayment ? (
        <>
          <TextField
            id="member-declare-amount"
            label={fr.obligations.dialogs.paidAmount}
            required
            inputMode="numeric"
            value={amount}
            error={errors.amount}
            onChange={(event) => {
              setAmount(event.target.value.replace(/\D/g, ''));
            }}
          />
          <TextField
            id="member-declare-date"
            label={fr.obligations.dialogs.paidOn}
            type="date"
            required
            max={today()}
            value={paidOn}
            error={errors.paid_on}
            onChange={(event) => {
              setPaidOn(event.target.value);
            }}
          />
          <FileField
            id="member-declare-proof"
            label={fr.obligations.dialogs.proof}
            hint={labels.proofHint}
            error={errors.proof}
            onChange={setProof}
          />
        </>
      ) : (
        <p className="text-body">{labels.doneConfirm}</p>
      )}
    </FormDialog>
  );
}

function Line({ instance, onDeclare }: { instance: ObligationInstance; onDeclare: () => void }) {
  const pending = instance.member_declared_status !== null;

  return (
    <li className={cn('grid gap-1.5 px-1 py-3', pending && 'rounded-card bg-accent-soft px-3')}>
      <span className="flex items-start justify-between gap-2">
        <span className="font-semibold">{instance.label}</span>
        <StatusBadge domain="obligation" status={instance.status} />
      </span>
      <span className="text-note text-muted">
        {fr.obligations.tab.due(formatDate(instance.due_date))}
        {instance.overdue ? (
          <span className="font-semibold text-danger"> · {fr.obligations.tab.late}</span>
        ) : null}
      </span>
      {instance.kind === 'payment' ? (
        <span className="text-table">
          {instance.amount_due === null
            ? labels.amountPending
            : labels.amounts(
                formatAmount(instance.amount_due),
                formatAmount(instance.balance ?? 0),
              )}
        </span>
      ) : null}
      {pending ? (
        <span className="text-note font-semibold text-accent-text">{labels.pending}</span>
      ) : null}
      {instance.member_declaration_rejection === null ? null : (
        <span className="text-note text-danger">
          {labels.rejected(instance.member_declaration_rejection)}
        </span>
      )}
      {instance.can.declare === true ? (
        <Button size="sm" variant="secondary" className="justify-self-start" onClick={onDeclare}>
          {instance.kind === 'payment' ? labels.declarePaid : labels.declareDone}
        </Button>
      ) : null}
    </li>
  );
}

export function MemberObligationsPage() {
  const [declaring, setDeclaring] = useState<ObligationInstance | null>(null);
  const query = useQuery({
    queryKey: memberObligationKeys.all,
    queryFn: () => memberObligationsApi.list(),
  });

  return (
    <div className="grid gap-4">
      <h1 className="text-page-title-mobile font-extrabold text-ink md:text-page-title">
        {labels.title}
      </h1>
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
        OBLIGATION_CATEGORIES.map((category) => {
          const instances = query.data.instances.filter((item) => item.category === category);
          const title = fr.obligations.categories[category];

          return (
            <details
              key={category}
              open
              className="group rounded-card border border-border bg-card px-4 py-3 shadow-card"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
                <span className="text-card-title font-bold">{title}</span>
                <span className="flex items-center gap-2 text-table font-semibold">
                  {fr.obligations.tab.summary(formatAmount(query.data.summary[category].total_due))}
                  <ChevronDown
                    aria-hidden="true"
                    className="size-4 transition-transform group-open:rotate-180"
                  />
                </span>
              </summary>
              {instances.length === 0 ? (
                <p className="py-3 text-note text-muted">{labels.empty}</p>
              ) : (
                <ul aria-label={title} className="divide-y divide-border">
                  {instances.map((instance) => (
                    <Line
                      key={instance.id}
                      instance={instance}
                      onDeclare={() => {
                        setDeclaring(instance);
                      }}
                    />
                  ))}
                </ul>
              )}
            </details>
          );
        })
      )}
      {declaring === null ? null : (
        <DeclareDialog
          instance={declaring}
          onClose={() => {
            setDeclaring(null);
          }}
        />
      )}
    </div>
  );
}
