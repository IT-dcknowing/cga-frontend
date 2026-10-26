import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileCog, Upload } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { ActionMenu, type ActionMenuItem } from '@/components/shared/action-menu';
import { EmptyState } from '@/components/shared/empty-state';
import { FormDialog } from '@/components/shared/form-dialog';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fieldProps } from '@/components/ui/field-props';
import { FileField } from '@/components/ui/file-field';
import { FormField } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { TextField } from '@/components/ui/text-field';
import { Textarea } from '@/components/ui/textarea';
import {
  templateKeys,
  templatesApi,
  type DocumentTemplate,
} from '@/features/templates/api/templates-api';
import { ApiBusinessError } from '@/lib/api-errors';
import { formatDate, formatNumber } from '@/lib/format';
import { showValidationErrors } from '@/lib/form-errors';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';

/*
 * Onglet « Modèles de documents » de `/plateforme` (F-ADM-02, RG-DATA-03, 03-APPFLOW §6) : versions
 * par type (active, validée par le CNCGA le …, documents émis), contrôle des variables (manquantes,
 * inconnues), « Déposer une version », « Prévisualiser » avec des données de test, « Activer » avec
 * la date de validation du CNCGA. Remplacer un modèle ne touche à aucun document déjà émis.
 */
const labels = fr.templates;

const TEMPLATE_TYPES =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.docx,.xlsx';

type UploadForm = { type: string; version: string; notes: string };

