import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { FormDialog } from '@/components/shared/form-dialog';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { FileField } from '@/components/ui/file-field';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { TextField } from '@/components/ui/text-field';
import { Textarea } from '@/components/ui/textarea';
import { reportKeys, reportsApi, type ReportDetail } from '@/features/reports/api/reports-api';
import { ApiBusinessError, ApiValidationError } from '@/lib/api-errors';
import { formatDate } from '@/lib/format';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';

/*
 * Modales de `/cga/rapports/:id` (03-APPFLOW §4.3, F-RPT-03 à 06) : aperçu du rapport avant
 * génération, « Enregistrer la transmission » (date, mode, référence), « Enregistrer l'accusé de
 * réception » (date, référence, fichier), « Corriger » (motif → nouvelle version en brouillon).
 */
const labels = fr.reports;
const required = fr.members.create.errors.required;

type Errors = Record<string, string | undefined>;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Mutation d'une modale : erreurs de champ (422), conflit (409) ou toast ; le rapport est rafraîchi. */
function useSubmit(report: ReportDetail, onClose: () => void) {
  const queryClient = useQueryClient();
  const [errors, setErrors] = useState<Errors>({});
  const [conflict, setConflict] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function run(action: () => Promise<ReportDetail>, done: (updated: ReportDetail) => string) {
    setConflict(null);
    setSubmitting(true);
    try {
      const updated = await action();

      queryClient.setQueryData(reportKeys.detail(report.id), updated);
      await queryClient.invalidateQueries({ queryKey: reportKeys.all });
      toast.success(done(updated));
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

export function PreviewDialog({ report, onClose }: { report: ReportDetail; onClose: () => void }) {
  const text = labels.preview;
  const query = useQuery({
    queryKey: reportKeys.preview(report.id),
    queryFn: () => reportsApi.preview(report.id),
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent size="preview" title={text.title(report.label)}>
        <DialogBody>
          {query.isPending ? (
            <Skeleton className="h-32 w-full" />
          ) : query.isError ? (
            <Banner tone="danger" role="alert">
              {text.loadError}
            </Banner>
          ) : (
            <div className="grid gap-3">
              <p className="font-semibold">{query.data.cga.name}</p>
              <p className="text-note text-muted">
                {text.period(
                  formatDate(query.data.report.period_start),
                  formatDate(query.data.report.period_end),
                )}
              </p>
              <dl className="grid grid-cols-2 gap-2 text-note sm:grid-cols-4">
                {(['active_tee', 'active_rme', 'new_total', 'terminated_total'] as const).map(
                  (column) => (
                    <div key={column} className="grid gap-0.5">
                      <dt className="text-muted">{labels.states.columns[column]}</dt>
                      <dd className="font-semibold">
                        {query.data.states.sheets.summary.totals[column]}
                      </dd>
                    </div>
                  ),
                )}
              </dl>
              {query.data.synthesis === null ? null : (
                <div className="grid gap-1">
                  <p className="text-note font-semibold">{text.synthesis}</p>
                  <p className="whitespace-pre-line text-body">{query.data.synthesis}</p>
                </div>
              )}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {fr.common.close}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TransmitDialog({ report, onClose }: { report: ReportDetail; onClose: () => void }) {
  const text = labels.transmit;
  const [date, setDate] = useState(today());
  const [mode, setMode] = useState('physical');
  const [reference, setReference] = useState('');
  const { errors, setErrors, conflict, submitting, run } = useSubmit(report, onClose);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (date === '') {
      setErrors({ transmitted_on: required });

      return;
    }
    void run(
      () => reportsApi.transmit(report.id, { transmittedOn: date, mode, reference }),
      () => text.done,
    );
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
      description={text.description}
      submitLabel={text.submit}
      submitting={submitting}
      onSubmit={submit}
      conflict={conflict}
    >
      <FormField id="transmit-date" label={text.date} required error={errors.transmitted_on}>
        <Input
          id="transmit-date"
          type="date"
          max={today()}
          value={date}
          onChange={(event) => {
            setDate(event.target.value);
          }}
        />
      </FormField>
      <FormField id="transmit-mode" label={text.mode} required error={errors.mode}>
        <Select
          id="transmit-mode"
          value={mode}
          onChange={(event) => {
            setMode(event.target.value);
          }}
        >
          {Object.entries(text.modes).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </FormField>
      <TextField
        id="transmit-reference"
        label={text.reference}
        value={reference}
        error={errors.reference}
        onChange={(event) => {
          setReference(event.target.value);
        }}
      />
    </FormDialog>
  );
}

export function AcknowledgeDialog({
  report,
  onClose,
}: {
  report: ReportDetail;
  onClose: () => void;
}) {
  const text = labels.acknowledge;
  const [date, setDate] = useState(today());
  const [reference, setReference] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const { errors, setErrors, conflict, submitting, run } = useSubmit(report, onClose);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const missing: Errors = {
      acknowledged_on: date === '' ? required : undefined,
      reference: reference.trim() === '' ? required : undefined,
      file: file === null ? required : undefined,
    };

    setErrors(missing);
    if (file === null || Object.values(missing).some((message) => message !== undefined)) {
      return;
    }
    void run(
      () =>
        reportsApi.acknowledge(report.id, {
          acknowledgedOn: date,
          reference: reference.trim(),
          file,
        }),
      () => text.done,
    );
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
      submitLabel={text.submit}
      submitting={submitting}
      onSubmit={submit}
      conflict={conflict}
    >
      <FormField id="acknowledge-date" label={text.date} required error={errors.acknowledged_on}>
        <Input
          id="acknowledge-date"
          type="date"
          max={today()}
          value={date}
          onChange={(event) => {
            setDate(event.target.value);
          }}
        />
      </FormField>
      <TextField
        id="acknowledge-reference"
        label={text.reference}
        required
        value={reference}
        error={errors.reference}
        onChange={(event) => {
          setReference(event.target.value);
        }}
      />
      <FileField
        id="acknowledge-file"
        label={text.file}
        required
        error={errors.file}
        onChange={(chosen) => {
          setFile(chosen);
        }}
      />
    </FormDialog>
  );
}

export function CorrectDialog({ report, onClose }: { report: ReportDetail; onClose: () => void }) {
  const text = labels.correct;
  const [reason, setReason] = useState('');
  const { errors, setErrors, conflict, submitting, run } = useSubmit(report, onClose);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reason.trim() === '') {
      setErrors({ reason: required });

      return;
    }
    void run(
      () => reportsApi.correct(report.id, reason.trim()),
      (updated) => text.done(String(updated.current_version)),
    );
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
      description={text.description}
      submitLabel={text.submit}
      submitting={submitting}
      onSubmit={submit}
      conflict={conflict}
    >
      <FormField id="correct-reason" label={text.reason} required error={errors.reason}>
        <Textarea
          id="correct-reason"
          value={reason}
          aria-invalid={errors.reason !== undefined || undefined}
          onChange={(event) => {
            setReason(event.target.value);
          }}
        />
      </FormField>
    </FormDialog>
  );
}
