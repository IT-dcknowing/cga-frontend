import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { FormDialog } from '@/components/shared/form-dialog';
import { FileField } from '@/components/ui/file-field';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { TextField } from '@/components/ui/text-field';
import {
  CLOSING_DELIVERABLES,
  CLOSING_STEPS,
  closingApi,
  closingKeys,
  type ClosingDeliverable,
  type ClosingItem,
  type ClosingStep,
  type SkippedItem,
} from '@/features/closing/api/closing-api';
import { ApiBusinessError, ApiValidationError } from '@/lib/api-errors';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';

/*
 * Modales de la campagne de clôture (03-APPFLOW §4.3, décision 0006) : « Marquer l'étape faite » d'un
 * dossier (date ; dépôt légal : référence et accusé), livrable et agent, et actions groupées (étape
 * faite, affectation). Le serveur refait chaque contrôle : ordre des étapes, campagne ouverte, droits.
 */
const labels = fr.closing;
const required = fr.members.create.errors.required;

/** Date du jour au format de l'API (AAAA-MM-JJ). */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

type Errors = Record<string, string | undefined>;

/** Erreurs de champ (422) ou conflit métier (409) ; une autre erreur part en toast. */
function handleError(
  error: unknown,
  setErrors: (errors: Errors) => void,
  setConflict: (message: string) => void,
) {
  if (error instanceof ApiValidationError) {
    setErrors(error.fields);
  } else if (error instanceof ApiBusinessError) {
    setConflict(error.message);
  } else {
    toastUnexpectedError(error);
  }
}

function useRefresh() {
  const queryClient = useQueryClient();

  return () => queryClient.invalidateQueries({ queryKey: closingKeys.all });
}

export function MarkStepDialog({
  item,
  step,
  onClose,
}: {
  item: ClosingItem;
  step: ClosingStep;
  onClose: () => void;
}) {
  const refresh = useRefresh();
  const [doneOn, setDoneOn] = useState(today());
  const [reference, setReference] = useState('');
  const [receipt, setReceipt] = useState<File | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [conflict, setConflict] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const label = labels.steps[step] ?? step;
  const filing = step === 'filing';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const missing: Errors = {
      done_on: doneOn === '' ? required : undefined,
      reference: filing && reference.trim() === '' ? required : undefined,
      receipt: filing && receipt === null ? required : undefined,
    };

    setErrors(missing);
    if (Object.values(missing).some((message) => message !== undefined)) {
      return;
    }

    setConflict(null);
    setSubmitting(true);
    try {
      await closingApi.markStep(item.campaign.id, item.id, step, {
        doneOn,
        reference: filing ? reference.trim() : undefined,
        receipt: filing ? receipt : undefined,
      });
      toast.success(labels.mark.done(label));
      await refresh();
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
      title={labels.mark.title(label)}
      description={item.member?.company_name}
      submitLabel={labels.mark.submit}
      submitting={submitting}
      onSubmit={(event) => void submit(event)}
      conflict={conflict}
    >
      <FormField id="closing-done-on" label={labels.mark.doneOn} required error={errors.done_on}>
        <Input
          id="closing-done-on"
          type="date"
          max={today()}
          value={doneOn}
          aria-invalid={errors.done_on !== undefined || undefined}
          onChange={(event) => {
            setDoneOn(event.target.value);
          }}
        />
      </FormField>
      {filing ? (
        <>
          <TextField
            id="closing-reference"
            label={labels.mark.reference}
            required
            value={reference}
            error={errors.reference}
            onChange={(event) => {
              setReference(event.target.value);
            }}
          />
          <FileField
            id="closing-receipt"
            label={labels.mark.receipt}
            required
            error={errors.receipt}
            onChange={(file) => {
              setReceipt(file);
            }}
          />
        </>
      ) : null}
    </FormDialog>
  );
}

