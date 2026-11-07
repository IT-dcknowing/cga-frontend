import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { FormDialog } from '@/components/shared/form-dialog';
import { fieldProps } from '@/components/ui/field-props';
import { DOCUMENT_TYPES } from '@/components/ui/file-field';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { TextField } from '@/components/ui/text-field';
import { Textarea } from '@/components/ui/textarea';
import {
  CONCERN_CATEGORIES,
  concernKeys,
  concernsApi,
  type Concern,
  type ConcernStatus,
} from '@/features/concerns/api/concerns-api';
import { ApiBusinessError, ApiValidationError } from '@/lib/api-errors';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';

/*
 * Modales des préoccupations (03-APPFLOW §3.2, §4.3, §5.2, étape 7.4) : nouvelle demande (centre →
 * CNCGA, adhérent → CGA), changement de statut (motif obligatoire pour un rejet), transmission au CNCGA
 * (F-PRE-03), demande de document (F-DOC-06). Le serveur refait chaque contrôle.
 */
const labels = fr.concerns;
const required = fr.members.create.errors.required;

type Errors = Record<string, string | undefined>;

/** Erreurs de champ (422, pièces jointes regroupées), conflit (409) ou toast. */
function useSubmit() {
  const queryClient = useQueryClient();
  const [errors, setErrors] = useState<Errors>({});
  const [conflict, setConflict] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function run<T>(action: () => Promise<T>): Promise<T | null> {
    setConflict(null);
    setSubmitting(true);
    try {
      const result = await action();

      await queryClient.invalidateQueries({ queryKey: concernKeys.all });

      return result;
    } catch (error) {
      if (error instanceof ApiValidationError) {
        setErrors(
          Object.fromEntries(
            Object.entries(error.fields).map(([key, message]) => [
              key.startsWith('attachments') ? 'attachments' : key,
              message,
            ]),
          ),
        );
      } else if (error instanceof ApiBusinessError) {
        setConflict(error.message);
      } else {
        toastUnexpectedError(error);
      }

      return null;
    } finally {
      setSubmitting(false);
    }
  }

  return { errors, setErrors, conflict, submitting, run };
}

function FilesField({
  id,
  error,
  onChange,
}: {
  id: string;
  error?: string;
  onChange: (files: File[]) => void;
}) {
  return (
    <FormField id={id} label={labels.create.files} error={error}>
      <Input
        {...fieldProps(id, error, false)}
        type="file"
        multiple
        accept={DOCUMENT_TYPES}
        onChange={(event) => {
          onChange(Array.from(event.target.files ?? []));
        }}
      />
    </FormField>
  );
}

function closeOn(onClose: () => void) {
  return (open: boolean) => {
    if (!open) {
      onClose();
    }
  };
}

/** « Écrire au CNCGA » (centre) ou « Nouvelle demande » (adhérent). */
export function NewConcernDialog({
  space,
  onClose,
  onCreated,
}: {
  space: 'cga' | 'member';
  onClose: () => void;
  onCreated: (concern: Concern) => void;
}) {
  const text = labels.create;
  const [category, setCategory] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const { errors, setErrors, conflict, submitting, run } = useSubmit();
  // Toutes les catégories du serveur (`ConcernCategory`) : aucune n'est réservée à un espace.
  const categories = CONCERN_CATEGORIES;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const missing: Errors = {
      category: category === '' ? required : undefined,
      subject: subject.trim() === '' ? required : undefined,
      message: message.trim() === '' ? required : undefined,
    };

    setErrors(missing);
    if (Object.values(missing).some((value) => value !== undefined)) {
      return;
    }
    const created = await run(() =>
      concernsApi.create(space, {
        category,
        subject: subject.trim(),
        message: message.trim(),
        files,
      }),
    );

    if (created !== null) {
      onCreated(created);
    }
  }

  return (
    <FormDialog
      open
      onOpenChange={closeOn(onClose)}
      title={space === 'cga' ? text.cgaTitle : text.title}
      submitLabel={text.submit}
      submitting={submitting}
      onSubmit={(event) => void submit(event)}
      conflict={conflict}
    >
      <FormField id="concern-category" label={text.category} required error={errors.category}>
        <Select
          id="concern-category"
          value={category}
          onChange={(event) => {
            setCategory(event.target.value);
          }}
        >
          <option value="" />
          {categories.map((value) => (
            <option key={value} value={value}>
              {labels.categories[value]}
            </option>
          ))}
        </Select>
      </FormField>
      <TextField
        id="concern-subject"
        label={text.subject}
        required
        value={subject}
        error={errors.subject}
        onChange={(event) => {
          setSubject(event.target.value);
        }}
      />
      <FormField id="concern-message" label={text.message} required error={errors.message}>
        <Textarea
          {...fieldProps('concern-message', errors.message, false)}
          value={message}
          onChange={(event) => {
            setMessage(event.target.value);
          }}
        />
      </FormField>
      <FilesField id="concern-files" error={errors.attachments} onChange={setFiles} />
    </FormDialog>
  );
}

