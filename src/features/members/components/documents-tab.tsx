import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { ActionMenu } from '@/components/shared/action-menu';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { FormDialog } from '@/components/shared/form-dialog';
import { StatusBadge } from '@/components/shared/status-badge';
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
import { useAuth } from '@/features/auth/session/auth-context';
import {
  dossierApi,
  UPLOAD_CATEGORIES,
  type MemberDocument,
} from '@/features/members/api/dossier-api';
import type { Member } from '@/features/members/api/members-api';
import { dossierKeys } from '@/features/members/api/queries';
import { ApiBusinessError } from '@/lib/api-errors';
import { config } from '@/lib/config';
import { formatTimestampDate } from '@/lib/format';
import { showValidationErrors } from '@/lib/form-errors';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';
import { permissionCodes } from '@/lib/reference/permissions';

/*
 * Onglet « Documents » du dossier (F-DOC-01 à 05, 03-APPFLOW §4.3) : liste (type, n°, date, statut,
 * PDF, Word) ; une ligne « en cours de production » se relit jusqu'à ce que le document soit prêt
 * (toast « … prêt ») ; menu de ligne : Annuler (motif, F-DOC-03), Rééditer (RG-ADH-07, RG-DOC-06),
 * Relancer un échec. Produire le contrat ou l'attestation, déposer un document du CGA (F-DOC-05).
 */
const labels = fr.members.documents;

function DocumentRow({
  document,
  onCancel,
  onAction,
}: {
  document: MemberDocument;
  onCancel: () => void;
  onAction: (action: 'retry' | 'regenerate') => void;
}) {
  const generating = document.status === 'generating';
  const items = [
    ...(document.can.regenerate
      ? [
          {
            label: labels.regenerate,
            onSelect: () => {
              onAction('regenerate');
            },
          },
        ]
      : []),
    ...(document.can.retry
      ? [
          {
            label: labels.retry,
            onSelect: () => {
              onAction('retry');
            },
          },
        ]
      : []),
    ...(document.can.cancel
      ? [{ label: labels.cancel.action, danger: true, onSelect: onCancel }]
      : []),
  ];

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="grid gap-1">
        <span className="font-semibold">{document.title}</span>
        <span className="flex flex-wrap items-center gap-2 text-note text-muted">
          {generating ? (
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
          ) : null}
          <StatusBadge domain="document" status={document.status} />
          {document.number ?? null}
          {document.issued_at !== null ? ` · ${formatTimestampDate(document.issued_at)}` : null}
          {document.version > 1 ? ` · ${labels.version(String(document.version))}` : null}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {document.files.pdf ? (
          <Button variant="link" asChild>
            <a href={document.files.pdf.url} target="_blank" rel="noreferrer">
              {labels.pdf}
            </a>
          </Button>
        ) : null}
        {document.files.docx ? (
          <Button variant="link" asChild>
            <a href={document.files.docx.url} target="_blank" rel="noreferrer">
              {labels.docx}
            </a>
          </Button>
        ) : null}
        <ActionMenu label={labels.rowActions(document.title)} items={items} />
      </div>
    </li>
  );
}

