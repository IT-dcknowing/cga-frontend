import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Database, Download, Upload } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ActionMenu, type ActionMenuItem } from '@/components/shared/action-menu';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { FormDialog } from '@/components/shared/form-dialog';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileField } from '@/components/ui/file-field';
import { Radio, RadioGroupField, RadioOption } from '@/components/ui/radio';
import { Skeleton } from '@/components/ui/skeleton';
import {
  IMPORT_MODES,
  referenceDataApi,
  referenceDataKeys,
  type ImportMode,
  type ImportPreview,
  type ReferenceDataset,
} from '@/features/reference-data/api/reference-data-api';
import { referentialKeys } from '@/features/referentials/api/referentials-api';
import { DataStatusBadge } from '@/features/referentials/components/referential-panel';
import { ApiBusinessError } from '@/lib/api-errors';
import { saveBlob } from '@/lib/download';
import { formatNumber } from '@/lib/format';
import { showValidationErrors } from '@/lib/form-errors';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';

/*
 * Onglet « Données de référence » de `/plateforme` (RG-DATA-01, 02, 03-APPFLOW §6) : pour chaque
 * jeu, nombre d'éléments et badge « provisoire » / « validé » ; modèle Excel ; import « mettre à
 * jour » ou « remplacer » avec aperçu des changements avant confirmation (rien n'est écrit avant
 * « Appliquer ») ; « Marquer comme validé ». Le serveur analyse le fichier par son contenu.
 */
const labels = fr.referenceData;
const text = labels.importDialog;

function display(value: unknown): string {
  return value === null || value === undefined || value === '' ? '—' : String(value);
}