function UploadDialog({
  types,
  onClose,
}: {
  types: { type: string; label: string }[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | undefined>();
  const [conflict, setConflict] = useState<string | null>(null);
  const [checked, setChecked] = useState<DocumentTemplate | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<UploadForm>({
    defaultValues: { type: types[0]?.type ?? '', version: '', notes: '' },
  });
  const text = labels.upload;
  const required = fr.members.create.errors.required;

  const submit = handleSubmit(async (values) => {
    if (checked !== null) {
      onClose();

      return;
    }

    let invalid = false;

    if (values.version.trim() === '') {
      setError('version', { message: required });
      invalid = true;
    }

    setFileError(file === null ? required : undefined);

    if (invalid || file === null) {
      return;
    }

    setConflict(null);

    try {
      const uploaded = await templatesApi.upload({
        type: values.type,
        version: values.version.trim(),
        file,
        notes: values.notes.trim() === '' ? null : values.notes.trim(),
      });

      toast.success(text.done);
      await queryClient.invalidateQueries({ queryKey: templateKeys.all });
      setChecked(uploaded);
    } catch (error) {
      if (error instanceof ApiBusinessError) {
        setConflict(error.message);
      } else if (
        !showValidationErrors(
          error,
          (name, fieldError) => {
            if (name === ('file' as 'version')) {
              setFileError(fieldError.message);
            } else {
              setError(name as keyof UploadForm, fieldError);
            }
          },
          { type: 'type', version: 'version', notes: 'notes', file: 'file' as 'version' },
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
      submitLabel={checked === null ? text.submit : text.finish}
      submitting={isSubmitting}
      onSubmit={submit}
      conflict={conflict}
    >
      {checked === null ? (
        <>
          <FormField id="template-type" label={text.type} required error={errors.type?.message}>
            <Select {...fieldProps('template-type', errors.type?.message)} {...register('type')}>
              {types.map((item) => (
                <option key={item.type} value={item.type}>
                  {item.label}
                </option>
              ))}
            </Select>
          </FormField>
          <TextField
            id="template-version"
            label={text.version}
            hint={text.versionHint}
            required
            error={errors.version?.message}
            {...register('version')}
          />
          <FileField
            id="template-file"
            label={text.file}
            hint={text.fileHint}
            required
            accept={TEMPLATE_TYPES}
            error={fileError}
            onChange={(chosen) => {
              setFile(chosen);
              setFileError(undefined);
            }}
          />
          <FormField id="template-notes" label={text.notes} error={errors.notes?.message}>
            <Textarea
              {...fieldProps('template-notes', errors.notes?.message)}
              {...register('notes')}
            />
          </FormField>
        </>
      ) : (
        <Check template={checked} />
      )}
    </FormDialog>
  );
}

/** Contrôle des variables d'une version (manquantes, inconnues). */
function Check({ template }: { template: DocumentTemplate }) {
  if (template.check.valid) {
    return <Banner tone="success">{labels.checkValid}</Banner>;
  }

  return (
    <Banner tone="danger">
      <span className="grid gap-1">
        <span>{labels.checkInvalid}</span>
        {template.check.missing.length > 0 ? (
          <span>{labels.missing(template.check.missing.join(', '))}</span>
        ) : null}
        {template.check.unknown.length > 0 ? (
          <span>{labels.unknown(template.check.unknown.join(', '))}</span>
        ) : null}
      </span>
    </Banner>
  );
}

function ActivateDialog({
  template,
  onClose,
}: {
  template: DocumentTemplate;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [conflict, setConflict] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<{ approved_on: string }>({ defaultValues: { approved_on: '' } });
  const text = labels.activate;

  const submit = handleSubmit(async ({ approved_on: approvedOn }) => {
    if (approvedOn === '') {
      setError('approved_on', { message: fr.members.create.errors.required });

      return;
    }

    setConflict(null);

    try {
      await templatesApi.activate(template.id, approvedOn);
      toast.success(text.done(template.version));
      await queryClient.invalidateQueries({ queryKey: templateKeys.all });
      onClose();
    } catch (error) {
      if (error instanceof ApiBusinessError) {
        setConflict(error.message);
      } else if (!showValidationErrors(error, setError, { approved_by_cncga_on: 'approved_on' })) {
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
      description={text.description(template.type_label, template.version)}
      submitLabel={text.submit}
      submitting={isSubmitting}
      onSubmit={submit}
      conflict={conflict}
    >
      <TextField
        id="template-approved-on"
        type="date"
        label={text.approvedOn}
        required
        error={errors.approved_on?.message}
        {...register('approved_on')}
      />
    </FormDialog>
  );
}

type Dialog = { name: 'upload' } | { name: 'activate'; template: DocumentTemplate };

export function TemplatesPanel() {
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const query = useQuery({ queryKey: templateKeys.all, queryFn: () => templatesApi.list() });

  async function preview(template: DocumentTemplate) {
    try {
      const file = await templatesApi.preview(template.id);

      window.open(file.url, '_blank', 'noopener');
      toast.success(labels.previewed(template.version));
    } catch (error) {
      if (error instanceof ApiBusinessError) {
        toast.error(error.message);
      } else {
        toastUnexpectedError(error);
      }
    }
  }

  function actions(template: DocumentTemplate): ActionMenuItem[] {
    const items: ActionMenuItem[] = [];

    if (template.can.preview) {
      items.push({ label: labels.preview, onSelect: () => void preview(template) });
    }

    if (template.can.activate) {
      items.push({
        label: labels.activate.action,
        onSelect: () => {
          setDialog({ name: 'activate', template });
        },
      });
    }

    return items;
  }

  const types = [...new Map((query.data ?? []).map((item) => [item.type, item.type_label]))].map(
    ([type, label]) => ({ type, label }),
  );

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
    body = <EmptyState icon={FileCog}>{labels.empty}</EmptyState>;
  } else {
    body = (
      <ul aria-label={labels.caption} className="divide-y divide-border">
        {query.data.map((template) => (
          <li key={template.id} className="grid gap-2 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <span className="grid gap-0.5">
                <span className="font-semibold">
                  {labels.line(template.type_label, template.version)}
                </span>
                <span className="text-note text-muted">
                  {[
                    template.approved_by_cncga_at === null
                      ? labels.notApproved
                      : labels.approved(formatDate(template.approved_by_cncga_at)),
                    template.documents_count === undefined
                      ? null
                      : labels.documents(formatNumber(template.documents_count)),
                    template.notes,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-2">
                {template.is_active ? (
                  <span className="rounded-full bg-primary-soft px-2 py-0.5 text-note font-semibold text-primary-dark">
                    {labels.active}
                  </span>
                ) : null}
                {template.file ? (
                  <Button variant="link" size="sm" asChild>
                    <a href={template.file.url} target="_blank" rel="noreferrer">
                      {labels.download}
                    </a>
                  </Button>
                ) : null}
                <ActionMenu
                  label={labels.rowActions(labels.line(template.type_label, template.version))}
                  items={actions(template)}
                />
              </span>
            </div>
            {template.check.valid ? null : <Check template={template} />}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{labels.title}</CardTitle>
        <Button
          size="sm"
          disabled={types.length === 0}
          onClick={() => {
            setDialog({ name: 'upload' });
          }}
        >
          <Upload aria-hidden="true" />
          {labels.upload.action}
        </Button>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="text-note text-muted">{labels.intro}</p>
        {body}
      </CardContent>
      {dialog?.name === 'upload' ? (
        <UploadDialog
          types={types}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
      {dialog?.name === 'activate' ? (
        <ActivateDialog
          template={dialog.template}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
    </Card>
  );
}
