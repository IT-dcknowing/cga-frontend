import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Pencil, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/shared/empty-state';
import { FormDialog } from '@/components/shared/form-dialog';
import { StatusBadge } from '@/components/shared/status-badge';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { TextField } from '@/components/ui/text-field';
import { Textarea } from '@/components/ui/textarea';
import {
  CENTER_OBLIGATION_KINDS,
  CENTER_OBLIGATION_STATUSES,
  planningApi,
  planningKeys,
  type CenterObligation,
  type CenterObligationInput,
} from '@/features/obligations/api/planning-api';
import { ApiBusinessError, ApiValidationError } from '@/lib/api-errors';
import { formatAmount, formatDate, formatTimestampDate } from '@/lib/format';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';

/*
 * Onglet « Obligations du centre » de `/cga/gestion-interne` (F-OBL-07, 03-APPFLOW §4.3, étape
 * 4.7) : liste simple des obligations du CGA lui-même (impôts, CNPS, CMU, renouvellement d'agrément,
 * SMT…) avec échéance, montant, statut et dernier rappel ; « + Ajouter » ; statut modifiable.
 * Réservé au droit internal.manage (gérant, expert-comptable), vérifié par le serveur.
 */
const labels = fr.obligations.center;
const form = labels.form;

type Errors = Record<string, string | undefined>;

function inputOf(obligation: CenterObligation | null): CenterObligationInput {
  return {
    label: obligation?.label ?? '',
    kind: obligation?.kind ?? 'tax',
    due_date: obligation?.due_date ?? '',
    amount: obligation?.amount ?? null,
    status: obligation?.status ?? 'todo',
    notes: obligation?.notes ?? '',
  };
}

function CenterObligationDialog({
  obligation,
  onClose,
}: {
  obligation: CenterObligation | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(() => inputOf(obligation));
  const [errors, setErrors] = useState<Errors>({});
  const [conflict, setConflict] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const required = fr.obligations.dialogs.required;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const checked = {
      label: value.label.trim() === '' ? required : undefined,
      due_date: value.due_date === '' ? required : undefined,
    };

    setErrors(checked);
    setConflict(null);
    if (checked.label !== undefined || checked.due_date !== undefined) {
      return;
    }

    setSubmitting(true);
    try {
      await planningApi.saveCenter({ ...value, label: value.label.trim() }, obligation?.id);
      await queryClient.invalidateQueries({ queryKey: planningKeys.center });
      toast.success(obligation === null ? form.created : form.updated);
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
      title={obligation === null ? form.createTitle : form.editTitle(obligation.label)}
      submitLabel={form.submit}
      submitting={submitting}
      conflict={conflict}
      onSubmit={(event) => void submit(event)}
    >
      <TextField
        id="center-obligation-label"
        label={form.label}
        required
        value={value.label}
        error={errors.label}
        onChange={(event) => {
          setValue({ ...value, label: event.target.value });
        }}
      />
      <FormField id="center-obligation-kind" label={form.kind} required error={errors.kind}>
        <Select
          id="center-obligation-kind"
          value={value.kind}
          onChange={(event) => {
            setValue({ ...value, kind: event.target.value });
          }}
        >
          {CENTER_OBLIGATION_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {labels.kinds[kind]}
            </option>
          ))}
        </Select>
      </FormField>
      <TextField
        id="center-obligation-due"
        label={form.dueDate}
        type="date"
        required
        value={value.due_date}
        error={errors.due_date}
        onChange={(event) => {
          setValue({ ...value, due_date: event.target.value });
        }}
      />
      <TextField
        id="center-obligation-amount"
        label={form.amount}
        inputMode="numeric"
        value={value.amount === null ? '' : String(value.amount)}
        error={errors.amount}
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, '');

          setValue({ ...value, amount: digits === '' ? null : Number(digits) });
        }}
      />
      <FormField id="center-obligation-status" label={form.status} required error={errors.status}>
        <Select
          id="center-obligation-status"
          value={value.status}
          onChange={(event) => {
            setValue({ ...value, status: event.target.value });
          }}
        >
          {CENTER_OBLIGATION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {labels.statuses[status]}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField id="center-obligation-notes" label={form.notes} error={errors.notes}>
        <Textarea
          id="center-obligation-notes"
          value={value.notes}
          onChange={(event) => {
            setValue({ ...value, notes: event.target.value });
          }}
        />
      </FormField>
    </FormDialog>
  );
}

export function CenterObligationsTab() {
  const [editing, setEditing] = useState<CenterObligation | 'new' | null>(null);
  const query = useQuery({ queryKey: planningKeys.center, queryFn: () => planningApi.center() });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{labels.caption}</CardTitle>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setEditing('new');
          }}
        >
          <Plus aria-hidden="true" />
          {labels.add}
        </Button>
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : query.isError ? (
          <Banner tone="danger" role="alert">
            {labels.loadError}
          </Banner>
        ) : query.data.length === 0 ? (
          <EmptyState icon={ClipboardList}>{labels.empty}</EmptyState>
        ) : (
          <ul aria-label={labels.caption} className="divide-y divide-border">
            {query.data.map((obligation) => (
              <li
                key={obligation.id}
                className="flex flex-wrap items-center justify-between gap-3 py-2.5"
              >
                <span className="grid gap-0.5">
                  <span className="font-semibold">{obligation.label}</span>
                  <span className="text-note text-muted">
                    {[
                      labels.kinds[obligation.kind] ?? obligation.kind_label,
                      fr.obligations.tab.due(formatDate(obligation.due_date)),
                      obligation.amount === null
                        ? null
                        : labels.amount(formatAmount(obligation.amount)),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    {obligation.overdue ? (
                      <span className="font-semibold text-danger"> · {labels.overdue}</span>
                    ) : null}
                  </span>
                  {obligation.reminder_sent_at === null ? null : (
                    <span className="text-note text-muted">
                      {labels.reminder(formatTimestampDate(obligation.reminder_sent_at))}
                    </span>
                  )}
                  {obligation.notes === null ? null : (
                    <span className="text-note">{obligation.notes}</span>
                  )}
                </span>
                <span className="flex items-center gap-2">
                  <StatusBadge domain="obligation" status={obligation.status} />
                  <Button
                    variant="secondary"
                    size="sm"
                    aria-label={labels.edit(obligation.label)}
                    onClick={() => {
                      setEditing(obligation);
                    }}
                  >
                    <Pencil aria-hidden="true" />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {editing === null ? null : (
        <CenterObligationDialog
          obligation={editing === 'new' ? null : editing}
          onClose={() => {
            setEditing(null);
          }}
        />
      )}
    </Card>
  );
}