export function EditItemDialog({ item, onClose }: { item: ClosingItem; onClose: () => void }) {
  const refresh = useRefresh();
  const agents = useQuery({ queryKey: closingKeys.agents, queryFn: () => closingApi.agents() });
  const [deliverable, setDeliverable] = useState<ClosingDeliverable>(item.deliverable);
  const [agent, setAgent] = useState(item.assigned_to?.id ?? '');
  const [errors, setErrors] = useState<Errors>({});
  const [conflict, setConflict] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const text = labels.edit;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConflict(null);
    setSubmitting(true);
    try {
      await closingApi.updateItem(item.campaign.id, item.id, {
        deliverable,
        assignedTo: agent === '' ? null : agent,
      });
      toast.success(text.done);
      await refresh();
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
      title={text.title}
      description={item.member?.company_name}
      submitLabel={text.submit}
      submitting={submitting}
      onSubmit={(event) => void submit(event)}
      conflict={conflict}
    >
      <FormField
        id="closing-deliverable"
        label={text.deliverable}
        required
        error={errors.deliverable}
      >
        <Select
          id="closing-deliverable"
          value={deliverable}
          onChange={(event) => {
            setDeliverable(event.target.value as ClosingDeliverable);
          }}
        >
          {CLOSING_DELIVERABLES.map((value) => (
            <option key={value} value={value}>
              {text.deliverables[value]}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField id="closing-agent" label={text.agent} error={errors.assigned_to}>
        <Select
          id="closing-agent"
          value={agent}
          onChange={(event) => {
            setAgent(event.target.value);
          }}
        >
          <option value="">{text.none}</option>
          {(agents.data ?? []).map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name}
            </option>
          ))}
        </Select>
      </FormField>
    </FormDialog>
  );
}

/** Étapes qu'une action groupée peut marquer : le dépôt légal se fait dossier par dossier. */
const BULK_STEPS = CLOSING_STEPS.filter((step) => step !== 'filing');

export function BulkStepDialog({
  campaignId,
  itemIds,
  onClose,
  onSkipped,
}: {
  campaignId: string;
  itemIds: string[];
  onClose: () => void;
  onSkipped: (skipped: SkippedItem[]) => void;
}) {
  const refresh = useRefresh();
  const [step, setStep] = useState<ClosingStep>(BULK_STEPS[0]);
  const [doneOn, setDoneOn] = useState(today());
  const [errors, setErrors] = useState<Errors>({});
  const [conflict, setConflict] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const text = labels.bulk;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (doneOn === '') {
      setErrors({ done_on: required });

      return;
    }

    setConflict(null);
    setSubmitting(true);
    try {
      const result = await closingApi.bulkStep(campaignId, step, itemIds, doneOn);

      toast.success(text.done(String(result.done.length)));
      onSkipped(result.skipped);
      await refresh();
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
      title={text.stepTitle}
      description={text.stepDescription(String(itemIds.length))}
      submitLabel={labels.mark.submit}
      submitting={submitting}
      onSubmit={(event) => void submit(event)}
      conflict={conflict}
    >
      <FormField id="closing-bulk-step" label={text.step} required hint={text.stepHint}>
        <Select
          id="closing-bulk-step"
          value={step}
          onChange={(event) => {
            setStep(event.target.value as ClosingStep);
          }}
        >
          {BULK_STEPS.map((value) => (
            <option key={value} value={value}>
              {labels.steps[value]}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField
        id="closing-bulk-done-on"
        label={labels.mark.doneOn}
        required
        error={errors.done_on}
      >
        <Input
          id="closing-bulk-done-on"
          type="date"
          max={today()}
          value={doneOn}
          onChange={(event) => {
            setDoneOn(event.target.value);
          }}
        />
      </FormField>
    </FormDialog>
  );
}

export function BulkAssignDialog({
  campaignId,
  itemIds,
  onClose,
}: {
  campaignId: string;
  itemIds: string[];
  onClose: () => void;
}) {
  const refresh = useRefresh();
  const agents = useQuery({ queryKey: closingKeys.agents, queryFn: () => closingApi.agents() });
  const [agent, setAgent] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [conflict, setConflict] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const text = labels.bulk;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConflict(null);
    setSubmitting(true);
    try {
      const assigned = await closingApi.bulkAssign(
        campaignId,
        itemIds,
        agent === '' ? null : agent,
      );

      toast.success(text.assigned(String(assigned.length)));
      await refresh();
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
      title={text.assignTitle}
      description={text.assignDescription(String(itemIds.length))}
      submitLabel={labels.edit.submit}
      submitting={submitting}
      onSubmit={(event) => void submit(event)}
      conflict={conflict}
    >
      <FormField id="closing-bulk-agent" label={labels.edit.agent} error={errors.assigned_to}>
        <Select
          id="closing-bulk-agent"
          value={agent}
          onChange={(event) => {
            setAgent(event.target.value);
          }}
        >
          <option value="">{labels.edit.none}</option>
          {(agents.data ?? []).map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name}
            </option>
          ))}
        </Select>
      </FormField>
    </FormDialog>
  );
}