function UploadDialog({ member, onClose }: { member: Member; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | undefined>();
  const [conflict, setConflict] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<{ title: string; category: string }>({
    defaultValues: { title: '', category: 'other' },
  });
  const text = labels.upload;

  const submit = handleSubmit(async (values) => {
    let invalid = false;

    if (values.title.trim() === '') {
      setError('title', { message: fr.members.create.errors.required });
      invalid = true;
    }

    setFileError(file === null ? fr.members.create.errors.required : undefined);

    if (invalid || file === null) {
      return;
    }

    setConflict(null);

    try {
      await dossierApi.upload(member.id, {
        title: values.title.trim(),
        category: values.category,
        file,
      });
      toast.success(text.done);
      await queryClient.invalidateQueries({ queryKey: dossierKeys.documents(member.id) });
      onClose();
    } catch (error) {
      if (error instanceof ApiBusinessError) {
        setConflict(error.message);
      } else if (
        !showValidationErrors(
          error,
          (field, fieldError) => {
            // Le fichier n'est pas un champ du formulaire : son erreur va sous le sélecteur.
            if (field === ('file' as 'title')) {
              setFileError(fieldError.message);
            } else {
              setError(field as 'title' | 'category', fieldError);
            }
          },
          { title: 'title', category: 'category', file: 'file' as 'title' },
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
      submitLabel={text.submit}
      submitting={isSubmitting}
      onSubmit={submit}
      conflict={conflict}
    >
      <TextField
        id="upload-title"
        label={text.name}
        required
        error={errors.title?.message}
        {...register('title')}
      />
      <FormField
        id="upload-category"
        label={text.category}
        required
        error={errors.category?.message}
      >
        <Select
          {...fieldProps('upload-category', errors.category?.message)}
          {...register('category')}
        >
          {UPLOAD_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {text.categories[category]}
            </option>
          ))}
        </Select>
      </FormField>
      <FileField
        id="upload-file"
        label={text.file}
        required
        hint={text.fileHint}
        accept="application/pdf"
        error={fileError}
        onChange={setFile}
      />
    </FormDialog>
  );
}

function CancelDocumentDialog({
  member,
  document,
  onClose,
}: {
  member: Member;
  document: MemberDocument;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [conflict, setConflict] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<{ reason: string }>({ defaultValues: { reason: '' } });
  const text = labels.cancel;

  const submit = handleSubmit(async ({ reason }) => {
    if (reason.trim() === '') {
      setError('reason', { message: fr.members.create.errors.required });

      return;
    }

    setConflict(null);

    try {
      await dossierApi.documentAction(document.id, 'cancel', reason.trim());
      toast.success(text.done);
      await queryClient.invalidateQueries({ queryKey: dossierKeys.documents(member.id) });
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
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title={text.title}
      description={document.title}
      submitLabel={text.submit}
      submitting={isSubmitting}
      onSubmit={submit}
      conflict={conflict}
      effects={text.effects}
    >
      <FormField
        id="cancel-document-reason"
        label={text.reason}
        required
        error={errors.reason?.message}
      >
        <Textarea
          {...fieldProps('cancel-document-reason', errors.reason?.message)}
          aria-required
          {...register('reason')}
        />
      </FormField>
    </ConfirmDialog>
  );
}

export function DocumentsTab({ member }: { member: Member }) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const documents = useQuery({
    queryKey: dossierKeys.documents(member.id),
    queryFn: () => dossierApi.documents(member.id),
    // Une production en cours se relit jusqu'à ce que le document soit prêt (RG-DOC-05).
    refetchInterval: (query) =>
      (query.state.data ?? []).some((document) => document.status === 'generating')
        ? config.documentPollMs
        : false,
  });
  const [uploading, setUploading] = useState(false);
  const [cancelling, setCancelling] = useState<MemberDocument | null>(null);
  const [busy, setBusy] = useState(false);
  const generating = useRef(new Set<string>());
  const produces = can(permissionCodes.cga.documentsProduce) && member.status !== 'draft';
  const cga = member.portfolio === 'cga';

  // « Contrat prêt » : un document en cours de production passe à « valide ».
  useEffect(() => {
    for (const document of documents.data ?? []) {
      if (document.status === 'generating') {
        generating.current.add(document.id);
      } else if (generating.current.has(document.id)) {
        generating.current.delete(document.id);

        if (document.status === 'valid') {
          toast.success(labels.ready(document.type_label));
        } else if (document.status === 'failed') {
          toast.error(labels.failed(document.type_label));
        }
      }
    }
  }, [documents.data]);

  async function run(call: () => Promise<MemberDocument>, done: string) {
    setBusy(true);

    try {
      const document = await call();

      generating.current.add(document.id);
      toast.success(done);
      await queryClient.invalidateQueries({ queryKey: dossierKeys.documents(member.id) });
    } catch (error) {
      if (error instanceof ApiBusinessError) {
        toast.error(error.message);
      } else {
        toastUnexpectedError(error);
      }
    } finally {
      setBusy(false);
    }
  }

  const actions = produces ? (
    <ActionMenu
      label={labels.menu}
      items={[
        ...(cga
          ? [
              {
                label: labels.produceContract,
                onSelect: () =>
                  void run(
                    () => dossierApi.produce(member.id, 'membership_contract'),
                    labels.producing,
                  ),
              },
              {
                label: labels.produceCertificate,
                onSelect: () =>
                  void run(
                    () => dossierApi.produce(member.id, 'membership_certificate'),
                    labels.producing,
                  ),
              },
            ]
          : []),
        {
          label: labels.upload.action,
          onSelect: () => {
            setUploading(true);
          },
        },
      ]}
    />
  ) : null;

  let body;

  if (documents.isPending) {
    body = <Skeleton className="h-5 w-full" />;
  } else if (documents.isError) {
    body = (
      <Banner
        tone="danger"
        action={
          <Button variant="secondary" size="sm" onClick={() => void documents.refetch()}>
            {fr.common.retry}
          </Button>
        }
      >
        {labels.loadError}
      </Banner>
    );
  } else if (documents.data.length === 0) {
    body = <EmptyState icon={FileText}>{labels.empty}</EmptyState>;
  } else {
    body = (
      <ul
        aria-label={labels.caption}
        aria-busy={busy || undefined}
        className="divide-y divide-border"
      >
        {documents.data.map((document) => (
          <DocumentRow
            key={document.id}
            document={document}
            onCancel={() => {
              setCancelling(document);
            }}
            onAction={(action) =>
              void run(
                () => dossierApi.documentAction(document.id, action),
                action === 'retry' ? labels.retried : labels.regenerated,
              )
            }
          />
        ))}
      </ul>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{labels.caption}</CardTitle>
        {actions}
      </CardHeader>
      <CardContent>{body}</CardContent>
      {uploading ? (
        <UploadDialog
          member={member}
          onClose={() => {
            setUploading(false);
          }}
        />
      ) : null}
      {cancelling !== null ? (
        <CancelDocumentDialog
          member={member}
          document={cancelling}
          onClose={() => {
            setCancelling(null);
          }}
        />
      ) : null}
    </Card>
  );
}