function Preview({ preview }: { preview: ImportPreview }) {
  const entries = Object.entries(preview.summary).filter(([, count]) => count > 0);

  return (
    <section aria-label={text.previewTitle} className="grid gap-3">
      <h3 className="text-label font-semibold">{text.previewTitle}</h3>
      {entries.length === 0 ? (
        <p className="text-note text-muted">{text.nothing}</p>
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-table">
          {entries.map(([key, count]) => (
            <div key={key} className="contents">
              <dt className="text-muted">{text.summary[key]}</dt>
              <dd className="font-semibold">{formatNumber(count)}</dd>
            </div>
          ))}
        </dl>
      )}
      {preview.updates.length > 0 ? (
        <div className="grid gap-1">
          <p className="text-label font-semibold text-muted">{text.updatesTitle}</p>
          <ul className="grid gap-1 text-note">
            {preview.updates.map((update) => (
              <li key={`${String(update.row)}-${update.key}`}>
                {text.row(String(update.row), update.label)} :{' '}
                {Object.entries(update.changes)
                  .map(([field, change]) =>
                    text.change(field, display(change.before), display(change.after)),
                  )
                  .join(' ; ')}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {preview.removals.length > 0 ? (
        <div className="grid gap-1">
          <p className="text-label font-semibold text-muted">{text.removalsTitle}</p>
          <ul className="grid gap-1 text-note">
            {preview.removals.map((removal) => (
              <li key={removal.id}>
                {removal.label} — {removal.action_label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {preview.rejected.length > 0 ? (
        <div role="alert" className="grid gap-1">
          <p className="text-label font-semibold text-danger">{text.rejectedTitle}</p>
          <ul className="grid gap-1 text-note text-danger">
            {preview.rejected.map((row) => (
              <li key={row.row}>
                {text.row(String(row.row), row.label)} : {row.messages.join(' ')}
              </li>
            ))}
          </ul>
          <p className="text-note text-muted">{text.rejectedNote}</p>
        </div>
      ) : null}
      {preview.warnings.length > 0 ? (
        <div className="grid gap-1">
          <p className="text-label font-semibold text-muted">{text.warningsTitle}</p>
          <ul className="grid gap-1 text-note">
            {preview.warnings.map((row) => (
              <li key={row.row}>
                {text.row(String(row.row), row.label)} : {row.messages.join(' ')}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function ImportDialog({ dataset, onClose }: { dataset: ReferenceDataset; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<ImportMode>('update');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | undefined>();
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function analyse() {
    if (file === null) {
      setFileError(fr.members.create.errors.required);

      return;
    }

    setBusy(true);
    setConflict(null);

    try {
      setPreview(await referenceDataApi.preview(dataset.dataset, file, mode));
    } catch (error) {
      if (error instanceof ApiBusinessError) {
        setConflict(error.message);
      } else if (
        !showValidationErrors(
          error,
          (_field, fieldError) => {
            setFileError(fieldError.message);
          },
          { file: 'file', mode: 'file' },
        )
      ) {
        toastUnexpectedError(error);
      }
    } finally {
      setBusy(false);
    }
  }

  async function apply(analysed: ImportPreview) {
    setBusy(true);
    setConflict(null);

    try {
      await referenceDataApi.apply(dataset.dataset, analysed.file_id ?? '', analysed.mode);
      toast.success(text.applied);
      await queryClient.invalidateQueries({ queryKey: referenceDataKeys.all });
      await queryClient.invalidateQueries({ queryKey: referentialKeys.all });
      onClose();
    } catch (error) {
      setBusy(false);

      if (error instanceof ApiBusinessError) {
        setConflict(error.message);
      } else {
        toastUnexpectedError(error);
      }
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
      title={text.title(dataset.label)}
      submitLabel={preview === null ? text.analyse : text.apply}
      submitting={busy}
      onSubmit={(event) => {
        event.preventDefault();
        void (preview === null ? analyse() : apply(preview));
      }}
      conflict={conflict}
    >
      <RadioGroupField id="reference-mode" legend={text.mode} required>
        <div className="grid gap-2">
          {IMPORT_MODES.map((option) => (
            <RadioOption key={option} label={text.modes[option]}>
              <Radio
                name="reference-mode"
                value={option}
                checked={mode === option}
                disabled={preview !== null}
                onChange={() => {
                  setMode(option);
                }}
              />
            </RadioOption>
          ))}
        </div>
      </RadioGroupField>
      <FileField
        id="reference-file"
        label={text.file}
        hint={text.fileHint}
        required
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        disabled={preview !== null}
        error={fileError}
        onChange={(chosen) => {
          setFile(chosen);
          setFileError(undefined);
        }}
      />
      {preview !== null ? <Preview preview={preview} /> : null}
    </FormDialog>
  );
}

function ValidateDialog({ dataset, onClose }: { dataset: ReferenceDataset; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [conflict, setConflict] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setConflict(null);

    try {
      const count = await referenceDataApi.validate(dataset.dataset);

      toast.success(labels.validated(formatNumber(count)));
      await queryClient.invalidateQueries({ queryKey: referenceDataKeys.all });
      await queryClient.invalidateQueries({ queryKey: referentialKeys.all });
      onClose();
    } catch (error) {
      setBusy(false);

      if (error instanceof ApiBusinessError) {
        setConflict(error.message);
      } else {
        toastUnexpectedError(error);
      }
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
      title={labels.validateDialog.title}
      description={dataset.label}
      submitLabel={labels.validateDialog.submit}
      submitting={busy}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      conflict={conflict}
      effects={labels.validateDialog.effects}
    >
      {null}
    </ConfirmDialog>
  );
}

type Dialog = { name: 'import' | 'validate'; dataset: ReferenceDataset };

export function ReferenceDataPanel() {
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const query = useQuery({
    queryKey: referenceDataKeys.all,
    queryFn: () => referenceDataApi.datasets(),
  });

  async function download(dataset: ReferenceDataset) {
    try {
      const { blob, fileName } = await referenceDataApi.template(dataset.dataset);

      saveBlob(blob, fileName);
    } catch (error) {
      toastUnexpectedError(error);
    }
  }

  function actions(dataset: ReferenceDataset): ActionMenuItem[] {
    if (!dataset.can.manage) {
      return [];
    }

    return [
      {
        label: labels.template,
        onSelect: () => void download(dataset),
      },
      {
        label: labels.import,
        onSelect: () => {
          setDialog({ name: 'import', dataset });
        },
      },
      ...(dataset.provisional_count > 0
        ? [
            {
              label: labels.validate,
              onSelect: () => {
                setDialog({ name: 'validate', dataset });
              },
            },
          ]
        : []),
    ];
  }

  let body;

  if (query.isPending) {
    body = <Skeleton className="h-24 w-full" />;
  } else if (query.isError) {
    body = (
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
    );
  } else if (query.data.length === 0) {
    body = <EmptyState icon={Database}>{labels.loadError}</EmptyState>;
  } else {
    body = (
      <ul aria-label={labels.caption} className="divide-y divide-border">
        {query.data.map((dataset) => (
          <li
            key={dataset.dataset}
            className="flex flex-wrap items-center justify-between gap-3 py-3"
          >
            <span className="grid gap-0.5">
              <span className="font-semibold">{dataset.label}</span>
              <span className="text-note text-muted">
                {labels.count(formatNumber(dataset.count))}
                {dataset.provisional_count > 0
                  ? ` · ${labels.provisional(formatNumber(dataset.provisional_count))}`
                  : null}
              </span>
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <DataStatusBadge status={dataset.status} />
              <ActionMenu
                label={fr.referentials.rowActions(dataset.label)}
                items={actions(dataset)}
              />
            </span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{labels.title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="flex items-center gap-2 text-note text-muted">
          <Download className="size-4" aria-hidden="true" />
          <Upload className="size-4" aria-hidden="true" />
          {labels.intro}
        </p>
        {body}
      </CardContent>
      {dialog?.name === 'import' ? (
        <ImportDialog
          dataset={dialog.dataset}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
      {dialog?.name === 'validate' ? (
        <ValidateDialog
          dataset={dialog.dataset}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
    </Card>
  );
}