export function StatusDialog({
  space,
  concern,
  onClose,
}: {
  space: 'cga' | 'network';
  concern: Concern;
  onClose: () => void;
}) {
  const text = labels.status;
  const targets: ConcernStatus[] = (['in_review', 'resolved', 'rejected'] as const).filter(
    (status) => status !== concern.status,
  );
  const [status, setStatus] = useState<ConcernStatus>(targets[0]);
  const [reason, setReason] = useState('');
  const { errors, setErrors, conflict, submitting, run } = useSubmit();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === 'rejected' && reason.trim() === '') {
      setErrors({ reason: required });

      return;
    }
    const updated = await run(() =>
      concernsApi.changeStatus(space, concern.id, status, reason.trim()),
    );

    if (updated !== null) {
      toast.success(text.done(labels.statuses[updated.status] ?? updated.status_label));
      onClose();
    }
  }

  return (
    <FormDialog
      open
      onOpenChange={closeOn(onClose)}
      title={text.title}
      description={concern.subject}
      submitLabel={text.submit}
      submitting={submitting}
      onSubmit={(event) => void submit(event)}
      conflict={conflict}
    >
      <FormField id="concern-status" label={text.status} required error={errors.status}>
        <Select
          id="concern-status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as ConcernStatus);
          }}
        >
          {targets.map((value) => (
            <option key={value} value={value}>
              {labels.statuses[value]}
            </option>
          ))}
        </Select>
      </FormField>
      {status === 'rejected' ? (
        <FormField id="concern-reason" label={text.reason} required error={errors.reason}>
          <Textarea
            {...fieldProps('concern-reason', errors.reason, false)}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
            }}
          />
        </FormField>
      ) : null}
    </FormDialog>
  );
}

export function TransferDialog({ concern, onClose }: { concern: Concern; onClose: () => void }) {
  const text = labels.transfer;
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const { errors, setErrors, conflict, submitting, run } = useSubmit();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (message.trim() === '') {
      setErrors({ message: required });

      return;
    }
    const updated = await run(() =>
      concernsApi.transfer(concern.id, { message: message.trim(), files }),
    );

    if (updated !== null) {
      toast.success(text.done);
      onClose();
    }
  }

  return (
    <FormDialog
      open
      onOpenChange={closeOn(onClose)}
      title={text.title}
      description={text.description}
      submitLabel={text.submit}
      submitting={submitting}
      onSubmit={(event) => void submit(event)}
      conflict={conflict}
    >
      <FormField id="transfer-message" label={text.message} required error={errors.message}>
        <Textarea
          {...fieldProps('transfer-message', errors.message, false)}
          value={message}
          onChange={(event) => {
            setMessage(event.target.value);
          }}
        />
      </FormField>
      <FilesField id="transfer-files" error={errors.attachments} onChange={setFiles} />
    </FormDialog>
  );
}

export function DocumentRequestDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (concern: Concern) => void;
}) {
  const text = labels.document;
  const [type, setType] = useState('attestation');
  const [message, setMessage] = useState('');
  const { errors, setErrors, conflict, submitting, run } = useSubmit();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (type === 'other' && message.trim() === '') {
      setErrors({ message: required });

      return;
    }
    const created = await run(() => concernsApi.requestDocument(type, message));

    if (created !== null) {
      toast.success(text.done);
      onCreated(created);
    }
  }

  return (
    <FormDialog
      open
      onOpenChange={closeOn(onClose)}
      title={text.title}
      submitLabel={text.submit}
      submitting={submitting}
      onSubmit={(event) => void submit(event)}
      conflict={conflict}
    >
      <FormField id="document-type" label={text.type} required error={errors.type}>
        <Select
          id="document-type"
          value={type}
          onChange={(event) => {
            setType(event.target.value);
          }}
        >
          {Object.entries(text.types).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField
        id="document-message"
        label={text.message}
        hint={text.messageHint}
        error={errors.message}
      >
        <Textarea
          {...fieldProps('document-message', errors.message, true)}
          value={message}
          onChange={(event) => {
            setMessage(event.target.value);
          }}
        />
      </FormField>
    </FormDialog>
  );
}
