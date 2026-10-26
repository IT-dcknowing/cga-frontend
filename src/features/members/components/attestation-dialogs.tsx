import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { FormDialog } from '@/components/shared/form-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { fieldProps } from '@/components/ui/field-props';
import { FormField } from '@/components/ui/form-field';
import { Radio, RadioGroupField, RadioOption } from '@/components/ui/radio';
import { Textarea } from '@/components/ui/textarea';
import { dossierApi } from '@/features/members/api/dossier-api';
import type { Member } from '@/features/members/api/members-api';
import { dossierKeys, memberKeys } from '@/features/members/api/queries';
import { ApiBusinessError } from '@/lib/api-errors';
import { formatNumber } from '@/lib/format';
import { showValidationErrors } from '@/lib/form-errors';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';

/*
 * Blocage et déblocage manuels de l'attestation (RG-DOC-10) — jamais automatiques : une alerte en
 * retard (honoraires impayés, régime réel non radié) motive la décision du gérant, qui reste tracée
 * avec son motif. Régénération du contrat et de l'attestation après une modification du dossier
 * (RG-ADH-07) : le CGA décide, les documents déjà émis restent valides.
 */
const labels = fr.members.detail;
const required = fr.members.create.errors.required;

type Props = { member: Member; onClose: () => void };

/** Alerte en retard → motif de blocage proposé (`AttestationBlockTrigger`). */
const ALERT_TRIGGERS: Record<string, string> = {
  fees_overdue: 'fees_overdue',
  radiation_required: 'rsi_overdue',
};

function useRefresh(member: Member) {
  const queryClient = useQueryClient();

  return async () => {
    await queryClient.invalidateQueries({ queryKey: memberKeys.detail(member.id) });
  };
}

export function BlockAttestationDialog({ member, onClose }: Props) {
  const refresh = useRefresh(member);
  const [conflict, setConflict] = useState<string | null>(null);
  const triggers = [
    ...member.alerts
      .filter((alert) => alert.overdue && alert.code in ALERT_TRIGGERS)
      .map((alert) => ALERT_TRIGGERS[alert.code]),
    'manual',
  ];
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<{ trigger: string; reason: string }>({
    defaultValues: { trigger: triggers[0], reason: '' },
  });
  const text = labels.blockDialog;

  const submit = handleSubmit(async ({ trigger, reason }) => {
    if (reason.trim() === '') {
      setError('reason', { message: required });

      return;
    }

    setConflict(null);

    try {
      await dossierApi.blockAttestation(member.id, { trigger, reason: reason.trim() });
      toast.success(text.done);
      await refresh();
      onClose();
    } catch (error) {
      if (error instanceof ApiBusinessError) {
        setConflict(error.message);
      } else if (!showValidationErrors(error, setError, { trigger: 'trigger', reason: 'reason' })) {
        toastUnexpectedError(error);
      }
    }
  });

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title={text.title}
      description={member.company_name}
      submitLabel={text.submit}
      submitting={isSubmitting}
      onSubmit={submit}
      conflict={conflict}
      effects={text.effects}
    >
      <RadioGroupField
        id="block-trigger"
        legend={text.trigger}
        required
        error={errors.trigger?.message}
      >
        <div className="grid gap-2">
          {triggers.map((trigger) => (
            <RadioOption key={trigger} label={text.triggers[trigger as 'manual']}>
              <Radio value={trigger} {...register('trigger')} />
            </RadioOption>
          ))}
        </div>
      </RadioGroupField>
      <FormField id="block-reason" label={text.reason} required error={errors.reason?.message}>
        <Textarea
          {...fieldProps('block-reason', errors.reason?.message)}
          aria-required
          {...register('reason')}
        />
      </FormField>
    </ConfirmDialog>
  );
}

export function ReleaseAttestationDialog({ member, onClose }: Props) {
  const refresh = useRefresh(member);
  const [conflict, setConflict] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<{ reason: string }>({ defaultValues: { reason: '' } });
  const text = labels.releaseDialog;

  const submit = handleSubmit(async ({ reason }) => {
    if (reason.trim() === '') {
      setError('reason', { message: required });

      return;
    }

    setConflict(null);

    try {
      await dossierApi.releaseAttestation(member.id, reason.trim());
      toast.success(text.done);
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
      description={member.company_name}
      submitLabel={text.submit}
      submitting={isSubmitting}
      onSubmit={submit}
      conflict={conflict}
    >
      <FormField id="release-reason" label={text.reason} required error={errors.reason?.message}>
        <Textarea
          {...fieldProps('release-reason', errors.reason?.message)}
          aria-required
          {...register('reason')}
        />
      </FormField>
    </FormDialog>
  );
}

/** « Régénérer les documents ? » après une modification du dossier (RG-ADH-07). */
export function RegenerateDocumentsDialog({ member, onClose }: Props) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const text = labels.regenerateDialog;

  async function regenerate() {
    setBusy(true);

    try {
      const documents = await dossierApi.documents(member.id);
      const current = documents.filter((document) => document.can.regenerate);

      for (const document of current) {
        await dossierApi.documentAction(document.id, 'regenerate');
      }

      toast.success(text.done(formatNumber(current.length)));
      await queryClient.invalidateQueries({ queryKey: dossierKeys.documents(member.id) });
      onClose();
    } catch (error) {
      setBusy(false);

      if (error instanceof ApiBusinessError) {
        toast.error(error.message);
      } else {
        toastUnexpectedError(error);
      }
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) {
          onClose();
        }
      }}
    >
      <DialogContent title={text.title} description={text.body}>
        <DialogFooter>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            {text.later}
          </Button>
          <Button loading={busy} onClick={() => void regenerate()}>
            {text.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
